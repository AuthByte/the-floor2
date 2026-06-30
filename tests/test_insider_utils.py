"""Unit tests for shared insider analysis utilities."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.agents._insider_utils import (
    classify_officer,
    compute_insider_metrics,
    insider_tone,
    normalize_trades,
    score_insider_activity,
    score_insider_trades,
    window_trades,
)
from src.data.models import InsiderTrade

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "api" / "insider_trades" / "AAPL_2024-03-01_2024-03-08.json"


def _trade(**kwargs) -> InsiderTrade:
  return InsiderTrade(
      ticker=kwargs.get("ticker", "X"),
      issuer=kwargs.get("issuer"),
      name=kwargs.get("name"),
      title=kwargs.get("title"),
      is_board_director=kwargs.get("is_board_director"),
      transaction_date=kwargs.get("transaction_date"),
      transaction_shares=kwargs.get("transaction_shares"),
      transaction_price_per_share=kwargs.get("transaction_price_per_share"),
      transaction_value=kwargs.get("transaction_value"),
      shares_owned_before_transaction=kwargs.get("shares_owned_before_transaction"),
      shares_owned_after_transaction=kwargs.get("shares_owned_after_transaction"),
      security_title=kwargs.get("security_title"),
      filing_date=kwargs["filing_date"],
  )


def _load_aapl_fixture() -> list[InsiderTrade]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return [InsiderTrade(**row) for row in data["insider_trades"]]


def test_classify_officer_ranks():
    assert classify_officer("Chief Executive Officer", False) == "ceo"
    assert classify_officer("Chief Financial Officer", False) == "cfo"
    assert classify_officer("Executive Vice President", False) == "officer"
    assert classify_officer(None, True) == "director"


def test_normalize_drops_sec_stub_when_rich_row_shares_filing_date():
    rich = _trade(
        ticker="AAPL",
        filing_date="2024-03-01",
        name="Jane Doe",
        transaction_shares=1000,
        transaction_date="2024-02-28",
        security_title="Common Stock",
        transaction_price_per_share=10.0,
    )
    stub = _trade(
        ticker="AAPL",
        filing_date="2024-03-01",
        name="SEC Form 4",
        transaction_shares=0,
    )
    out = normalize_trades([stub, rich], as_of="2024-03-08")
    assert len(out) == 1
    assert out[0].name == "Jane Doe"


def test_window_trades_inclusive():
    trades = [
        _trade(filing_date="2024-03-01", transaction_shares=10, transaction_date="2024-03-01"),
        _trade(filing_date="2024-01-01", transaction_shares=-5, transaction_date="2024-01-01"),
    ]
    windowed = window_trades(trades, end="2024-03-08", days=30)
    assert len(windowed) == 1


def test_compute_insider_metrics_keys():
    trades = _load_aapl_fixture()
    metrics = compute_insider_metrics(trades, as_of="2024-03-08")
    for key in (
        "net_shares_30d",
        "net_shares_90d",
        "net_shares_365d",
        "unique_buyers_30d",
        "cluster_score",
        "buy_ratio",
        "details",
    ):
        assert key in metrics
    assert 0 <= metrics["cluster_score"] <= 10


def test_score_modes_desk_burry_druck():
    trades = _load_aapl_fixture()
    as_of = "2024-03-08"
    desk = score_insider_trades(trades, as_of=as_of, mode="desk")
    burry = score_insider_trades(trades, as_of=as_of, mode="burry")
    druck = score_insider_trades(trades, as_of=as_of, mode="druck")

    assert desk["max_score"] == 10
    assert 0 <= desk["score"] <= 10
    assert burry["max_score"] == 2
    assert 0 <= burry["score"] <= 2
    assert 0 <= druck["score"] <= 10


def test_burry_empty_trades():
    metrics = compute_insider_metrics([], as_of="2024-03-08", normalize=False)
    result = score_insider_activity(metrics, mode="burry")
    assert result["score"] == 0
    assert result["max_score"] == 2
    assert "No insider trade data" in result["details"]


def test_druck_buy_ratio_buckets():
    trades = [
        _trade(filing_date="2024-03-01", transaction_shares=100, transaction_date="2024-03-01"),
        _trade(filing_date="2024-03-02", transaction_shares=50, transaction_date="2024-03-02"),
        _trade(filing_date="2024-03-03", transaction_shares=25, transaction_date="2024-03-03"),
        _trade(filing_date="2024-03-04", transaction_shares=-10, transaction_date="2024-03-04"),
    ]
    metrics = compute_insider_metrics(trades, as_of="2024-03-08", normalize=False)
    heavy = score_insider_activity(metrics, mode="druck")
    assert heavy["score"] == 8

    sell_heavy = [
        _trade(filing_date="2024-03-01", transaction_shares=-100, transaction_date="2024-03-01"),
        _trade(filing_date="2024-03-02", transaction_shares=-50, transaction_date="2024-03-02"),
        _trade(filing_date="2024-03-03", transaction_shares=10, transaction_date="2024-03-03"),
    ]
    metrics_sell = compute_insider_metrics(sell_heavy, as_of="2024-03-08", normalize=False)
    light = score_insider_activity(metrics_sell, mode="druck")
    assert light["score"] == 4


def test_insider_tone_wrapper():
    trades = [
        _trade(filing_date="2024-03-01", transaction_shares=10, transaction_date="2024-03-01"),
        _trade(filing_date="2024-03-02", transaction_shares=-5, transaction_date="2024-03-02"),
    ]
    tone = insider_tone(trades, as_of="2024-03-08")
    assert tone["buys"] == 1
    assert tone["sells"] == 1
    assert tone["buy_ratio"] == 0.5
