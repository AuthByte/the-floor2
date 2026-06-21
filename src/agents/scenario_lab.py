"""Stage 3 — scenario lab: financial impact modeling."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage

from src.graph.state import AgentState
from src.utils.api_key import get_api_key_from_state
from src.utils.progress import progress
from src.utils.risk_pipeline import (
    MAX_SCENARIOS,
    SCENARIO_LAB_ID,
    ensure_risk_bucket,
    risk_pipeline_enabled,
)
from src.utils.risk_scenario_model import estimate_scenario_impacts
from src.utils.interactive_artifacts import build_scenario_tornado
from src.tools.api import get_financial_metrics, get_market_cap


def _rank_risks(bucket: dict[str, Any]) -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
    inventory = {r["id"]: r for r in bucket.get("inventory") or []}
    research = bucket.get("research") or {}
    ranked: list[tuple[float, str, dict[str, Any], dict[str, Any]]] = []
    for risk_id, block in research.items():
        risk = inventory.get(risk_id)
        if not risk or not isinstance(block, dict):
            continue
        prob = float(block.get("blended_probability_pct") or 0)
        sev = float(block.get("blended_severity_score") or 0)
        ranked.append((prob * sev, risk_id, risk, block))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [(rid, risk, block) for _, rid, risk, block in ranked]


def scenario_lab_node(state: AgentState) -> dict[str, Any]:
    if not risk_pipeline_enabled(state):
        progress.update_status(SCENARIO_LAB_ID, None, "Skipped")
        return {"data": {}}

    data = state["data"]
    tickers = data.get("tickers") or []
    end_date = data.get("end_date", "")
    api_key = get_api_key_from_state(state, "FINANCIAL_DATASETS_API_KEY")
    pipeline: dict[str, Any] = data.get("risk_pipeline") or {}

    for ticker in tickers:
        key = ticker.strip().upper()
        bucket = ensure_risk_bucket(state, key)
        progress.update_status(SCENARIO_LAB_ID, key, "Building scenarios")

        metrics = get_financial_metrics(key, end_date, period="ttm", limit=4, api_key=api_key)
        market_cap = get_market_cap(key, end_date, api_key=api_key)
        rev_growth = None
        if metrics:
            rev_growth = getattr(metrics[0], "revenue_growth", None)

        scenarios: list[dict[str, Any]] = []
        for risk_id, risk, block in _rank_risks(bucket)[:MAX_SCENARIOS]:
            prob = float(block.get("blended_probability_pct") or 20)
            sev = float(block.get("blended_severity_score") or 5)
            modeled = estimate_scenario_impacts(
                probability_pct=prob,
                severity_score=sev,
                category=risk.get("category", "macro"),
                revenue_growth=rev_growth,
                market_cap=market_cap,
            )
            reports = block.get("reports") or {}
            narrative_bits = [
                str(r.get("summary", ""))[:200]
                for r in reports.values()
                if isinstance(r, dict) and r.get("summary")
            ]
            scenarios.append(
                {
                    "risk_id": risk_id,
                    "title": risk.get("title"),
                    "probability_pct": modeled["probability_pct"],
                    "impacts": modeled["impacts"],
                    "exposed_segments": modeled["exposed_segments"],
                    "narrative": " ".join(narrative_bits)[:500],
                }
            )

        bucket["scenarios"] = scenarios
        pipeline[key] = bucket
        tornado = build_scenario_tornado(key, scenarios)
        progress.update_status(
            SCENARIO_LAB_ID,
            key,
            "Done",
            analysis=json.dumps({"scenarios": scenarios, "artifacts": [tornado]}, default=str),
        )

    progress.update_status(SCENARIO_LAB_ID, None, "Scenarios modeled")
    message = HumanMessage(
        content=json.dumps({"stage": "scenarios", "tickers": tickers}),
        name=SCENARIO_LAB_ID,
    )
    return {"messages": [message], "data": {"risk_pipeline": pipeline}}
