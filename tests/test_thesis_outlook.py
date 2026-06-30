"""Tests for investor time horizon and price target plumbing."""

from src.utils.thesis_outlook import (
    compute_upside_pct,
    derive_price_target,
    enrich_outlook,
    extract_outlook,
    format_horizon,
    latest_close,
)
from src.utils.thesis_verdict import finish_investor_ticker


class _FakeOutput:
    signal = "bullish"
    confidence = 72
    reasoning = "Strong moat."
    time_horizon_months = 18
    price_target = 220.5


def test_extract_outlook_from_model():
    outlook = extract_outlook(_FakeOutput())
    assert outlook["time_horizon_months"] == 18
    assert outlook["price_target"] == 220.5


def test_enrich_outlook_computes_upside():
    enriched = enrich_outlook(
        {"time_horizon_months": 12, "price_target": 115.0},
        current_price=100.0,
    )
    assert enriched["upside_pct"] == 15.0
    assert enriched["reference_price"] == 100.0


def test_latest_close_uses_most_recent_bar():
    prices = [
        {"time": "2024-01-02", "close": 90},
        {"time": "2024-01-03", "close": 100},
    ]
    assert latest_close(prices) == 100


def test_format_horizon():
    assert format_horizon(6) == "6mo"
    assert format_horizon(12) == "1yr"
    assert format_horizon(24) == "2yr"


def test_finish_investor_ticker_persists_outlook():
    state = {"data": {"analyst_signals": {}}, "metadata": {}}
    finish_investor_ticker(
        "warren_buffett_agent",
        "AAPL",
        "bullish",
        80,
        "Wide moat at reasonable price.",
        state,
        time_horizon_months=24,
        price_target=250.0,
        current_price=200.0,
    )
    bucket = state["data"]["analyst_signals"]["warren_buffett_agent"]["AAPL"]
    assert bucket["time_horizon_months"] == 24
    assert bucket["price_target"] == 250.0
    assert bucket["upside_pct"] == 25.0


def test_derive_price_target_from_intrinsic_per_share():
    analysis = {"intrinsic_val_analysis": {"intrinsic_per_share": 142.5}}
    assert derive_price_target(analysis) == 142.5


def test_derive_price_target_from_total_and_shares():
    analysis = {
        "intrinsic_value_analysis": {"intrinsic_value": 1_000_000_000},
        "outstanding_shares": 10_000_000,
    }
    assert derive_price_target(analysis) == 100.0
