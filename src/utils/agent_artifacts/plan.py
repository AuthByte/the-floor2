"""LLM-driven chart selector.

The planner only chooses which registered charts to render and writes a
short caption per pick. It can never request a chart id outside the
provided catalog because we validate the response against `eligible`.
"""

from __future__ import annotations

import json
from typing import Any

from src.utils.agent_artifacts.types import ChartPick, ChartPlan

PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

MAX_CHARTS_PER_TICKER = 6


def _api_keys(state: Any | None) -> dict | None:
    if not state:
        return None
    req = state.get("metadata", {}).get("request") if hasattr(state, "get") else None
    if req and hasattr(req, "api_keys"):
        return req.api_keys
    return None


def _summarize_metrics(metrics_ctx: dict[str, Any]) -> str:
    """Compact preview of what the agent computed, for prompt grounding."""
    keep: dict[str, Any] = {}
    for k, v in (metrics_ctx or {}).items():
        if k in {"prices", "news", "insider_trades", "line_items", "metrics", "macro"}:
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            keep[k] = v
        elif isinstance(v, dict):
            keep[k] = {
                kk: (vv if isinstance(vv, (str, int, float, bool)) else str(vv)[:120])
                for kk, vv in list(v.items())[:6]
            }
    return json.dumps(keep, default=str)[:1800]


def plan_charts(
    *,
    agent_id: str,
    investor_name: str,
    ticker: str,
    metrics_ctx: dict[str, Any],
    eligible: list[Any],
    state: Any | None,
) -> ChartPlan:
    """Ask the LLM to pick up to MAX_CHARTS_PER_TICKER ids from `eligible`.

    Falls back to the first few eligible specs on any failure.
    """
    if not eligible:
        return ChartPlan(charts=[])

    eligible_ids = {s.id for s in eligible}
    catalog_text = "\n".join(
        f"- id: {s.id} | label: {s.label} | description: {s.description}"
        for s in eligible
    )

    # LangChain is heavy; only import when we're actually going to call the LLM.
    from langchain_core.prompts import ChatPromptTemplate

    from src.llm.models import ModelProvider, get_model
    from src.utils.aux_model import resolve_aux_model

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are picking which charts {investor_name} would put on the wall for "
                "ticker {ticker}. Choose up to {max_charts} chart ids from the catalog. "
                "Only return ids that appear verbatim in the catalog. Each pick needs a "
                "short title (max 8 words) and a one-sentence caption explaining what "
                "the chart shows for this ticker. Return JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\n"
                "Agent: {agent_id}\n"
                "Available charts:\n{catalog}\n\n"
                "Agent's computed analysis (compact):\n{summary}\n\n"
                'Return: {{"charts": [{{"id": "...", "title": "...", "caption": "..."}}]}}',
            ),
        ]
    )
    prompt = template.invoke(
        {
            "investor_name": investor_name,
            "ticker": ticker,
            "agent_id": agent_id,
            "catalog": catalog_text,
            "summary": _summarize_metrics(metrics_ctx),
            "max_charts": MAX_CHARTS_PER_TICKER,
        }
    )

    try:
        aux_model, aux_provider = resolve_aux_model(state, PLANNER_MODEL)
        llm = get_model(aux_model, aux_provider, _api_keys(state))
        structured = llm.with_structured_output(ChartPlan, method="json_mode")
        plan: ChartPlan = structured.invoke(prompt)
        cleaned: list[ChartPick] = []
        seen: set[str] = set()
        for pick in plan.charts:
            if pick.id in eligible_ids and pick.id not in seen:
                cleaned.append(pick)
                seen.add(pick.id)
            if len(cleaned) >= MAX_CHARTS_PER_TICKER:
                break
        if cleaned:
            return ChartPlan(charts=cleaned)
    except Exception as exc:
        print(f"[agent_artifacts] chart planner fallback: {exc}")

    return _fallback_plan(eligible, ticker)


def _fallback_plan(eligible: list[Any], ticker: str) -> ChartPlan:
    n = min(MAX_CHARTS_PER_TICKER, len(eligible))
    if n <= 1:
        picks = eligible[:n]
    else:
        # Spread picks across the catalog so fallback mode still shows variety.
        step = max(1, len(eligible) // n)
        picks = [eligible[i] for i in range(0, len(eligible), step)][:n]
    return ChartPlan(
        charts=[
            ChartPick(
                id=spec.id,
                title=spec.label,
                caption=f"{spec.description} ({ticker})",
            )
            for spec in picks
        ]
    )
