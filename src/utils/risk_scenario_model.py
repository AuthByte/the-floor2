"""Deterministic scenario impact model for the risk pipeline."""

from __future__ import annotations

from typing import Any


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def estimate_scenario_impacts(
    *,
    probability_pct: float,
    severity_score: float,
    category: str,
    revenue_growth: float | None = None,
    market_cap: float | None = None,
) -> dict[str, Any]:
    """Map probability × severity into revenue/EPS/DCF shock estimates."""
    p = _clamp(probability_pct / 100.0, 0.05, 0.95)
    sev = _clamp(severity_score / 10.0, 0.1, 1.0)
    base = p * sev

    category_mult = {
        "geopolitical": 1.15,
        "macro": 1.0,
        "supply_chain": 1.1,
        "competition": 0.95,
        "technology": 1.2,
        "regulatory": 0.9,
        "financial": 1.05,
        "demand": 1.1,
    }.get(category, 1.0)

    shock = base * category_mult * 0.55
    rev = round(-_clamp(shock * 28, 3, 35), 1)
    eps = round(rev * 1.35, 1)
    dcf = round(rev * 1.55, 1)

    if revenue_growth is not None and revenue_growth < 0:
        eps = round(eps * 1.1, 1)
        dcf = round(dcf * 1.08, 1)

    segments = _default_segments(category)

    return {
        "probability_pct": round(probability_pct, 1),
        "impacts": {
            "revenue_pct": rev,
            "eps_pct": eps,
            "dcf_pct": dcf,
        },
        "exposed_segments": segments,
    }


def _default_segments(category: str) -> list[dict[str, str]]:
    mapping: dict[str, list[dict[str, str]]] = {
        "geopolitical": [
            {"name": "International revenue", "exposure": "high"},
            {"name": "Data Center", "exposure": "medium"},
        ],
        "supply_chain": [
            {"name": "Hardware / components", "exposure": "high"},
            {"name": "Manufacturing", "exposure": "high"},
        ],
        "competition": [
            {"name": "Core product", "exposure": "high"},
            {"name": "Enterprise", "exposure": "medium"},
        ],
        "technology": [
            {"name": "Legacy platform", "exposure": "high"},
            {"name": "R&D pipeline", "exposure": "medium"},
        ],
        "regulatory": [
            {"name": "Domestic ops", "exposure": "medium"},
            {"name": "M&A optionality", "exposure": "medium"},
        ],
        "macro": [
            {"name": "Cyclical revenue", "exposure": "high"},
            {"name": "Consumer", "exposure": "medium"},
        ],
        "demand": [
            {"name": "End-market demand", "exposure": "high"},
            {"name": "Channel inventory", "exposure": "medium"},
        ],
        "financial": [
            {"name": "Balance sheet", "exposure": "high"},
            {"name": "Credit-sensitive", "exposure": "medium"},
        ],
    }
    return mapping.get(
        category,
        [
            {"name": "Core business", "exposure": "high"},
            {"name": "Secondary lines", "exposure": "medium"},
        ],
    )
