"""LLM-authored custom chart slot (hybrid mode: templates + one bespoke chart)."""

from __future__ import annotations

import json
import os
from typing import Any

from src.utils.agent_artifacts.serialize import has_chartable_data, serialize_metrics_ctx
from src.utils.agent_artifacts.types import CustomChartDraft

from src.utils.agent_artifacts.plan import PLANNER_MODEL, _api_keys, _summarize_metrics

CUSTOM_CHART_ID = "agent_custom_chart"

_EXAMPLE_CODE = """
fig, ax = new_figure()
if not prices_df.empty and "close" in prices_df.columns:
    closes = prices_df["close"].astype(float).tolist()
    x = range(len(closes))
    ax.plot(x, closes, color=PHOS, linewidth=1.3)
    ax.fill_between(x, closes, color=PHOS, alpha=0.08)
    style_chart_title(ax, f"{ctx.get('ticker', '')} price tape", kicker="CUSTOM DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Close")
else:
    fig, ax = new_figure()
    style_chart_title(ax, "No price data", kicker="CUSTOM DESK")
    ax.text(0.5, 0.5, "insufficient data", ha="center", va="center", transform=ax.transAxes, color=MUTED)
""".strip()


def custom_charts_enabled() -> bool:
    return os.environ.get("CUSTOM_ARTIFACT_CHARTS", "1").strip().lower() not in {"0", "false", "no"}


def plan_custom_chart(
    *,
    agent_id: str,
    investor_name: str,
    ticker: str,
    metrics_ctx: dict[str, Any],
    state: Any | None,
) -> CustomChartDraft | None:
    """Ask the LLM for one bespoke matplotlib chart. Returns None on skip/failure."""
    if not custom_charts_enabled():
        return None
    if not has_chartable_data(metrics_ctx):
        return None

    from langchain_core.prompts import ChatPromptTemplate

    from src.llm.models import ModelProvider, get_model
    from src.utils.aux_model import resolve_aux_model

    data_preview = json.dumps(serialize_metrics_ctx(metrics_ctx), default=str)[:3500]
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You write ONE custom matplotlib chart for {investor_name}'s desk on ticker {ticker}. "
                "Return JSON only with title, caption, and code fields.\n\n"
                "Rules:\n"
                "- Code must assign a matplotlib Figure to variable `fig` (usually via fig, ax = new_figure()).\n"
                "- Use only: new_figure, style_chart_title, style_legend, style_twin_axis, apply_floor_style, "
                "signal_color, ctx, prices_df, metrics_df, line_items_df, plt, np, pd, math, statistics, "
                "and theme colors PHOS, BRASS, SIREN, AMBER, WIRE_300, MUTED.\n"
                "- No imports, file IO, network, or subprocess.\n"
                "- Match the dark desk theme; be specific to this ticker and the agent's analysis.\n"
                "- Keep code under 80 lines.\n\n"
                "Example:\n{example}",
            ),
            (
                "human",
                "Agent: {agent_id}\n"
                "Ticker: {ticker}\n"
                "Compact analysis:\n{summary}\n\n"
                "Available data (JSON):\n{data_preview}\n\n"
                'Return: {{"title": "...", "caption": "...", "code": "..."}}',
            ),
        ]
    )
    prompt = template.invoke(
        {
            "investor_name": investor_name,
            "ticker": ticker,
            "agent_id": agent_id,
            "example": _EXAMPLE_CODE,
            "summary": _summarize_metrics(metrics_ctx),
            "data_preview": data_preview,
        }
    )

    try:
        aux_model, aux_provider = resolve_aux_model(state, PLANNER_MODEL)
        llm = get_model(aux_model, aux_provider, _api_keys(state))
        structured = llm.with_structured_output(CustomChartDraft, method="json_mode")
        draft: CustomChartDraft = structured.invoke(prompt)
        if draft.title and draft.code and draft.code.strip():
            return draft
    except Exception as exc:
        print(f"[agent_artifacts] custom chart planner skipped: {exc}")
    return None
