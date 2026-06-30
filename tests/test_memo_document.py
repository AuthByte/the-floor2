"""Unit tests for memo_document builder."""

from __future__ import annotations

from app.backend.services.memo_document import build_memo_document


def test_build_memo_document_minimal():
    payload = {
        "decisions": {"NVDA": {"action": "buy", "confidence": 72, "reasoning": "Growth"}},
        "analyst_signals": {},
        "paper_trading": {"enabled": False},
    }
    doc = build_memo_document(payload, run_id="run-1", tickers=["NVDA"])
    assert doc["version"] == 1
    assert doc["runId"] == "run-1"
    assert doc["tickers"] == ["NVDA"]
    assert len(doc["positions"]) == 1
    assert doc["positions"][0]["ticker"] == "NVDA"
    assert doc["footerNote"] == "PAPER ONLY"


def test_build_memo_document_includes_chair_impact():
    payload = {
        "decisions": {"NVDA": {"action": "hold"}},
        "analyst_signals": {},
        "chair_impact": {
            "consult_count": 1,
            "material_count": 1,
            "revisions": [{"prompt": "China?", "before": {}, "after": {}}],
            "decisions": {
                "NVDA": {
                    "changed": True,
                    "before": {"action": "buy"},
                    "after": {"action": "hold"},
                }
            },
        },
    }
    doc = build_memo_document(payload, run_id="run-2", tickers=["NVDA"])
    assert doc["chairImpact"] is not None
    assert doc["chairImpact"]["consultCount"] == 1
    assert doc["chairImpact"]["pmDecisionDelta"][0]["before"] == "BUY"
