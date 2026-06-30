"""Unit tests for chair consultation propagation."""

from __future__ import annotations

from copy import deepcopy
from unittest.mock import MagicMock, patch

from src.agents.portfolio_manager import PortfolioDecision, PortfolioManagerOutput
from src.utils.consultation_propagation import (
    build_chair_impact,
    is_material_revision,
    reconcile_chair_impact,
    sync_revision_to_graph,
)
from src.utils.live_run_registry import LiveRunSession


def _revision(
    *,
    b_sig="bullish",
    a_sig="bearish",
    b_conf=74,
    a_conf=68,
    b_pt=100.0,
    a_pt=100.0,
):
    return {
        "id": "r1",
        "ts": "2026-06-17T00:00:00Z",
        "prompt": "China risk?",
        "chair_name": "Finn",
        "before": {
            "signal": b_sig,
            "confidence": b_conf,
            "price_target": b_pt,
        },
        "after": {
            "signal": a_sig,
            "confidence": a_conf,
            "price_target": a_pt,
        },
        "reply_to_user": "Good point.",
    }


def test_is_material_signal_flip():
    assert is_material_revision(_revision()) is True


def test_is_material_conf_delta():
    rev = _revision(b_sig="bullish", a_sig="bullish", b_conf=74, a_conf=76)
    assert is_material_revision(rev) is False
    rev["after"]["confidence"] = 66
    assert is_material_revision(rev) is True


def test_is_material_pt_pct():
    rev = _revision(b_sig="bullish", a_sig="bullish", b_conf=50, a_conf=52, b_pt=100, a_pt=106)
    assert is_material_revision(rev) is True


def test_bind_graph_signals_apply_bucket():
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    graph_signals: dict = {}
    session.graph_signals = graph_signals
    bucket = {"signal": "bullish", "confidence": 70, "reasoning": "moat"}
    session.apply_bucket("warren_buffett_x", "AAPL", bucket)
    assert graph_signals["warren_buffett_x"]["AAPL"]["signal"] == "bullish"


def test_sync_revision_to_graph():
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    graph_signals: dict = {}
    session.graph_signals = graph_signals
    sync_revision_to_graph(session, "agent1", "AAPL", {"signal": "bearish", "confidence": 60})
    assert graph_signals["agent1"]["AAPL"]["signal"] == "bearish"


def test_reconcile_no_consults():
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    graph_result = {
        "messages": [],
        "data": {"analyst_signals": {}, "debate_rounds": [], "tickers": ["AAPL"]},
    }
    assert reconcile_chair_impact(session, graph_result, initial_decisions={"AAPL": {"action": "hold"}}) is None


def test_reconcile_immaterial_only():
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    rev = _revision(b_sig="bullish", a_sig="bullish", b_conf=74, a_conf=76)
    session.analyst_signals["agent1"] = {
        "AAPL": {"revision_history": [rev], "user_consulted": True, "reasoning": "x"}
    }
    graph_result = {
        "messages": [],
        "data": {"analyst_signals": {}, "debate_rounds": [], "tickers": ["AAPL"]},
    }
    initial = {"AAPL": {"action": "buy", "quantity": 5, "confidence": 70}}
    with patch("src.utils.consultation_propagation.generate_trading_decision") as mock_pm:
        out = reconcile_chair_impact(session, graph_result, initial_decisions=initial)
    assert out is not None
    assert out["chair_impact"]["material_count"] == 0
    assert out["decisions"]["AAPL"]["action"] == "buy"
    mock_pm.assert_not_called()


@patch("src.utils.consultation_propagation.generate_trading_decision")
def test_reconcile_pm_changes(mock_pm):
    mock_pm.return_value = PortfolioManagerOutput(
        decisions={
            "AAPL": PortfolioDecision(
                action="hold", quantity=0, confidence=58, reasoning="chair weighed in"
            )
        }
    )
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    session.analyst_signals["agent1"] = {
        "AAPL": {
            "revision_history": [_revision()],
            "user_consulted": True,
            "reasoning": "revised",
            "signal": "bearish",
            "confidence": 68,
        }
    }
    graph_result = {
        "messages": [MagicMock(name="portfolio_manager")],
        "data": {
            "analyst_signals": {
                "risk_management_agent": {
                    "AAPL": {"current_price": 100.0, "remaining_position_limit": 10000}
                }
            },
            "debate_rounds": [],
            "tickers": ["AAPL"],
            "portfolio": {"cash": 100000, "positions": {}},
        },
    }
    initial = {"AAPL": {"action": "buy", "quantity": 10, "confidence": 74}}
    out = reconcile_chair_impact(session, deepcopy(graph_result), initial_decisions=initial)
    assert out is not None
    assert out["decisions"]["AAPL"]["action"] == "hold"
    assert out["chair_impact"]["decisions"]["AAPL"]["changed"] is True
    mock_pm.assert_called_once()


@patch("src.utils.consultation_propagation.generate_trading_decision", side_effect=RuntimeError("llm down"))
def test_reconcile_pm_failure(mock_pm):
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    session.analyst_signals["agent1"] = {
        "AAPL": {
            "revision_history": [_revision()],
            "user_consulted": True,
            "reasoning": "revised",
            "signal": "bearish",
            "confidence": 68,
        }
    }
    graph_result = {
        "messages": [],
        "data": {
            "analyst_signals": {
                "risk_management_agent": {
                    "AAPL": {"current_price": 100.0, "remaining_position_limit": 10000}
                }
            },
            "debate_rounds": [],
            "tickers": ["AAPL"],
            "portfolio": {"cash": 100000, "positions": {}},
        },
    }
    initial = {"AAPL": {"action": "buy", "quantity": 10, "confidence": 74}}
    out = reconcile_chair_impact(session, graph_result, initial_decisions=initial)
    assert out is not None
    assert out["decisions"]["AAPL"]["action"] == "buy"
    assert out["chair_impact"]["propagation_errors"]


def test_build_chair_impact_multiple_revisions():
    session = LiveRunSession(run_id="abc", tickers=["AAPL"])
    revisions = [
        {**_revision(), "agent_id": "a1", "ticker": "AAPL"},
        {**_revision(), "agent_id": "a2", "ticker": "AAPL", "id": "r2"},
    ]
    impact = build_chair_impact(
        session,
        revisions,
        initial_decisions={"AAPL": {"action": "buy", "confidence": 70}},
        final_decisions={"AAPL": {"action": "hold", "confidence": 58}},
        debate_adjustments=[],
        propagation_errors=[],
    )
    assert impact["consult_count"] == 2
    assert impact["decisions"]["AAPL"]["changed"] is True
