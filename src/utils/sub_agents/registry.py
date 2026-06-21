"""Catalog of delegatable sub-agent task types."""

from __future__ import annotations

import json
from typing import Any

from src.utils.sub_agents.types import SubAgentSpec

_CATALOG: tuple[SubAgentSpec, ...] = (
    SubAgentSpec(
        id="peer_benchmark",
        label="Peer Benchmark",
        description="Compare the focal ticker to sector peers on valuation, growth, and margins.",
        system_prompt=(
            "You are a peer-benchmark sub-analyst. Compare the focal company to plausible "
            "sector peers using only the metrics and context provided. Highlight relative "
            "cheapness, growth premium, or margin advantage. Be specific with numbers."
        ),
    ),
    SubAgentSpec(
        id="catalyst_scan",
        label="Catalyst Scanner",
        description="Surface near-term catalysts and risks from news and macro context.",
        system_prompt=(
            "You are a catalyst-scan sub-analyst. Extract upcoming events, regulatory moves, "
            "product cycles, and narrative shifts from the news and macro context. Rank by "
            "likely market impact within the stated horizon."
        ),
    ),
    SubAgentSpec(
        id="forensic_accounting",
        label="Forensic Accounting",
        description="Stress-test earnings quality, cash conversion, and balance-sheet red flags.",
        system_prompt=(
            "You are a forensic accounting sub-analyst. Focus on cash vs accrual earnings, "
            "working-capital drift, leverage, and any mismatch between reported growth and "
            "cash generation. Flag concerns without inventing filings."
        ),
    ),
    SubAgentSpec(
        id="management_signals",
        label="Management Signals",
        description="Read insider activity, capital allocation, and governance cues.",
        system_prompt=(
            "You are a management-signal sub-analyst. Interpret insider trades, buybacks, "
            "dividends, and capital allocation patterns. Judge alignment with shareholders."
        ),
    ),
    SubAgentSpec(
        id="bear_stress",
        label="Bear Case Stress",
        description="Build the strongest credible bear case against a bullish consensus.",
        system_prompt=(
            "You are a bear-case stress sub-analyst. Assume the bull narrative is wrong. "
            "Identify the single best argument for downside, quantifying where possible."
        ),
    ),
    SubAgentSpec(
        id="moat_check",
        label="Moat Check",
        description="Evaluate competitive durability, switching costs, and disruption risk.",
        system_prompt=(
            "You are a moat-check sub-analyst. Score switching costs, pricing power proxies, "
            "and disruption risk. Say whether the advantage is structural or narrative-only."
        ),
    ),
)

_BY_ID: dict[str, SubAgentSpec] = {s.id: s for s in _CATALOG}


def default_catalog() -> list[SubAgentSpec]:
    return list(_CATALOG)


def spec_by_id(spec_id: str) -> SubAgentSpec | None:
    return _BY_ID.get(spec_id)


def catalog_for_parent(parent_agent_id: str) -> list[SubAgentSpec]:
    """Return sub-agent types available to a parent desk.

    Quant desks get stat-focused tasks; forensic shorts get accounting tasks, etc.
    """
    from src.utils.tier0_briefing import extract_base_agent_key

    base = extract_base_agent_key(parent_agent_id)
    quant_parents = {"jim_simons", "technical_analyst"}
    forensic_parents = {"david_einhorn", "michael_burry", "unknown_unknowns"}
    growth_parents = {"cathie_wood", "peter_lynch", "masayoshi_son", "growth_analyst"}
    value_parents = {
        "warren_buffett",
        "ben_graham",
        "seth_klarman",
        "joel_greenblatt",
        "mohnish_pabrai",
        "charlie_munger",
    }

    if base in quant_parents:
        return [s for s in _CATALOG if s.id in {"peer_benchmark", "catalyst_scan", "bear_stress"}]
    if base in forensic_parents:
        return [s for s in _CATALOG if s.id in {"forensic_accounting", "bear_stress", "management_signals"}]
    if base in growth_parents:
        return [s for s in _CATALOG if s.id in {"catalyst_scan", "peer_benchmark", "moat_check"}]
    if base in value_parents:
        return [s for s in _CATALOG if s.id in {"forensic_accounting", "moat_check", "management_signals"}]
    return default_catalog()


def build_task_context(ctx: dict[str, Any]) -> str:
    """Compact JSON context block passed to every sub-agent."""
    preview: dict[str, Any] = {
        "ticker": ctx.get("ticker"),
        "metrics": _preview_metrics(ctx.get("metrics") or []),
        "line_items": _preview_line_items(ctx.get("line_items") or []),
        "news_headlines": _preview_news(ctx.get("news") or []),
        "parent_analysis": _trim_dict(ctx.get("parent_analysis") or {}, 2500),
        "macro": _trim_dict(ctx.get("macro") or {}, 1200),
    }
    return json.dumps(preview, indent=2, default=str)[:6000]


def _preview_metrics(metrics: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in metrics[:4]:
        if hasattr(m, "model_dump"):
            out.append(m.model_dump())
        elif isinstance(m, dict):
            out.append(m)
        else:
            out.append(
                {
                    k: getattr(m, k, None)
                    for k in (
                        "revenue_growth",
                        "earnings_growth",
                        "gross_margin",
                        "operating_margin",
                        "return_on_equity",
                        "debt_to_equity",
                        "price_to_earnings_ratio",
                        "free_cash_flow_yield",
                    )
                    if getattr(m, k, None) is not None
                }
            )
    return out


def _preview_line_items(items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items[:4]:
        if hasattr(item, "model_dump"):
            out.append(item.model_dump())
        elif isinstance(item, dict):
            out.append(item)
    return out


def _preview_news(news: list[Any]) -> list[str]:
    headlines: list[str] = []
    for n in news[:12]:
        title = getattr(n, "title", None) or (n.get("title") if isinstance(n, dict) else None)
        if title:
            headlines.append(str(title)[:120])
    return headlines


def _trim_dict(data: Any, limit: int) -> Any:
    text = json.dumps(data, default=str)
    if len(text) <= limit:
        return data
    return text[:limit]
