"""Unit tests for member entitlements."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.backend.services import entitlements as ent


@pytest.fixture(autouse=True)
def _clear_entitlement_state():
    ent.reset_usage()
    yield
    ent.reset_usage()


@pytest.fixture
def paywall_enabled(monkeypatch):
    """Enable Stripe tier gating for tests that assert free-tier limits."""
    monkeypatch.setattr(ent, "PAYWALL_ENABLED", True)


def test_paywall_disabled_allows_all_features():
    uid = "user-open-access"
    ent.set_tier(uid, "free")

    ok, _, _ = ent.can_run_shift(uid, roster_size=50)
    assert ok
    assert ent.can_use_paper(uid)[0]
    assert ent.can_publish_social(uid)[0]
    assert ent.can_use_scheduler(uid)[0]

    data = ent.get_user_entitlements(uid)
    assert data["shifts_limit"] is None
    assert data["can_use_scheduler"] is True


def test_free_tier_shift_limit(paywall_enabled):
    uid = "user-free-1"
    ent.set_tier(uid, "free")

    for i in range(ent.FREE_SHIFTS_PER_MONTH):
        ok, _, _ = ent.can_run_shift(uid, roster_size=2)
        assert ok, f"shift {i + 1} should be allowed"
        ent.increment_shift_count(uid)

    ok, msg, detail = ent.can_run_shift(uid, roster_size=2)
    assert not ok
    assert msg
    assert detail is not None
    assert detail["code"] == "shift_limit"


def test_pro_tier_unlimited_shifts():
    uid = "user-pro-1"
    ent.set_tier(uid, "pro")

    for _ in range(10):
        ok, _, _ = ent.can_run_shift(uid, roster_size=8)
        assert ok
        ent.increment_shift_count(uid)

    ok, _, _ = ent.can_run_shift(uid, roster_size=8)
    assert ok


def test_day_pass_grants_pro_capabilities():
    uid = "user-day-1"
    ent.grant_day_pass(uid)

    assert ent.can_use_paper(uid)[0]
    assert ent.can_publish_social(uid)[0]
    ok, _, _ = ent.can_run_shift(uid, roster_size=20)
    assert ok


def test_free_roster_cap(paywall_enabled):
    uid = "user-free-roster"
    ent.set_tier(uid, "free")

    ok, _, detail = ent.can_run_shift(uid, roster_size=ent.FREE_MAX_ROSTER)
    assert ok

    ok, msg, detail = ent.can_run_shift(uid, roster_size=ent.FREE_MAX_ROSTER + 1)
    assert not ok
    assert detail is not None
    assert detail["code"] == "roster_limit"
    assert str(ent.FREE_MAX_ROSTER) in msg


def test_free_cannot_use_paper_or_publish(paywall_enabled):
    uid = "user-free-paper"
    ent.set_tier(uid, "free")

    assert not ent.can_use_paper(uid)[0]
    assert not ent.can_publish_social(uid)[0]
    assert not ent.can_use_scheduler(uid)[0]


def test_pro_can_use_scheduler():
    uid = "user-pro-sched"
    ent.set_tier(uid, "pro")
    assert ent.can_use_scheduler(uid)[0]


def test_day_pass_can_use_scheduler():
    uid = "user-day-sched"
    ent.grant_day_pass(uid)
    assert ent.can_use_scheduler(uid)[0]


def test_local_dev_without_auth_is_unlimited():
    with patch("app.backend.services.entitlements.is_auth_required", return_value=False):
        assert ent._effective_tier(None) == "pro"
        assert ent.can_use_paper(None)[0]
        assert ent.can_publish_social(None)[0]


def test_get_user_entitlements_shape(paywall_enabled):
    uid = "user-shape"
    ent.set_tier(uid, "free")
    data = ent.get_user_entitlements(uid)

    assert data["tier"] == "free"
    assert data["shifts_limit"] == ent.FREE_SHIFTS_PER_MONTH
    assert data["max_roster_size"] == ent.FREE_MAX_ROSTER
    assert "can_run_shift" in data


def test_run_endpoint_returns_402_when_shift_limit_hit(paywall_enabled):
    from fastapi.testclient import TestClient

    from app.backend.auth.deps import require_user
    from app.backend.main import app

    uid = "user-run-402"
    ent.set_tier(uid, "free")
    for _ in range(ent.FREE_SHIFTS_PER_MONTH):
        ent.increment_shift_count(uid)

    payload = {
        "tickers": ["AAPL"],
        "graph_nodes": [
            {"id": "ben_graham", "type": "agent-node", "data": {"name": "Ben Graham"}},
            {"id": "portfolio_manager", "type": "agent-node", "data": {"name": "PM"}},
        ],
        "graph_edges": [
            {"id": "e1", "source": "ben_graham", "target": "portfolio_manager"},
        ],
        "model_name": "openai/gpt-4o-mini",
        "model_provider": "OpenAI",
        "initial_cash": 100000,
        "margin_requirement": 0,
    }

    async def _fake_user():
        return {"sub": uid}

    with patch("app.backend.auth.deps.is_auth_required", return_value=True):
        app.dependency_overrides[require_user] = _fake_user
        try:
            client = TestClient(app)
            response = client.post("/hedge-fund/run", json=payload)
        finally:
            app.dependency_overrides.clear()

    assert response.status_code == 402
    body = response.json()
    assert body["detail"]["code"] == "shift_limit"
