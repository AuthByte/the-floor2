"""Stripe billing webhook signature and dev-mode behavior tests."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app

_TEST_USER = {"sub": "00000000-0000-0000-0000-000000000099", "email": "billing@test.local"}
_WEBHOOK_SECRET = "whsec_test_secret_for_signing"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def authed_client(client: TestClient):
    from app.backend.auth.deps import require_user

    async def _fake_user():
        return _TEST_USER

    app.dependency_overrides[require_user] = _fake_user
    yield client
    app.dependency_overrides.pop(require_user, None)


def test_webhook_503_when_stripe_not_configured(client: TestClient):
    with patch("app.backend.routes.billing.is_stripe_configured", return_value=False):
        response = client.post(
            "/billing/webhook",
            content=b"{}",
            headers={"stripe-signature": "t=1,v1=abc"},
        )

    assert response.status_code == 503
    assert "dev mode" in response.json()["detail"].lower()


def test_webhook_400_missing_signature(client: TestClient):
    with (
        patch("app.backend.routes.billing.is_stripe_configured", return_value=True),
        patch("app.backend.services.stripe_billing._webhook_secret", return_value=_WEBHOOK_SECRET),
        patch("app.backend.services.stripe_billing._stripe_secret", return_value="sk_test_x"),
    ):
        response = client.post("/billing/webhook", content=b"{}")

    assert response.status_code == 400
    assert "stripe-signature" in response.json()["detail"].lower()


def test_webhook_400_invalid_signature(client: TestClient):
    payload = json.dumps({"id": "evt_test", "type": "ping"}).encode()
    with (
        patch("app.backend.routes.billing.is_stripe_configured", return_value=True),
        patch("app.backend.services.stripe_billing._webhook_secret", return_value=_WEBHOOK_SECRET),
        patch("app.backend.services.stripe_billing._stripe_secret", return_value="sk_test_x"),
        patch(
            "stripe.Webhook.construct_event",
            side_effect=__import__("stripe").error.SignatureVerificationError(
                "bad sig", sig_header="t=1,v1=bad"
            ),
        ),
    ):
        response = client.post(
            "/billing/webhook",
            content=payload,
            headers={"stripe-signature": "t=1,v1=bad"},
        )

    assert response.status_code == 400
    assert "signature" in response.json()["detail"].lower()


def test_webhook_200_valid_signature(client: TestClient):
    event = {
        "id": "evt_test_checkout",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "mode": "payment",
                "customer": "cus_test",
                "metadata": {"user_id": _TEST_USER["sub"], "plan": "day_pass"},
            }
        },
    }
    payload = json.dumps(event).encode()

    with (
        patch("app.backend.routes.billing.is_stripe_configured", return_value=True),
        patch("app.backend.services.stripe_billing._webhook_secret", return_value=_WEBHOOK_SECRET),
        patch("app.backend.services.stripe_billing._stripe_secret", return_value="sk_test_x"),
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("app.backend.services.stripe_billing._billing_event_exists", return_value=False),
        patch("app.backend.services.stripe_billing._activate_day_pass") as activate,
        patch("app.backend.services.stripe_billing._log_billing_event") as audit,
    ):
        response = client.post(
            "/billing/webhook",
            content=payload,
            headers={"stripe-signature": "t=1700000000,v1=valid"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["type"] == "checkout.session.completed"
    activate.assert_called_once()
    audit.assert_called_once()


def test_webhook_idempotent_duplicate(client: TestClient):
    event = {"id": "evt_dup", "type": "invoice.paid", "data": {"object": {}}}
    payload = json.dumps(event).encode()

    with (
        patch("app.backend.routes.billing.is_stripe_configured", return_value=True),
        patch("app.backend.services.stripe_billing._webhook_secret", return_value=_WEBHOOK_SECRET),
        patch("app.backend.services.stripe_billing._stripe_secret", return_value="sk_test_x"),
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("app.backend.services.stripe_billing._billing_event_exists", return_value=True),
        patch("app.backend.services.stripe_billing._handle_invoice_paid") as handler,
    ):
        response = client.post(
            "/billing/webhook",
            content=payload,
            headers={"stripe-signature": "t=1,v1=ok"},
        )

    assert response.status_code == 200
    assert response.json().get("duplicate") is True
    handler.assert_not_called()


def test_checkout_503_when_stripe_not_configured(authed_client: TestClient):
    with patch("app.backend.routes.billing.is_stripe_configured", return_value=False):
        response = authed_client.post(
            "/billing/checkout",
            json={"plan": "pro_monthly"},
        )

    assert response.status_code == 503


def test_checkout_creates_session(authed_client: TestClient):
    with (
        patch("app.backend.routes.billing.is_stripe_configured", return_value=True),
        patch(
            "app.backend.routes.billing.create_checkout_session",
            return_value={"url": "https://checkout.stripe.com/c/pay/cs_test", "session_id": "cs_test"},
        ),
    ):
        response = authed_client.post(
            "/billing/checkout",
            json={"plan": "day_pass"},
        )

    assert response.status_code == 200
    assert response.json()["url"].startswith("https://checkout.stripe.com")


def test_billing_status_shape(authed_client: TestClient):
    status = {
        "plan_tier": "free",
        "shifts_used_this_period": 1,
        "shifts_limit": 2,
        "entitlement_expires_at": None,
        "has_subscription": False,
    }
    with patch("app.backend.routes.billing.get_billing_status", return_value=status):
        response = authed_client.get("/billing/status")

    assert response.status_code == 200
    assert response.json() == status
