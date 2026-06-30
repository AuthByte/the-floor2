"""Tests for shift schedule next-run computation."""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.backend.services.schedule_service import (
    US_MARKET_HOLIDAYS,
    compute_next_run_at,
    is_floor_open_et,
    is_market_holiday,
    preview_schedule_times,
)


def test_compute_next_daily_weekday():
    schedule = {
        "enabled": True,
        "recurrence": "daily",
        "time_local": "09:30:00",
        "timezone": "America/New_York",
    }
    after = datetime(2026, 6, 17, 14, 0, tzinfo=timezone.utc)  # Wed
    nxt = compute_next_run_at(schedule, after=after)
    assert nxt is not None
    et = nxt.astimezone(ZoneInfo("America/New_York"))
    assert et.hour == 9 and et.minute == 30
    assert et.weekday() < 5


def test_once_schedule_exhausted():
    past = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    schedule = {
        "enabled": True,
        "recurrence": "once",
        "run_once_at": past.isoformat(),
        "time_local": "09:30:00",
        "timezone": "America/New_York",
    }
    assert compute_next_run_at(schedule) is None


def test_preview_returns_multiple():
    schedule = {
        "enabled": True,
        "recurrence": "daily",
        "time_local": "10:00:00",
        "timezone": "America/New_York",
    }
    times = preview_schedule_times(schedule, count=3)
    assert len(times) == 3


def test_market_holiday_known():
    assert is_market_holiday(date(2026, 12, 25))


def test_floor_closed_on_weekend():
    sat = datetime(2026, 6, 20, 15, 0, tzinfo=ZoneInfo("America/New_York"))
    assert is_floor_open_et(sat) is False
