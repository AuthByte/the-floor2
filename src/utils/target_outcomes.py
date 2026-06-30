"""Extract and score agent price-target predictions from shift payloads."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from src.utils.consultation import extract_base_agent_key

logger = logging.getLogger(__name__)

MEMO_EXCLUDE = {
    "portfolio_manager",
    "risk_management_agent",
    "debate_chamber",
    "argument_room",
    "consultation",
}


def is_scorable_agent(agent_id: str) -> bool:
    base = extract_base_agent_key(agent_id)
    if base in MEMO_EXCLUDE:
        return False
    return True


def extract_target_outcomes(
    *,
    shift_id: str | None,
    user_id: str,
    run_id: str | None,
    published_at: datetime,
    payload: dict[str, Any],
    post_id: str | None = None,
) -> list[dict[str, Any]]:
    """Build rows for target_outcomes from analyst_signals."""
    signals = payload.get("analyst_signals") or {}
    prices = payload.get("current_prices") or {}
    rows: list[dict[str, Any]] = []

    for agent_id, by_ticker in signals.items():
        if not is_scorable_agent(agent_id):
            continue
        if not isinstance(by_ticker, dict):
            continue
        agent_key = extract_base_agent_key(agent_id)
        for ticker, bucket in by_ticker.items():
            if not isinstance(bucket, dict):
                continue
            signal = bucket.get("signal")
            if signal not in ("bullish", "bearish", "neutral"):
                continue
            ref = bucket.get("reference_price")
            if ref is None and isinstance(prices, dict):
                ref = prices.get(ticker)
            horizon = bucket.get("time_horizon_months")
            if horizon is None:
                horizon = 12
            try:
                horizon = int(horizon)
            except (TypeError, ValueError):
                horizon = 12

            rows.append(
                {
                    "shift_id": shift_id,
                    "post_id": post_id,
                    "user_id": user_id,
                    "run_id": run_id,
                    "agent_key": agent_key,
                    "ticker": str(ticker).upper(),
                    "published_at": published_at.isoformat(),
                    "signal": signal,
                    "confidence": bucket.get("confidence"),
                    "reference_price": ref,
                    "price_target": bucket.get("price_target"),
                    "upside_pct": bucket.get("upside_pct"),
                    "time_horizon_months": horizon,
                    "scoring_status": "pending",
                }
            )
    return rows


def score_direction(reference_price: float, outcome_price: float, signal: str) -> bool | None:
    if reference_price <= 0 or outcome_price <= 0:
        return None
    ret = (outcome_price - reference_price) / reference_price
    if signal == "bullish":
        return ret > 0.02
    if signal == "bearish":
        return ret < -0.02
    return abs(ret) < 0.05


def score_target_hit(price_target: float | None, outcome_price: float, tolerance: float = 0.12) -> bool | None:
    if price_target is None or price_target <= 0 or outcome_price <= 0:
        return None
    err = abs(outcome_price - price_target) / price_target
    return err <= tolerance


def aggregate_agent_scorecards(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Roll up scored target_outcomes into per-agent aggregates."""
    by_agent: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if row.get("scoring_status") != "scored":
            continue
        key = row.get("agent_key")
        if not key:
            continue
        by_agent.setdefault(key, []).append(row)

    out: dict[str, dict[str, Any]] = {}
    for agent_key, items in by_agent.items():
        dir_hits = [i["direction_correct"] for i in items if i.get("direction_correct") is not None]
        target_hits = [i["target_hit"] for i in items if i.get("target_hit") is not None]
        confs = [float(i["confidence"]) for i in items if isinstance(i.get("confidence"), (int, float))]
        out[agent_key] = {
            "agent_key": agent_key,
            "predictions_scored": len(items),
            "direction_hit_rate": (sum(1 for x in dir_hits if x) / len(dir_hits)) if dir_hits else None,
            "target_hit_rate": (sum(1 for x in target_hits if x) / len(target_hits)) if target_hits else None,
            "avg_confidence": (sum(confs) / len(confs)) if confs else None,
            "with_price_target": sum(1 for i in items if i.get("price_target") is not None),
        }
    return out


def due_horizon_date(published_at: datetime, months: int) -> datetime:
    return published_at + timedelta(days=int(months * 30.44))
