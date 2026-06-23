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
) -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return

    decisions = payload.get("decisions")
    row = {
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
        "replay": None,
    }
    try:
        sb.upsert_shift(row)
    except Exception as exc:
        logger.warning("Shift archive to Supabase failed: %s", exc)
