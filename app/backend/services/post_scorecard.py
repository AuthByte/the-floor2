"""Boss / post scorecard refresh — Python port of floorSocial/scorecard.ts."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

HOLD_FLAT_THRESHOLD_PCT = 2.0


def evaluate_boss_call(
    boss_action: str | None,
    publish_price: float,
    current_price: float,
) -> bool:
    if not boss_action or publish_price <= 0:
        return False

    pnl_pct = (current_price - publish_price) / publish_price * 100

    if boss_action in ("buy", "cover"):
        return pnl_pct > 0
    if boss_action in ("sell", "short"):
        return pnl_pct < 0
    if boss_action == "hold":
        return abs(pnl_pct) <= HOLD_FLAT_THRESHOLD_PCT
    return False


def compute_boss_scorecard(
    snapshot: dict[str, Any],
    current_prices: dict[str, float | None],
    *,
    horizon: str = "1w",
) -> dict[str, Any]:
    """Build scorecard entries keyed as TICKER:horizon."""
    scorecard: dict[str, Any] = {}
    tickers = snapshot.get("tickers") or []

    for ticker_snap in tickers:
        if not isinstance(ticker_snap, dict):
            continue
        ticker = str(ticker_snap.get("ticker", "")).upper()
        if not ticker:
            continue

        publish_price = ticker_snap.get("price")
        raw_current = current_prices.get(ticker)
        current_price = (
            float(raw_current)
            if isinstance(raw_current, (int, float)) and raw_current > 0
            else None
        )
        boss_decision = ticker_snap.get("bossDecision") or {}
        boss_action = boss_decision.get("action") if isinstance(boss_decision, dict) else None

        pnl_pct = None
        if (
            isinstance(publish_price, (int, float))
            and publish_price > 0
            and current_price is not None
        ):
            pnl_pct = (current_price - float(publish_price)) / float(publish_price) * 100

        entry: dict[str, Any] = {
            "publishPrice": publish_price,
            "currentPrice": current_price,
            "bossAction": boss_action,
            "pnlPct": pnl_pct,
            "horizon": horizon,
        }

        if boss_action and isinstance(publish_price, (int, float)) and current_price is not None:
            entry["correct"] = evaluate_boss_call(boss_action, float(publish_price), current_price)

        scorecard[f"{ticker}:{horizon}"] = entry

    return scorecard


def horizon_due(ts_ms: int, horizon: str, *, now: datetime | None = None) -> bool:
    """Return True when enough time has passed since publish for the horizon."""
    now = now or datetime.now(timezone.utc)
    published = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    if horizon == "1w":
        due = published + timedelta(days=7)
    elif horizon == "1m":
        due = published + timedelta(days=30)
    else:
        return False
    return now >= due
