"""Tests for risk discovery pipeline utilities."""

from __future__ import annotations

from src.utils.risk_pipeline import (
    assign_specialists,
    empty_ticker_risk,
    ensure_risk_bucket,
    risk_briefing_for_ticker,
    slug_risk_id,
)
from src.utils.risk_scenario_model import estimate_scenario_impacts


def test_slug_risk_id():
    assert slug_risk_id("China export restrictions worsen").startswith("risk_")


def test_assign_specialists_geopolitical():
    specs = assign_specialists("geopolitical")
    assert "china_geopolitical" in specs


def test_scenario_impacts_negative():
    out = estimate_scenario_impacts(
        probability_pct=25,
        severity_score=7,
        category="geopolitical",
    )
    assert out["impacts"]["revenue_pct"] < 0
    assert out["impacts"]["eps_pct"] < 0


def test_risk_briefing_from_state():
    state = {
        "data": {
            "risk_pipeline": {
                "NVDA": {
                    **empty_ticker_risk(),
                    "inventory": [
                        {"id": "risk_x", "title": "China export restrictions worsen", "category": "geopolitical"}
                    ],
                    "scenarios": [
                        {
                            "title": "China restrictions expand",
                            "probability_pct": 25,
                            "impacts": {"revenue_pct": -12, "eps_pct": -18, "dcf_pct": -22},
                        }
                    ],
                }
            }
        }
    }
    block = risk_briefing_for_ticker(state, "NVDA")
    assert "China export" in block
    assert "Scenario impacts" in block


def test_ensure_risk_bucket():
    state = {"data": {}}
    bucket = ensure_risk_bucket(state, "AAPL")  # type: ignore[arg-type]
    assert bucket["inventory"] == []
