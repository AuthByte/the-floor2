"""Unit tests for per-ticker knowledge dossiers."""

from __future__ import annotations

from src.utils.ticker_dossier import (
    claim_ids_for_signal,
    dossier_prompt_block,
    get_dossier,
    ingest_tier0_into_dossiers,
    record_ticker_claim,
)


def _state(**data_overrides):
    return {"data": {"analyst_signals": {}, "ticker_dossiers": {}, **data_overrides}}


def test_ingest_tier0_creates_desk_facts():
    state = _state(
        analyst_signals={
            "fundamentals_analyst_agent": {
                "AAPL": {
                    "signal": "bullish",
                    "confidence": 72,
                    "reasoning": {
                        "profitability": {"signal": "bullish", "details": "ROE expanding"},
                        "sec_earnings": {"eps": 1.52, "revenue_yoy_pct": 4.2},
                    },
                }
            }
        }
    )
    ingest_tier0_into_dossiers(state, ["AAPL"])
    dossier = get_dossier(state, "AAPL")

    assert len(dossier["facts"]) >= 3
    kinds = {f["kind"] for f in dossier["facts"]}
    assert "desk_signal" in kinds
    assert "pillar" in kinds
    assert "sec_metric" in kinds


def test_record_claim_links_desk_facts_and_detects_conflict():
    state = _state()
    state["data"]["analyst_signals"] = {
        "technical_analyst_agent": {
            "MSFT": {"signal": "bullish", "confidence": 60, "reasoning": "uptrend"},
        }
    }
    ingest_tier0_into_dossiers(state, ["MSFT"])

    record_ticker_claim(
        state,
        agent_id="warren_buffett_agent",
        ticker="MSFT",
        signal="bullish",
        confidence=80,
        text="Wide moat compounder.",
    )
    record_ticker_claim(
        state,
        agent_id="unknown_unknowns_agent",
        ticker="MSFT",
        signal="bearish",
        confidence=70,
        text="Hidden leverage risk.",
        contradicts=claim_ids_for_signal(state, "MSFT", "bullish"),
    )

    dossier = get_dossier(state, "MSFT")
    assert len(dossier["claims"]) == 2
    assert dossier["claims"][0]["supports"]
    assert any(d["kind"] == "signal_conflict" for d in dossier["disputes"])


def test_dossier_prompt_block_includes_disputes():
    dossier = {
        "facts": [{"id": "fact_0", "label": "Tape", "value": "bullish", "detail": None}],
        "claims": [],
        "disputes": [{"summary": "Bull/bear split"}],
    }
    state = {"data": {"ticker_dossiers": {"NVDA": dossier}}}
    block = dossier_prompt_block(state, "NVDA")
    assert "NVDA" in block
    assert "Open disputes" in block
    assert "Bull/bear split" in block
