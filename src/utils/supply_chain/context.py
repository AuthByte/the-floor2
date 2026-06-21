"""Rich company context for supply chain graph planning."""

from __future__ import annotations

import json
from typing import Any

from src.utils.tier0_briefing import tier0_briefing_for_ticker

_SUPPLY_NEWS = (
    "supplier",
    "supply chain",
    "shortage",
    "bottleneck",
    "tsmc",
    "fab",
    "logistics",
    "inventory",
    "lead time",
    "single source",
    "geographic",
    "tariff",
    "export",
    "china",
    "taiwan",
    "reshoring",
)


def build_company_context(
    ctx: dict[str, Any],
    *,
    state: Any | None = None,
    analysis: dict[str, Any] | None = None,
) -> str:
    parts: list[str] = []
    ticker = str(ctx.get("ticker") or "").strip().upper()
    parts.append(f"Focal ticker: {ticker}")

    if state and ticker:
        tier0 = tier0_briefing_for_ticker(state, ticker)
        if tier0:
            parts.append("Tier-0 desk briefings:\n" + tier0[:2000])

    macro = (state or {}).get("data", {}).get("macro_context") if state else ctx.get("macro")
    if isinstance(macro, dict) and macro.get("available"):
        summary = macro.get("summary")
        if isinstance(summary, dict):
            parts.append(f"Macro: {summary.get('headline', '')}")
        elif summary:
            parts.append(f"Macro: {str(summary)[:400]}")

    news = ctx.get("news") or []
    supply_headlines: list[str] = []
    other_headlines: list[str] = []
    for n in news[:30]:
        title = getattr(n, "title", None) or (n.get("title") if isinstance(n, dict) else None)
        if not title:
            continue
        t = str(title).strip()
        lower = t.lower()
        if any(w in lower for w in _SUPPLY_NEWS):
            supply_headlines.append(t[:140])
        elif len(other_headlines) < 4:
            other_headlines.append(t[:120])

    if supply_headlines:
        parts.append("Supply-relevant headlines:\n- " + "\n- ".join(supply_headlines[:10]))
    if other_headlines:
        parts.append("Other recent headlines:\n- " + "\n- ".join(other_headlines))

    metrics = ctx.get("metrics") or []
    if metrics:
        m = metrics[0]
        metric_bits: list[str] = []
        for attr in (
            "revenue",
            "revenue_growth",
            "gross_margin",
            "operating_margin",
            "debt_to_equity",
            "return_on_equity",
        ):
            val = getattr(m, attr, None)
            if val is not None:
                metric_bits.append(f"{attr}={val}")
        if metric_bits:
            parts.append("Metrics: " + ", ".join(metric_bits))

    line_items = ctx.get("line_items") or []
    if line_items:
        li = line_items[0]
        li_bits: list[str] = []
        for attr in ("revenue", "inventory", "capital_expenditure", "cost_of_revenue"):
            val = getattr(li, attr, None)
            if val is not None:
                li_bits.append(f"{attr}={val}")
        if li_bits:
            parts.append("Recent filings (line items): " + ", ".join(li_bits))

    if analysis:
        parts.append("Desk pre-analysis:\n" + json.dumps(analysis, default=str)[:1800])

    return "\n\n".join(parts)[:4500]


def context_from_chart_ctx(ctx: dict[str, Any], state: Any | None = None) -> str:
    """Backward-compatible thin wrapper."""
    return build_company_context(ctx, state=state)
