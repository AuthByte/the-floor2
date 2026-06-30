"""Build canonical MemoDocument snapshot at shift end (mirrors frontend memoExport)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from app.backend.services.graph import extract_base_agent_key
from src.utils.analysts import ANALYST_CONFIG
from src.utils.data_feed_keys import DATA_FEED_KEYS

_MEMO_EXCLUDED = frozenset(
    {
        "portfolio_manager",
        "risk_management_agent",
        "debate_chamber",
        "argument_room",
    }
)


def _is_memo_investor(agent_id: str) -> bool:
    base = extract_base_agent_key(agent_id)
    if base in DATA_FEED_KEYS or base in _MEMO_EXCLUDED:
        return False
    return base in ANALYST_CONFIG


def _display_name(agent_id: str) -> str:
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    return cfg.get("display_name", base.replace("_", " ").title())


def _collect_opinions(ticker: str, analyst_signals: dict[str, Any]) -> list[dict[str, Any]]:
    opinions: list[dict[str, Any]] = []
    for agent_id, bucket in analyst_signals.items():
        if not isinstance(bucket, dict):
            continue
        if not _is_memo_investor(agent_id):
            continue
        per_ticker = bucket.get(ticker)
        if not isinstance(per_ticker, dict):
            continue
        opinions.append(
            {
                "agentKey": extract_base_agent_key(agent_id),
                "agentName": _display_name(agent_id),
                "signal": per_ticker.get("signal"),
                "confidence": per_ticker.get("confidence"),
                "summary": per_ticker.get("thesis_summary") or per_ticker.get("reasoning"),
            }
        )
    return opinions


def _map_chair_impact(chair_impact: dict[str, Any]) -> Optional[dict[str, Any]]:
    if not chair_impact or not chair_impact.get("consult_count"):
        return None

    revisions = []
    for i, rev in enumerate(chair_impact.get("revisions") or []):
        if not isinstance(rev, dict) or not rev.get("prompt"):
            continue
        revisions.append(
            {
                "agentKey": f"consult-{i}",
                "agentName": "Chair consult",
                "prompt": rev.get("prompt", ""),
                "before": rev.get("before"),
                "after": rev.get("after"),
            }
        )

    pm_delta = []
    for ticker, entry in (chair_impact.get("decisions") or {}).items():
        if not isinstance(entry, dict) or not entry.get("changed"):
            continue
        before = entry.get("before") or {}
        after = entry.get("after") or {}
        pm_delta.append(
            {
                "ticker": ticker,
                "before": str(before.get("action", "hold")).upper(),
                "after": str(after.get("action", "hold")).upper(),
            }
        )

    return {
        "consultCount": chair_impact.get("consult_count", 0),
        "materialCount": chair_impact.get("material_count", 0),
        "consultedAgents": [r["agentKey"] for r in revisions],
        "revisions": revisions,
        "pmDecisionDelta": pm_delta or None,
    }


def build_memo_document(
    complete_payload: dict[str, Any],
    *,
    run_id: str,
    tickers: list[str],
    shift_id: Optional[str] = None,
) -> dict[str, Any]:
    """Minimal MemoDocument v1 — positions, paper desk, chair impact rollup."""
    decisions = complete_payload.get("decisions") or {}
    analyst_signals = complete_payload.get("analyst_signals") or {}
    paper = complete_payload.get("paper_trading")

    positions = []
    for ticker in tickers:
        action = decisions.get(ticker) or {}
        positions.append(
            {
                "ticker": ticker,
                "action": action,
                "opinions": _collect_opinions(ticker, analyst_signals),
            }
        )

    chair = _map_chair_impact(complete_payload.get("chair_impact") or {})

    return {
        "version": 1,
        "runId": run_id,
        "shiftId": shift_id,
        "publishedPostId": None,
        "stampUtc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "tickers": tickers,
        "positions": positions,
        "paperTrading": paper,
        "chairImpact": chair,
        "footerNote": "ALPACA PAPER" if paper and paper.get("enabled") else "PAPER ONLY",
    }
