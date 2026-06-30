"""Unit tests for scoring worker batch behavior."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.backend.services import scoring_service


def _pending_row(**overrides):
    published = datetime.now(timezone.utc) - timedelta(days=400)
    row = {
        "id": "row-1",
        "shift_id": "shift-1",
        "agent_key": "warren_buffett",
        "ticker": "NVDA",
        "published_at": published.isoformat(),
        "time_horizon_months": 12,
        "reference_price": 100.0,
        "signal": "bullish",
        "price_target": 120.0,
        "scoring_status": "pending",
    }
    row.update(overrides)
    return row


def test_not_due_leaves_pending():
    recent = datetime.now(timezone.utc) - timedelta(days=1)
    row = _pending_row(published_at=recent.isoformat())
    scoring_service._memory_outcomes = [row]
    scoring_service._memory_scorecards = {}

    with patch.object(scoring_service, "_create_scoring_run", return_value=None), patch.object(
        scoring_service, "_finish_scoring_run"
    ):
        result = scoring_service.run_scoring_cycle(trigger_source="local")

    assert result["scored"] == 0
    assert scoring_service._memory_outcomes[0]["scoring_status"] == "pending"


def test_due_with_price_scores_row():
    row = _pending_row()
    scoring_service._memory_outcomes = [row]
    scoring_service._memory_scorecards = {}

    with patch.object(scoring_service, "_create_scoring_run", return_value=None), patch.object(
        scoring_service, "_finish_scoring_run"
    ), patch.object(scoring_service, "_price_on_date", return_value=110.0):
        result = scoring_service.run_scoring_cycle(trigger_source="local")

    assert result["scored"] == 1
    assert scoring_service._memory_outcomes[0]["scoring_status"] == "scored"


def test_price_miss_stays_pending():
    # Due horizon but not yet stale (published ~13 months ago, 12mo horizon + 30d grace)
    published = datetime.now(timezone.utc) - timedelta(days=395)
    row = _pending_row(published_at=published.isoformat())
    scoring_service._memory_outcomes = [row]
    scoring_service._memory_scorecards = {}

    with patch.object(scoring_service, "_create_scoring_run", return_value=None), patch.object(
        scoring_service, "_finish_scoring_run"
    ), patch.object(scoring_service, "_price_on_date", return_value=None):
        result = scoring_service.run_scoring_cycle(trigger_source="local")

    assert result["scored"] == 0
    assert scoring_service._memory_outcomes[0]["scoring_status"] == "pending"


def test_memory_fallback_populates_scorecards():
    scored = _pending_row(
        scoring_status="scored",
        direction_correct=True,
        target_hit=True,
        confidence=75,
        outcome_price=110.0,
        scored_at=datetime.now(timezone.utc).isoformat(),
    )
    scoring_service._memory_outcomes = [scored]
    scoring_service._memory_scorecards = {}

    scoring_service.refresh_agent_scorecards()

    assert "warren_buffett" in scoring_service._memory_scorecards
    assert scoring_service._memory_scorecards["warren_buffett"]["predictions_scored"] == 1
