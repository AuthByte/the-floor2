"""Schedule cron endpoint auth."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app

client = TestClient(app)


def test_schedule_cron_requires_secret_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SCHEDULE_CRON_SECRET", raising=False)
    res = client.post("/hedge-fund/schedules/run")
    assert res.status_code == 401


def test_schedule_cron_accepts_valid_secret(monkeypatch):
    monkeypatch.setenv("SCHEDULE_CRON_SECRET", "test-schedule-secret")
    monkeypatch.delenv("ENV", raising=False)
    res = client.post(
        "/hedge-fund/schedules/run",
        headers={"X-Schedule-Secret": "test-schedule-secret"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "processed" in body
