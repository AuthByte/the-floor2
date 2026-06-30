"""Unit tests for agent target outcome extraction and scoring math."""

from datetime import datetime, timezone

from src.utils.target_outcomes import (
    aggregate_agent_scorecards,
    extract_target_outcomes,
    is_scorable_agent,
    score_direction,
    score_target_hit,
)


def test_bullish_hit():
    assert score_direction(100, 103, "bullish") is True


def test_bullish_miss():
    assert score_direction(100, 101, "bullish") is False


def test_bearish_hit():
    assert score_direction(100, 97, "bearish") is True


def test_neutral_band():
    assert score_direction(100, 103, "neutral") is True


def test_zero_ref_returns_none():
    assert score_direction(0, 100, "bullish") is None


def test_target_hit_within_tolerance():
    assert score_target_hit(100, 108) is True


def test_target_miss_outside_tolerance():
    assert score_target_hit(100, 115) is False


def test_extract_skips_portfolio_manager():
    payload = {
        "analyst_signals": {
            "portfolio_manager": {
                "NVDA": {"signal": "bullish", "reference_price": 100},
            },
        },
        "current_prices": {"NVDA": 100},
    }
    rows = extract_target_outcomes(
        shift_id="shift-1",
        user_id="user-1",
        run_id="run-1",
        published_at=datetime.now(timezone.utc),
        payload=payload,
    )
    assert rows == []


def test_extract_default_horizon():
    payload = {
        "analyst_signals": {
            "warren_buffett": {
                "NVDA": {"signal": "bullish", "reference_price": 100},
            },
        },
        "current_prices": {"NVDA": 100},
    }
    rows = extract_target_outcomes(
        shift_id="shift-1",
        user_id="user-1",
        run_id="run-1",
        published_at=datetime.now(timezone.utc),
        payload=payload,
    )
    assert len(rows) == 1
    assert rows[0]["time_horizon_months"] == 12


def test_aggregate_direction_hit_rate():
    rows = [
        {
            "agent_key": "warren_buffett",
            "scoring_status": "scored",
            "direction_correct": True,
            "target_hit": True,
            "confidence": 70,
            "price_target": 120,
        },
        {
            "agent_key": "warren_buffett",
            "scoring_status": "scored",
            "direction_correct": True,
            "target_hit": False,
            "confidence": 80,
            "price_target": 130,
        },
        {
            "agent_key": "warren_buffett",
            "scoring_status": "scored",
            "direction_correct": False,
            "target_hit": None,
            "confidence": 60,
            "price_target": None,
        },
    ]
    agg = aggregate_agent_scorecards(rows)
    card = agg["warren_buffett"]
    assert card["predictions_scored"] == 3
    assert abs(card["direction_hit_rate"] - 2 / 3) < 0.001


def test_is_scorable_agent_excludes_memo_agents():
    assert is_scorable_agent("portfolio_manager") is False
    assert is_scorable_agent("warren_buffett") is True
