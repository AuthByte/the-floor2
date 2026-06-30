"""Launch-readiness smoke tests — fast checks before demo or deploy."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_endpoint(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_public_post_503_without_supabase_keys(client: TestClient):
    """Public reads need SUPABASE_URL plus anon or service role key."""
    fake_sb = MagicMock()
    fake_sb.configured = True
    fake_sb.service_key = ""
    fake_sb.anon_key = ""

    with patch("app.backend.services.supabase_client.get_supabase", return_value=fake_sb):
        response = client.get("/public/posts/00000000-0000-0000-0000-000000000001")

    assert response.status_code == 503
    assert "SUPABASE" in response.json()["detail"]


def test_entitlements_module_imports():
    from app.backend.services import entitlements

    assert entitlements.FREE_SHIFTS_PER_MONTH == 2
    assert callable(entitlements.can_run_shift)
    assert callable(entitlements.get_user_entitlements)
    assert callable(entitlements.can_publish_social)


def test_billing_routes_register(client: TestClient):
    paths = {getattr(route, "path", "") for route in app.routes}
    expected = {
        "/billing/status",
        "/billing/checkout",
        "/billing/checkout/pro",
        "/billing/checkout/day-pass",
        "/billing/portal",
        "/billing/webhook",
        "/billing/gate/publish",
    }
    missing = expected - paths
    assert not missing, f"Missing billing routes: {sorted(missing)}"
