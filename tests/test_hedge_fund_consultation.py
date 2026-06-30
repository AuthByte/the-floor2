"""Integration tests for POST /hedge-fund/user-consultation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_user_consultation_409_without_active_session(client: TestClient):
    """No live shift — endpoint rejects before agent work."""
    response = client.post(
        "/hedge-fund/user-consultation",
        json={
            "run_id": "missing-run-id",
            "ticker": "NVDA",
            "message": "@Charlie Munger What about China exposure?",
            "chair_name": "Finn",
        },
    )
    assert response.status_code == 409
    assert "run_id" in response.json()["detail"].lower()


def test_user_consultation_400_without_mention(client: TestClient):
    """Message must start with @AgentName."""
    session = MagicMock()
    with patch("app.backend.routes.hedge_fund.get_session", return_value=session):
        with patch(
            "app.backend.routes.hedge_fund.apply_user_consultation",
            side_effect=ValueError("mention_required"),
        ):
            response = client.post(
                "/hedge-fund/user-consultation",
                json={
                    "run_id": "live-run-1",
                    "ticker": "NVDA",
                    "message": "What about China exposure?",
                },
            )
    assert response.status_code == 400
    assert "@" in response.json()["detail"]


@pytest.mark.skip(reason="Wire mocked LiveRunSession + apply_user_consultation in PR-2 completion")
def test_user_consultation_returns_material_and_phase(client: TestClient):
    """Happy path — material revision queued for end-of-shift reconcile."""
    with patch(
        "app.backend.routes.hedge_fund.apply_user_consultation",
        return_value={
            "material": True,
            "propagation_queued": True,
            "phase": "debate",
            "agent_key": "charlie_munger",
        },
    ):
        with patch("app.backend.routes.hedge_fund.get_session", return_value=MagicMock()):
            response = client.post(
                "/hedge-fund/user-consultation",
                json={
                    "run_id": "live-run-1",
                    "ticker": "NVDA",
                    "message": "@Charlie Munger China risk?",
                },
            )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["material"] is True
    assert body["propagation_queued"] is True
    assert body["phase"] == "debate"
