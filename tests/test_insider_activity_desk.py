"""Smoke tests for insider_activity_desk agent."""

from __future__ import annotations

from src.agents.insider_activity_desk import analyze_insider_activity_desk
from src.utils.interactive_artifacts import build_insider_cluster_card, build_insider_timeline
from tests.test_insider_utils import _trade


def test_analyze_empty_trades():
    result = analyze_insider_activity_desk({"end_date": "2024-03-08", "insider_trades": []})
    assert "score" in result
    assert "max_score" in result
    assert result["max_score"] == 10
    assert result["score"] == 0


def test_analyze_single_sale():
    trades = [
        _trade(
            filing_date="2024-03-01",
            transaction_shares=-100,
            transaction_date="2024-03-01",
            transaction_price_per_share=10.0,
        ),
    ]
    result = analyze_insider_activity_desk({"end_date": "2024-03-08", "insider_trades": trades})
    assert result["net_shares_90d"] <= 0


def test_artifact_payload_shape():
    trades = [
        _trade(
            filing_date="2024-03-01",
            transaction_shares=500,
            transaction_date="2024-03-01",
            name="Jane CEO",
            title="Chief Executive Officer",
            transaction_price_per_share=150.0,
        ),
    ]
    analysis = analyze_insider_activity_desk({"end_date": "2024-03-08", "insider_trades": trades})
    timeline = build_insider_timeline("AAPL", analysis)
    cluster = build_insider_cluster_card("AAPL", analysis)

    assert timeline["kind"] == "insider_timeline"
    assert "bars" in timeline["data"]
    assert cluster["kind"] == "insider_cluster_card"
    assert "buyers" in cluster["data"]
    assert "cluster_score" in cluster["data"]
