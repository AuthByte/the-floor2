"""Headless shift execution for scheduled runs (platform OpenRouter key only)."""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from app.backend.models.schemas import GraphEdge, GraphNode, HedgeFundRequest
from app.backend.services.entitlements import can_run_shift, increment_shift_count
from app.backend.services.graph import create_graph, parse_hedge_fund_response, run_graph
from app.backend.services.memo_document import build_memo_document
from app.backend.services.portfolio import create_portfolio
from app.backend.services.shift_archive import archive_shift_to_supabase
from app.backend.services.schedule_service import insert_notification, resolve_schedule_tickers
from src.tools.api import get_macro_context
from src.tools.providers.keys import merge_api_keys
from src.utils.agent_artifacts import cleanup_old_runs, set_run_artifact_root
from src.utils.analysts import ANALYST_CONFIG, get_agents_list
from src.utils.persona_registry import default_registry
from src.utils.progress import progress
from src.utils.user_consultation import room_id_for
from src.utils.weather_report import build_weather_reports

logger = logging.getLogger(__name__)

PORTFOLIO_MANAGER_ID = "portfolio_manager_pmoss0"
DEFAULT_SCHEDULED_MODEL = os.getenv("SCHEDULED_SHIFT_MODEL", "openrouter/owl-alpha")


def _platform_api_keys() -> dict[str, str]:
    key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY is required for scheduled shifts")
    return merge_api_keys({"OPENROUTER_API_KEY": key})


def _default_agent_keys() -> list[str]:
    keys = [
        k
        for k in ANALYST_CONFIG
        if k not in {"portfolio_manager", "risk_management_agent", "debate_chamber"}
    ]
    return keys[:8]


def build_graph_payload(enabled_agent_keys: list[str]) -> tuple[list[GraphNode], list[GraphEdge]]:
    agents = get_agents_list()
    name_by_key = {a["key"]: a["display_name"] for a in agents}
    keys = enabled_agent_keys or _default_agent_keys()
    valid_keys = [k for k in keys if k in ANALYST_CONFIG and k not in ("portfolio_manager", "risk_management_agent", "debate_chamber")]

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    for key in valid_keys:
        rid = room_id_for(key)
        nodes.append(GraphNode(id=rid, type="agent-node", data={"name": name_by_key.get(key, key)}))
        edges.append(GraphEdge(id=f"e-{key}-pm", source=rid, target=PORTFOLIO_MANAGER_ID))

    nodes.append(
        GraphNode(
            id=PORTFOLIO_MANAGER_ID,
            type="agent-node",
            data={"name": "Portfolio Manager"},
        )
    )
    return nodes, edges


