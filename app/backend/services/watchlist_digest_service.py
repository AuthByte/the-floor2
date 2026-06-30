"""Daily / weekly watchlist digest notifications for opted-in members."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.backend.services.memo_email import (
    RESEND_API_URL,
    resolve_resend_api_key,
    resolve_resend_from,
)

logger = logging.getLogger(__name__)

_VALID_CADENCES = frozenset({"daily", "weekly"})


def _parse_watchlist_tickers(raw: str) -> list[str]:
    return [t.strip().upper() for t in raw.replace(",", " ").split() if t.strip()]


def _daily_period(now: datetime) -> tuple[datetime, datetime]:
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return end - timedelta(days=1), end


def _weekly_period(now: datetime) -> tuple[datetime, datetime]:
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Prior Mon 00:00 UTC through this Mon 00:00 UTC
    days_since_monday = end.weekday()
    end = end - timedelta(days=days_since_monday)
    return end - timedelta(days=7), end


def _period_for_cadence(cadence: str, now: datetime) -> tuple[datetime, datetime]:
    if cadence == "weekly":
        return _weekly_period(now)
    return _daily_period(now)


def _tickers_overlap(row_tickers: list[str] | None, watchlist_tickers: set[str]) -> bool:
    if not row_tickers or not watchlist_tickers:
        return False
    return bool(watchlist_tickers.intersection(t.upper() for t in row_tickers))


def _consensus_from_snapshot(snapshot: Any) -> dict[str, dict[str, int]]:
    consensus: dict[str, dict[str, int]] = {}
    if not isinstance(snapshot, dict):
        return consensus
    tickers = snapshot.get("tickers")
    if not isinstance(tickers, list):
        return consensus
    for entry in tickers:
        if not isinstance(entry, dict):
            continue
        symbol = str(entry.get("ticker") or "").upper()
        if not symbol:
            continue
        tally = entry.get("tally")
        if not isinstance(tally, dict):
            continue
        consensus[symbol] = {
            "bullish": int(tally.get("bullish") or 0),
            "bearish": int(tally.get("bearish") or 0),
            "neutral": int(tally.get("neutral") or 0),
        }
    return consensus


def _merge_consensus(
    target: dict[str, dict[str, int]],
    incoming: dict[str, dict[str, int]],
) -> None:
    for symbol, tallies in incoming.items():
        bucket = target.setdefault(symbol, {"bullish": 0, "bearish": 0, "neutral": 0})
        bucket["bullish"] += tallies.get("bullish", 0)
        bucket["bearish"] += tallies.get("bearish", 0)
        bucket["neutral"] += tallies.get("neutral", 0)


def _scorecard_hits(
    post: dict[str, Any],
    *,
    include: bool,
) -> list[dict[str, Any]]:
    if not include:
        return []
    scorecard = post.get("scorecard")
    if not isinstance(scorecard, dict):
        return []
    post_id = str(post.get("id") or "")
    hits: list[dict[str, Any]] = []
    for key, entry in scorecard.items():
        if not isinstance(entry, dict) or not entry.get("correct"):
            continue
        if ":" not in str(key):
            continue
        ticker, horizon = str(key).rsplit(":", 1)
        if horizon not in ("1w", "1m"):
            continue
        hits.append(
            {
                "postId": post_id,
                "ticker": ticker,
                "horizon": horizon,
                "correct": True,
            }
        )
    return hits


def _build_watchlist_summary(
    watchlist: dict[str, Any],
    shifts: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    *,
    include_scorecard_hits: bool,
) -> dict[str, Any] | None:
    wl_id = str(watchlist.get("id") or "")
    label = str(watchlist.get("label") or "Watchlist")
    wl_tickers = set(_parse_watchlist_tickers(str(watchlist.get("tickers") or "")))
    if not wl_tickers:
        return None

    matched_shifts = [
        s
        for s in shifts
        if _tickers_overlap(list(s.get("tickers") or []), wl_tickers)
    ]
    matched_posts = [
        p
        for p in posts
        if str(p.get("watchlist_id") or "") == wl_id
        or _tickers_overlap(list(p.get("tickers") or []), wl_tickers)
    ]

    if not matched_shifts and not matched_posts:
        return None

    tickers_covered: set[str] = set()
    for row in matched_shifts + matched_posts:
        for t in row.get("tickers") or []:
            upper = str(t).upper()
            if upper in wl_tickers:
                tickers_covered.add(upper)

    consensus: dict[str, dict[str, int]] = {}
    scorecard_hits: list[dict[str, Any]] = []
    for post in matched_posts:
        _merge_consensus(consensus, _consensus_from_snapshot(post.get("snapshot")))
        scorecard_hits.extend(
            _scorecard_hits(post, include=include_scorecard_hits),
        )

    summary: dict[str, Any] = {
        "watchlistId": wl_id,
        "label": label,
        "tickersCovered": sorted(tickers_covered),
        "shiftCount": len(matched_shifts),
        "postIds": [str(p.get("id")) for p in matched_posts if p.get("id")],
        "consensus": consensus,
    }
    if scorecard_hits:
        summary["scorecardHits"] = scorecard_hits
    return summary


def _digest_body(cadence: str, watchlists: list[dict[str, Any]]) -> str:
    cadence_label = "Daily" if cadence == "daily" else "Weekly"
    total_shifts = sum(int(w.get("shiftCount") or 0) for w in watchlists)
    labels = [str(w.get("label") or "list") for w in watchlists]
    if not labels:
        return f"{cadence_label} watchlist digest — no activity in the prior period."
    joined = ", ".join(labels[:3])
    if len(labels) > 3:
        joined += f" +{len(labels) - 3} more"
    return f"{cadence_label} watchlist digest — {total_shifts} shift{'s' if total_shifts != 1 else ''} across {joined}."


def _digest_already_sent(
    sb: Any,
    *,
    user_id: str,
    cadence: str,
    period_start: datetime,
) -> bool:
    try:
        res = (
            sb.client.table("digest_runs")
            .select("id")
            .eq("user_id", user_id)
            .eq("cadence", cadence)
            .eq("period_start", period_start.isoformat())
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        logger.warning("digest_runs lookup failed for %s: %s", user_id, exc)
        return False


def _record_digest_run(
    sb: Any,
    *,
    user_id: str,
    cadence: str,
    period_start: datetime,
    period_end: datetime,
    notification_id: str | None,
) -> None:
    try:
        sb.client.table("digest_runs").insert(
            {
                "user_id": user_id,
                "cadence": cadence,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "notification_id": notification_id,
            }
        ).execute()
    except Exception as exc:
        err = str(exc).lower()
        if "duplicate" in err or "unique" in err:
            return
        logger.warning("Failed to record digest_run for %s: %s", user_id, exc)


def _send_digest_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
) -> bool:
    recipient = to_email.strip()
    api_key = resolve_resend_api_key(None)
    if not api_key or "@" not in recipient:
        return False
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": resolve_resend_from(),
                    "to": [recipient],
                    "subject": subject,
                    "text": text_body,
                },
            )
        if resp.status_code >= 400:
            logger.warning("Digest email failed %s: %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as exc:
        logger.warning("Digest email error: %s", exc)
        return False


def _email_body(cadence: str, watchlists: list[dict[str, Any]]) -> str:
    lines = [_digest_body(cadence, watchlists), ""]
    for wl in watchlists:
        lines.append(f"• {wl.get('label')} — {wl.get('shiftCount', 0)} shifts")
        covered = wl.get("tickersCovered") or []
        if covered:
            lines.append(f"  Tickers: {', '.join(covered)}")
        hits = wl.get("scorecardHits") or []
        if hits:
            lines.append(f"  Scorecard hits: {len(hits)}")
    lines.append("")
    lines.append("Open THE FLOOR to view your full digest.")
    return "\n".join(lines)


def _process_user_digest(
    sb: Any,
    *,
    user_id: str,
    settings: dict[str, Any],
    cadence: str,
    period_start: datetime,
    period_end: datetime,
) -> dict[str, Any]:
    prefs = settings.get("watchlistDigest") or {}
    if not prefs.get("enabled"):
        return {"skipped": True, "reason": "disabled"}

    user_cadence = prefs.get("cadence") or "daily"
    if user_cadence != cadence:
        return {"skipped": True, "reason": "cadence_mismatch"}

    if _digest_already_sent(
        sb,
        user_id=user_id,
        cadence=cadence,
        period_start=period_start,
    ):
        return {"skipped": True, "reason": "already_sent"}

    try:
        wl_res = (
            sb.client.table("watchlists")
            .select("id, label, tickers, sort_order")
            .eq("user_id", user_id)
            .order("sort_order")
            .execute()
        )
        watchlists = list(wl_res.data or [])
    except Exception as exc:
        logger.warning("Failed to load watchlists for %s: %s", user_id, exc)
        return {"error": str(exc)}

    if not watchlists:
        return {"skipped": True, "reason": "no_watchlists"}

    start_ms = int(period_start.timestamp() * 1000)
    end_ms = int(period_end.timestamp() * 1000)

    try:
        shift_res = (
            sb.client.table("shifts")
            .select("id, tickers, ts_ms, summary, payload")
            .eq("user_id", user_id)
            .gte("ts_ms", start_ms)
            .lt("ts_ms", end_ms)
            .execute()
        )
        shifts = list(shift_res.data or [])
    except Exception as exc:
        logger.warning("Failed to load shifts for %s: %s", user_id, exc)
        return {"error": str(exc)}

    try:
        post_res = (
            sb.client.table("floor_posts")
            .select("id, tickers, published_at, watchlist_id, snapshot, scorecard")
            .eq("author_id", user_id)
            .gte("published_at", period_start.isoformat())
            .lt("published_at", period_end.isoformat())
            .execute()
        )
        posts = list(post_res.data or [])
    except Exception as exc:
        logger.warning("Failed to load posts for %s: %s", user_id, exc)
        return {"error": str(exc)}

    include_hits = prefs.get("includeScorecardHits", True) is not False
    summaries = [
        s
        for wl in watchlists
        if (s := _build_watchlist_summary(wl, shifts, posts, include_scorecard_hits=include_hits))
    ]

    if not summaries:
        return {"skipped": True, "reason": "empty"}

    metadata = {
        "version": 1,
        "cadence": cadence,
        "periodStart": period_start.isoformat(),
        "periodEnd": period_end.isoformat(),
        "watchlists": summaries,
    }
    body = _digest_body(cadence, summaries)

    notification_id: str | None = None
    try:
        res = (
            sb.client.table("notifications")
            .insert(
                {
                    "user_id": user_id,
                    "kind": "watchlist_digest",
                    "body": body,
                    "metadata": metadata,
                }
            )
            .execute()
        )
        rows = res.data or []
        if rows:
            notification_id = str(rows[0].get("id") or "") or None
    except Exception as exc:
        logger.warning("Failed to insert watchlist_digest for %s: %s", user_id, exc)
        return {"error": str(exc)}

    _record_digest_run(
        sb,
        user_id=user_id,
        cadence=cadence,
        period_start=period_start,
        period_end=period_end,
        notification_id=notification_id,
    )

    emailed = False
    if prefs.get("email"):
        email_to = (
            str(prefs.get("emailAddress") or "").strip()
            or str(settings.get("digestEmail") or "").strip()
        )
        if email_to:
            cadence_label = "Daily" if cadence == "daily" else "Weekly"
            emailed = _send_digest_email(
                to_email=email_to,
                subject=f"THE FLOOR — {cadence_label} watchlist digest",
                text_body=_email_body(cadence, summaries),
            )

    return {
        "notified": True,
        "notification_id": notification_id,
        "watchlist_count": len(summaries),
        "shift_count": sum(int(s.get("shiftCount") or 0) for s in summaries),
        "emailed": emailed,
    }


def run_digest_cycle(cadence: str = "daily", trigger_source: str = "cron") -> dict[str, Any]:
    """Batch digest notifications for users with watchlistDigest.enabled."""
    if cadence not in _VALID_CADENCES:
        raise ValueError(f"cadence must be one of {sorted(_VALID_CADENCES)}")

    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return {
            "cadence": cadence,
            "trigger_source": trigger_source,
            "configured": False,
            "users_processed": 0,
            "notifications": 0,
            "emails": 0,
            "skipped": 0,
            "errors": 0,
        }

    start = time.monotonic()
    now = datetime.now(timezone.utc)
    period_start, period_end = _period_for_cadence(cadence, now)

    users_processed = 0
    notifications = 0
    emails = 0
    skipped = 0
    errors = 0

    try:
        res = sb.client.table("user_settings").select("user_id, settings").execute()
        rows = list(res.data or [])
    except Exception as exc:
        logger.error("Failed to load user_settings for digest: %s", exc)
        return {
            "cadence": cadence,
            "trigger_source": trigger_source,
            "error": str(exc),
            "duration_ms": int((time.monotonic() - start) * 1000),
        }

    for row in rows:
        user_id = str(row.get("user_id") or "")
        settings = row.get("settings") or {}
        if not isinstance(settings, dict):
            continue
        prefs = settings.get("watchlistDigest") or {}
        if not prefs.get("enabled"):
            continue

        users_processed += 1
        result = _process_user_digest(
            sb,
            user_id=user_id,
            settings=settings,
            cadence=cadence,
            period_start=period_start,
            period_end=period_end,
        )

        if result.get("error"):
            errors += 1
        elif result.get("skipped"):
            skipped += 1
        elif result.get("notified"):
            notifications += 1
            if result.get("emailed"):
                emails += 1

    duration_ms = int((time.monotonic() - start) * 1000)
    summary = {
        "cadence": cadence,
        "trigger_source": trigger_source,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "users_processed": users_processed,
        "notifications": notifications,
        "emails": emails,
        "skipped": skipped,
        "errors": errors,
        "duration_ms": duration_ms,
    }
    logger.info("watchlist digest cycle: %s", summary)
    return summary
