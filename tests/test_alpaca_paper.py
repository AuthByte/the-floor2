"""Unit tests for Alpaca paper trading summary enrichment."""

import os
from unittest.mock import patch

import pytest

from app.backend.services import alpaca_paper as ap


def test_action_to_side_mapping():
    assert ap._ACTION_TO_SIDE["buy"] == "buy"
    assert ap._ACTION_TO_SIDE["sell"] == "sell"
    assert ap._ACTION_TO_SIDE["short"] == "sell"
    assert ap._ACTION_TO_SIDE["cover"] == "buy"


def test_resolve_alpaca_credentials_from_api_keys():
    creds = ap.resolve_alpaca_credentials(
        {
            "ALPACA_API_KEY_ID": "key-123",
            "ALPACA_API_SECRET_KEY": "secret-456",
            "ALPACA_PAPER_BASE_URL": "https://paper.example/",
        }
    )
    assert creds == ("key-123", "secret-456", "https://paper.example")


def test_resolve_alpaca_credentials_apca_aliases():
    creds = ap.resolve_alpaca_credentials(
        {
            "APCA_API_KEY_ID": "alias-key",
            "APCA_API_SECRET_KEY": "alias-secret",
        }
    )
    assert creds is not None
    assert creds[0] == "alias-key"
    assert creds[1] == "alias-secret"
    assert creds[2] == ap.DEFAULT_PAPER_BASE


def test_resolve_alpaca_credentials_missing_returns_none():
    with patch.dict(os.environ, {}, clear=True):
        assert ap.resolve_alpaca_credentials({}) is None


def test_build_paper_summary_counts_and_day_pnl():
    orders = [
        {"status": "filled", "requested_qty": 10},
        {"status": "accepted", "requested_qty": 5},
        {"status": "failed", "requested_qty": 3},
        {"status": "skipped", "requested_qty": 0},
    ]
    account = {"equity": 105_000.0, "last_equity": 100_000.0}
    summary = ap.build_paper_summary(orders, account)

    assert summary["orders_submitted"] == 3
    assert summary["orders_filled"] == 1
    assert summary["orders_failed"] == 1
    assert summary["day_pnl"] == pytest.approx(5_000.0)
    assert summary["equity"] == pytest.approx(105_000.0)


def test_build_paper_summary_without_account():
    summary = ap.build_paper_summary([], None)
    assert summary["orders_submitted"] == 0
    assert summary["day_pnl"] is None
    assert summary["equity"] is None


def test_ref_price_for_ticker_case_insensitive():
    price = ap._ref_price_for_ticker("nvda", {"NVDA": 128.5, "AAPL": 190.0})
    assert price == pytest.approx(128.5)


def test_is_alpaca_paper_disabled_env():
    with patch.dict(os.environ, {"ALPACA_PAPER_DISABLED": "1"}):
        assert ap.is_alpaca_paper_disabled() is True
    with patch.dict(os.environ, {"ALPACA_PAPER_DISABLED": "true"}):
        assert ap.is_alpaca_paper_disabled() is True
    with patch.dict(os.environ, {"ALPACA_PAPER_DISABLED": ""}, clear=False):
        assert ap.is_alpaca_paper_disabled() is False


def test_alpaca_credential_source_request_over_env():
    with patch.dict(
        os.environ,
        {
            "ALPACA_API_KEY_ID": "env-key",
            "ALPACA_API_SECRET_KEY": "env-secret",
            "ALPACA_PAPER_DISABLED": "",
        },
        clear=True,
    ):
        assert ap.alpaca_credential_source(
            {"ALPACA_API_KEY_ID": "req-key", "ALPACA_API_SECRET_KEY": "req-secret"}
        ) == "request"
        assert ap.alpaca_credential_source(None) == "env"
