"""Persist completed shifts to Supabase from the API."""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


def _summary_lines(decisions: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not decisions:
        return []
    out: list[dict[str, Any]] = []
    for ticker, d in decisions.items():
        if not isinstance(d, dict):
            continue
        conf = d.get("confidence")
        out.append(
            {
                "ticker": ticker,
                "action": d.get("action", "hold"),
                "confidence": round(max(0, min(100, float(conf))))
                if isinstance(conf, (int, float))
                else None,
            }
        )
    return out


def archive_shift_to_supabase(
    *,
    user_id: str,
    run_id: str,
    tickers: list[str],
    model: str,
    initial_cash: float,
    analyst_count: int,
    payload: dict[str, Any],
    replay: dict[str, Any] | None = None,
) -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return

    decisions = payload.get("decisions")
    payload_replay = payload.get("replay")
    resolved_replay = replay
    if resolved_replay is None and isinstance(payload_replay, dict) and payload_replay.get("timeline"):
        resolved_replay = payload_replay

    row: dict[str, Any] = {
        "user_id": user_id,
        "run_id": run_id,
        "ts_ms": int(time.time() * 1000),
        "tickers": tickers,
        "model": model,
        "initial_cash": initial_cash,
        "analyst_count": analyst_count,
        "summary": _summary_lines(decisions if isinstance(decisions, dict) else None),
        "decisions": decisions,
        "prices": payload.get("current_prices"),
        "payload": payload,
    }
    # Omit replay when absent so merge-upsert does not wipe client-archived timelines.
    if isinstance(resolved_replay, dict) and resolved_replay.get("timeline"):
        row["replay"] = resolved_replay
    try:
        shift_row = sb.upsert_shift(row)
        shift_id = shift_row.get("id") if shift_row else None
        from app.backend.services.scoring_service import store_outcomes_from_payload

        store_outcomes_from_payload(
            shift_id=shift_id,
            user_id=user_id,
            run_id=run_id,
            payload=payload,
        )
    except Exception as exc:
        logger.warning("Shift archive to Supabase failed: %s", exc)