def execute_shift_headless(
    *,
    user_id: str,
    tickers: list[str],
    enabled_agent_keys: list[str] | None = None,
    model_name: str | None = None,
    initial_cash: float = 100_000,
    run_risk_pipeline: bool = True,
    source: str = "scheduled",
    schedule_id: str | None = None,
) -> dict[str, Any]:
    """Run a full shift without SSE; returns complete payload + run_id."""
    roster_size = len(enabled_agent_keys or _default_agent_keys())
    ok, msg, _paywall = can_run_shift(user_id, roster_size=roster_size)
    if not ok:
        raise RuntimeError(msg or "Shift not allowed on current plan")

    api_keys = _platform_api_keys()
    model = model_name or DEFAULT_SCHEDULED_MODEL
    graph_nodes, graph_edges = build_graph_payload(enabled_agent_keys or [])

    request_data = HedgeFundRequest(
        tickers=tickers,
        graph_nodes=graph_nodes,
        graph_edges=graph_edges,
        model_name=model,
        model_provider="OpenRouter",
        initial_cash=initial_cash,
        margin_requirement=0,
        run_risk_pipeline=run_risk_pipeline,
        execute_alpaca_paper=False,
        api_keys=api_keys,
    )

    portfolio = create_portfolio(initial_cash, 0, tickers, None)
    graph = create_graph(
        graph_nodes=graph_nodes,
        graph_edges=graph_edges,
        analyst_registry=default_registry(),
    ).compile()

    run_id = secrets.token_hex(6)
    set_run_artifact_root(run_id, user_id, None)
    try:
        cleanup_old_runs()
    except Exception as exc:
        logger.warning("Artifact cleanup failed: %s", exc)

    progress.reset_run()
    progress.update_status("system", None, f"Scheduled shift starting ({source})")

    try:
        macro = get_macro_context(request_data.end_date, api_keys)
        if macro.get("available"):
            progress.update_status("macro_feed", None, macro.get("summary", {}).get("headline", "Macro loaded"))
    except Exception as exc:
        logger.warning("Macro prefetch failed: %s", exc)

    t0 = time.perf_counter()
    result = run_graph(
        graph=graph,
        portfolio=portfolio,
        tickers=tickers,
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        model_name=model,
        model_provider="OpenRouter",
        request=request_data,
        run_id=run_id,
        analyst_registry=default_registry(),
    )
    duration_ms = int((time.perf_counter() - t0) * 1000)

    if not result or not result.get("messages"):
        raise RuntimeError("Scheduled shift produced no decisions")

    decisions = parse_hedge_fund_response(result.get("messages", [])[-1].content)
    complete_payload: dict[str, Any] = {
        "decisions": decisions,
        "analyst_signals": result.get("data", {}).get("analyst_signals", {}),
        "current_prices": result.get("data", {}).get("current_prices", {}),
        "ticker_dossiers": result.get("data", {}).get("ticker_dossiers", {}),
        "risk_pipeline": result.get("data", {}).get("risk_pipeline", {}),
        "shift_artifacts": result.get("data", {}).get("shift_artifacts", {}),
        "debate_rounds": result.get("data", {}).get("debate_rounds", []),
        "scheduled": True,
        "schedule_id": schedule_id,
        "source": source,
    }

    try:
        complete_payload["weather_reports"] = build_weather_reports(
            tickers=tickers,
            analyst_signals=complete_payload["analyst_signals"],
            decisions=complete_payload["decisions"],
            dossiers=complete_payload["ticker_dossiers"],
            risk_pipeline=complete_payload["risk_pipeline"],
        )
    except Exception as exc:
        logger.warning("Weather report failed: %s", exc)

    try:
        complete_payload["memo_document"] = build_memo_document(
            complete_payload,
            run_id=run_id,
            tickers=tickers,
            shift_id=run_id,
        )
    except Exception as exc:
        logger.warning("Memo document failed: %s", exc)

    increment_shift_count(user_id)
    archive_shift_to_supabase(
        user_id=user_id,
        run_id=run_id,
        tickers=tickers,
        model=model,
        initial_cash=float(initial_cash),
        analyst_count=len(graph_nodes),
        payload=complete_payload,
    )

    return {
        "run_id": run_id,
        "duration_ms": duration_ms,
        "complete_payload": complete_payload,
        "tickers": tickers,
    }


def execute_scheduled_shift(schedule: dict[str, Any], *, scheduled_for: datetime) -> dict[str, Any]:
    user_id = str(schedule["user_id"])
    tickers = resolve_schedule_tickers(schedule, user_id)
    if not tickers:
        raise RuntimeError("No tickers resolved for schedule")

    return execute_shift_headless(
        user_id=user_id,
        tickers=tickers,
        enabled_agent_keys=schedule.get("enabled_agent_keys") or [],
        model_name=schedule.get("model_name"),
        initial_cash=float(schedule.get("initial_cash") or 100_000),
        run_risk_pipeline=bool(schedule.get("run_risk_pipeline", True)),
        source="scheduled",
        schedule_id=str(schedule.get("id")),
    )


def notify_shift_complete(
    *,
    user_id: str,
    schedule: dict[str, Any],
    run_id: str,
    delta_summary: str | None = None,
    briefing: str | None = None,
) -> None:
    label = schedule.get("label") or "Scheduled shift"
    body_parts = [f"{label} completed."]
    if briefing:
        body_parts.append(briefing)
    if delta_summary:
        body_parts.append(delta_summary)

    insert_notification({
        "user_id": user_id,
        "kind": "scheduled_shift_complete",
        "body": " ".join(body_parts),
        "metadata": {
            "schedule_id": schedule.get("id"),
            "run_id": run_id,
            "replay_url": f"/?replay={run_id}",
            "briefing": briefing,
            "delta_summary": delta_summary,
        },
    })
