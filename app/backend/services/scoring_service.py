"""Score pending agent target outcomes and refresh scorecards."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from src.tools.api import get_prices
from src.utils.agent_tiers import LEGEND_KEYS, QUANT_KEYS, SPECIALIST_KEYS, TIER0_KEYS
from src.utils.target_outcomes import (
    aggregate_agent_scorecards,
    extract_target_outcomes,
    score_direction,
    score_target_hit,
)

logger = logging.getLogger(__name__)

_SCORING_BATCH_SIZE = 200
_SCORING_TIME_BUDGET_S = 50
_STALE_DAYS = 30

# In-memory fallback when Supabase is not configured
_memory_outcomes: list[dict[str, Any]] = []
_memory_scorecards: dict[str, dict[str, Any]] = {}

_TIER_MAP = {
    "legend": LEGEND_KEYS,
    "specialist": SPECIALIST_KEYS,
    "quant": QUANT_KEYS,
    "tier0": TIER0_KEYS,
}

_SORT_FIELDS = frozenset(
    {"direction_hit_rate", "target_hit_rate", "predictions_scored", "avg_confidence"}
)


def store_outcomes_from_payload(
    *,
    shift_id: str | None,
    user_id: str,
    run_id: str | None,
    payload: dict[str, Any],
    post_id: str | None = None,
) -> int:
    """Extract predictions from a completed shift and persist for later scoring."""
    published = datetime.now(timezone.utc)
    rows = extract_target_outcomes(
        shift_id=shift_id,
        user_id=user_id,
        run_id=run_id,
        published_at=published,
        payload=payload,
        post_id=post_id,
    )
    if not rows:
        return 0

    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if sb.configured:
        try:
            sb.client.table("target_outcomes").upsert(
                rows,
                on_conflict="shift_id,agent_key,ticker",
            ).execute()
            return len(rows)
        except Exception as exc:
            logger.warning("Supabase target_outcomes upsert failed: %s", exc)

    global _memory_outcomes
    for row in rows:
        key = (row.get("shift_id"), row.get("agent_key"), row.get("ticker"))
        _memory_outcomes = [
            r
            for r in _memory_outcomes
            if (r.get("shift_id"), r.get("agent_key"), r.get("ticker")) != key
        ]
        _memory_outcomes.append(row)
    return len(rows)


def link_outcomes_to_post(
    *,
    post_id: str,
    shift_id: str,
    user_id: str | None = None,
) -> int:
    """Attach published post_id to target_outcomes for a shift."""
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        global _memory_outcomes
        updated = 0
        for row in _memory_outcomes:
            if row.get("shift_id") == shift_id and (
                user_id is None or row.get("user_id") == user_id
            ):
                row["post_id"] = post_id
                updated += 1
        return updated

    try:
        q = (
            sb.client.table("target_outcomes")
            .update({"post_id": post_id})
            .eq("shift_id", shift_id)
        )
        if user_id:
            q = q.eq("user_id", user_id)
        res = q.execute()
        return len(res.data or [])
    except Exception as exc:
        logger.warning("Failed to link outcomes to post %s: %s", post_id, exc)
        return 0


def _fetch_pending_outcomes() -> list[dict[str, Any]]:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if sb.configured:
        try:
            res = (
                sb.client.table("target_outcomes")
                .select("*")
                .eq("scoring_status", "pending")
                .limit(_SCORING_BATCH_SIZE)
                .execute()
            )
            return list(res.data or [])
        except Exception as exc:
            logger.warning("Failed to fetch pending outcomes: %s", exc)
    return [r for r in _memory_outcomes if r.get("scoring_status") == "pending"][:_SCORING_BATCH_SIZE]


def _price_on_date(ticker: str, date_str: str) -> float | None:
    try:
        end = datetime.strptime(date_str, "%Y-%m-%d")
        start = end.replace(year=end.year - 1)
        df = get_prices(ticker, start.strftime("%Y-%m-%d"), date_str)
        if df is None or df.empty:
            return None
        return float(df.iloc[-1]["close"])
    except Exception:
        return None


def _create_scoring_run(trigger_source: str) -> str | None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return None
    try:
        res = (
            sb.client.table("scoring_runs")
            .insert({"trigger_source": trigger_source})
            .execute()
        )
        rows = res.data or []
        return str(rows[0]["id"]) if rows else None
    except Exception as exc:
        logger.warning("Failed to create scoring_runs row: %s", exc)
        return None


def _finish_scoring_run(
    run_id: str | None,
    *,
    pending_checked: int,
    scored_count: int,
    post_refresh_count: int,
    notification_count: int,
    error_count: int,
    duration_ms: int,
    error_summary: str | None = None,
) -> None:
    if not run_id:
        return
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return
    try:
        sb.client.table("scoring_runs").update(
            {
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "pending_checked": pending_checked,
                "scored_count": scored_count,
                "post_refresh_count": post_refresh_count,
                "notification_count": notification_count,
                "error_count": error_count,
                "duration_ms": duration_ms,
                "error_summary": error_summary,
            }
        ).eq("id", run_id).execute()
    except Exception as exc:
        logger.warning("Failed to finish scoring_runs row %s: %s", run_id, exc)


def _score_single_row(row: dict[str, Any], now: datetime) -> tuple[str, int]:
    """Score one pending row. Returns (status, delta_scored) where status is scored|pending|error."""
    pub_raw = row.get("published_at")
    if not pub_raw:
        return "error", 0
    try:
        published = datetime.fromisoformat(str(pub_raw).replace("Z", "+00:00"))
    except ValueError:
        return "error", 0

    months = int(row.get("time_horizon_months") or 12)
    due_ts = published.timestamp() + months * 30.44 * 86400
    stale_ts = due_ts + _STALE_DAYS * 86400

    if now.timestamp() < due_ts:
        return "pending", 0

    ticker = str(row.get("ticker", "")).upper()
    outcome_date = now.strftime("%Y-%m-%d")
    outcome_price = _price_on_date(ticker, outcome_date)

    if outcome_price is None:
        if now.timestamp() >= stale_ts:
            _update_outcome_row(
                row,
                {
                    "scoring_status": "error",
                    "scored_at": now.isoformat(),
                },
            )
            return "error", 0
        return "pending", 0

    ref = row.get("reference_price")
    signal = row.get("signal")
    target = row.get("price_target")
    ret_pct = None
    if isinstance(ref, (int, float)) and ref > 0:
        ret_pct = (outcome_price - float(ref)) / float(ref) * 100

    update = {
        "outcome_price": outcome_price,
        "outcome_at": now.isoformat(),
        "return_pct": ret_pct,
        "direction_correct": score_direction(float(ref or 0), outcome_price, str(signal)),
        "target_error_pct": (
            abs(outcome_price - float(target)) / float(target) * 100
            if isinstance(target, (int, float)) and target > 0
            else None
        ),
        "target_hit": score_target_hit(
            float(target) if isinstance(target, (int, float)) else None,
            outcome_price,
        ),
        "scoring_status": "scored",
        "scored_at": now.isoformat(),
    }
    _update_outcome_row(row, update)
    return "scored", 1


def _update_outcome_row(row: dict[str, Any], update: dict[str, Any]) -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if sb.configured and row.get("id"):
        try:
            sb.client.table("target_outcomes").update(update).eq("id", row["id"]).execute()
        except Exception as exc:
            logger.warning("Failed to update outcome %s: %s", row.get("id"), exc)
            return
    else:
        row.update(update)
        global _memory_outcomes
        _memory_outcomes = [(row if r is row else r) for r in _memory_outcomes]


def run_scoring_cycle(trigger_source: str = "cron") -> dict[str, Any]:
    """Score outcomes whose horizon has elapsed (batched with time budget)."""
    start = time.monotonic()
    run_id = _create_scoring_run(trigger_source)
    now = datetime.now(timezone.utc)
    total_pending_checked = 0
    scored = 0
    errors = 0

    while (time.monotonic() - start) < _SCORING_TIME_BUDGET_S:
        pending = _fetch_pending_outcomes()
        if not pending:
            break
        total_pending_checked += len(pending)
        for row in pending:
            status, delta = _score_single_row(row, now)
            scored += delta
            if status == "error":
                errors += 1
        if len(pending) < _SCORING_BATCH_SIZE:
            break

    refresh_agent_scorecards()
    post_refresh_count = refresh_post_scorecards()
    from app.backend.services.score_notifications import emit_score_milestone_notifications

    notification_count = emit_score_milestone_notifications()

    duration_ms = int((time.monotonic() - start) * 1000)
    _finish_scoring_run(
        run_id,
        pending_checked=total_pending_checked,
        scored_count=scored,
        post_refresh_count=post_refresh_count,
        notification_count=notification_count,
        error_count=errors,
        duration_ms=duration_ms,
    )
    return {
        "scored": scored,
        "pending_checked": total_pending_checked,
        "post_refresh_count": post_refresh_count,
        "notification_count": notification_count,
        "errors": errors,
        "run_id": run_id,
        "duration_ms": duration_ms,
    }


def refresh_agent_scorecards() -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    rows: list[dict[str, Any]] = []
    if sb.configured:
        try:
            res = (
                sb.client.table("target_outcomes")
                .select("*")
                .eq("scoring_status", "scored")
                .execute()
            )
            rows = list(res.data or [])
        except Exception as exc:
            logger.warning("Failed to load scored outcomes: %s", exc)
    else:
        rows = [r for r in _memory_outcomes if r.get("scoring_status") == "scored"]

    aggregates = aggregate_agent_scorecards(rows)
    global _memory_scorecards
    _memory_scorecards = aggregates

    if not sb.configured:
        return

    for agent_key, card in aggregates.items():
        card["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            sb.client.table("agent_scorecards").upsert(card, on_conflict="agent_key").execute()
        except Exception as exc:
            logger.warning("Failed to upsert scorecard for %s: %s", agent_key, exc)


def refresh_post_scorecards() -> int:
    """Refresh boss scorecards on published posts for due horizons."""
    from app.backend.services.post_scorecard import compute_boss_scorecard, horizon_due
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return 0

    try:
        res = (
            sb.client.table("floor_posts")
            .select("id, tickers, ts_ms, snapshot, scorecard")
            .limit(200)
            .execute()
        )
        posts = list(res.data or [])
    except Exception as exc:
        logger.warning("Failed to load posts for scorecard refresh: %s", exc)
        return 0

    refreshed = 0
    now = datetime.now(timezone.utc)
    for post in posts:
        snapshot = post.get("snapshot")
        ts_ms = post.get("ts_ms")
        if not isinstance(snapshot, dict) or not isinstance(ts_ms, int):
            continue

        tickers = [str(t).upper() for t in (post.get("tickers") or []) if t]
        if not tickers:
            continue

        current_prices: dict[str, float | None] = {}
        for ticker in tickers:
            price = _price_on_date(ticker, now.strftime("%Y-%m-%d"))
            current_prices[ticker] = price

        existing = post.get("scorecard") if isinstance(post.get("scorecard"), dict) else {}
        merged = dict(existing)
        changed = False

        for horizon in ("1w", "1m"):
            if not horizon_due(ts_ms, horizon, now=now):
                continue
            partial = compute_boss_scorecard(snapshot, current_prices, horizon=horizon)
            for key, entry in partial.items():
                if merged.get(key) != entry:
                    merged[key] = entry
                    changed = True

        agent_slice = _agent_outcomes_for_post(str(post.get("id") or ""))
        if agent_slice:
            if merged.get("agent_outcomes") != agent_slice:
                merged["agent_outcomes"] = agent_slice
                changed = True

        if not changed:
            continue

        try:
            sb.client.table("floor_posts").update(
                {
                    "scorecard": merged,
                    "scores_updated_at": now.isoformat(),
                }
            ).eq("id", post["id"]).execute()
            refreshed += 1
        except Exception as exc:
            logger.warning("Failed to refresh post scorecard %s: %s", post.get("id"), exc)

    return refreshed


def _agent_outcomes_for_post(post_id: str) -> dict[str, Any] | None:
    if not post_id:
        return None
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return None
    try:
        res = (
            sb.client.table("target_outcomes")
            .select("agent_key, direction_correct, target_hit, scoring_status")
            .eq("post_id", post_id)
            .execute()
        )
        rows = list(res.data or [])
    except Exception as exc:
        logger.warning("Failed to load agent outcomes for post %s: %s", post_id, exc)
        return None

    if not rows or not all(r.get("scoring_status") == "scored" for r in rows):
        return None

    by_agent: dict[str, dict[str, int]] = {}
    for row in rows:
        key = row.get("agent_key")
        if not key:
            continue
        slot = by_agent.setdefault(
            key,
            {
                "direction_hits": 0,
                "direction_total": 0,
                "target_hits": 0,
                "target_total": 0,
            },
        )
        if row.get("direction_correct") is not None:
            slot["direction_total"] += 1
            if row.get("direction_correct"):
                slot["direction_hits"] += 1
        if row.get("target_hit") is not None:
            slot["target_total"] += 1
            if row.get("target_hit"):
                slot["target_hits"] += 1

    return by_agent or None


def fetch_agent_scorecards(
    keys: list[str] | None = None,
    *,
    min_n: int = 0,
    sort: str = "direction_hit_rate",
    order: str = "desc",
    limit: int = 100,
) -> dict[str, dict[str, Any]]:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    cards: list[dict[str, Any]] = []
    if sb.configured:
        try:
            q = sb.client.table("agent_scorecards").select("*")
            if keys:
                q = q.in_("agent_key", keys)
            res = q.execute()
            cards = list(res.data or [])
        except Exception as exc:
            logger.warning("Failed to fetch scorecards: %s", exc)
    else:
        cards = list(_memory_scorecards.values())
        if keys:
            cards = [c for c in cards if c.get("agent_key") in keys]

    filtered = [c for c in cards if int(c.get("predictions_scored") or 0) >= min_n]
    sort_key = sort if sort in _SORT_FIELDS else "direction_hit_rate"
    reverse = order != "asc"

    def sort_val(card: dict[str, Any]) -> float:
        val = card.get(sort_key)
        if isinstance(val, (int, float)):
            return float(val)
        return -1.0

    filtered.sort(key=sort_val, reverse=reverse)
    if limit > 0:
        filtered = filtered[: min(limit, 200)]

    return {str(c["agent_key"]): c for c in filtered if c.get("agent_key")}


def fetch_leaderboard(
    *,
    tier: str = "all",
    sort: str = "direction_hit_rate",
    order: str = "desc",
    min_n: int = 10,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    from src.utils.analysts import get_agents_list

    if tier not in (*_TIER_MAP.keys(), "all"):
        raise ValueError(f"Invalid tier: {tier}")
    if sort not in _SORT_FIELDS:
        raise ValueError(f"Invalid sort: {sort}")

    min_n = max(10, min_n)
    limit = min(max(1, limit), 100)
    offset = max(0, offset)

    cards = list(
        fetch_agent_scorecards(
            min_n=min_n,
            sort=sort,
            order=order,
            limit=500,
        ).values()
    )

    tier_keys = _TIER_MAP.get(tier)
    if tier_keys is not None:
        cards = [c for c in cards if c.get("agent_key") in tier_keys]

    total = len(cards)
    page = cards[offset : offset + limit]

    display_names = {a["key"]: a["display_name"] for a in get_agents_list()}

    def agent_tier(agent_key: str) -> str:
        if agent_key in LEGEND_KEYS:
            return "legend"
        if agent_key in SPECIALIST_KEYS:
            return "specialist"
        if agent_key in QUANT_KEYS:
            return "quant"
        if agent_key in TIER0_KEYS:
            return "tier0"
        return "all"

    entries = []
    for idx, card in enumerate(page, start=offset + 1):
        agent_key = str(card.get("agent_key", ""))
        entries.append(
            {
                "rank": idx,
                "agent_key": agent_key,
                "display_name": display_names.get(agent_key, agent_key.replace("_", " ").title()),
                "tier": agent_tier(agent_key),
                "predictions_scored": card.get("predictions_scored"),
                "direction_hit_rate": card.get("direction_hit_rate"),
                "target_hit_rate": card.get("target_hit_rate"),
                "avg_confidence": card.get("avg_confidence"),
                "with_price_target": card.get("with_price_target"),
            }
        )

    snapshot_at = None
    if page:
        snapshot_at = page[0].get("updated_at")

    return {
        "entries": entries,
        "meta": {
            "tier": tier,
            "sort": sort,
            "min_n": min_n,
            "total": total,
            "offset": offset,
            "limit": limit,
            "snapshot_at": snapshot_at,
        },
    }
