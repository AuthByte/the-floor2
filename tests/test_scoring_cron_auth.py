"""Auth tests for POST /hedge-fund/scoring/run cron endpoint."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_scoring_run_401_without_secret_in_production(client: TestClient):
    with (
        patch("app.backend.routes.hedge_fund._SCORING_SECRET", ""),
        patch("app.backend.routes.hedge_fund._is_scoring_production", return_value=True),
    ):
        response = client.post("/hedge-fund/scoring/run")

    assert response.status_code == 401
    assert "SCORING_CRON_SECRET" in response.json()["detail"]


def test_scoring_run_401_with_invalid_secret(client: TestClient):
    with patch("app.backend.routes.hedge_fund._SCORING_SECRET", "cron-test-secret"):
        response = client.post(
            "/hedge-fund/scoring/run",
            headers={"X-Scoring-Secret": "wrong"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid scoring cron secret"


def test_scoring_run_200_with_valid_secret(client: TestClient):
    summary = {"scored": 0, "pending_checked": 0, "errors": 0}
    with (
        patch("app.backend.routes.hedge_fund._SCORING_SECRET", "cron-test-secret"),
        patch(
            "app.backend.services.scoring_service.run_scoring_cycle",
            return_value=summary,
        ),
    ):
        response = client.post(
            "/hedge-fund/scoring/run",
            headers={"X-Scoring-Secret": "cron-test-secret"},
        )

    assert response.status_code == 200
    assert response.json() == summary
