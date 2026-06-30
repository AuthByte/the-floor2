"""Weighted persona metric composition tests."""

from __future__ import annotations

from types import SimpleNamespace

from src.agents.persona_metrics import generic_persona_metrics
from src.utils.persona_models import PersonaMetricWeights


def _metric(**kwargs):
    return SimpleNamespace(**kwargs)


def test_generic_persona_metrics_weighted_score():
    weights = PersonaMetricWeights(
        valuation=0.2,
        momentum=0.2,
        quality=0.2,
        macro_sensitivity=0.2,
        risk_control=0.2,
    )
    analyze = generic_persona_metrics({"weights": weights.model_dump()})
    result = analyze(
        {
            "metrics": [_metric(return_on_equity=0.15, debt_to_assets=0.2)],
            "line_items": [
                _metric(free_cash_flow=100, operating_income=80, total_debt=10, shareholders_equity=50)
            ],
            "market_cap": 1_000.0,
            "prices": [
                _metric(close=100 + i * 0.5, volume=1_000_000)
                for i in range(120)
            ],
            "macro": {"summary": {"risk_tone": "risk_on", "headline": "Steady"}},
        }
    )
    assert 0 <= result["score"] <= 10
    assert result["max_score"] == 10
    assert "persona_valuation" in result
    assert "persona_momentum" in result
