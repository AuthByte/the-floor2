"""Emit score_milestone notifications after post scorecard refresh."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def emit_score_milestone_notifications() -> int:
    """Notify post authors when boss calls flip correct at due horizons."""
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return 0

    try:
        res = (
            sb.client.table("floor_posts")
            .select("id, author_id, tickers, ts_ms, scorecard")
            .not_.is_("scorecard", "null")
            .limit(200)
            .execute()
        )
        posts = list(res.data or [])
    except Exception as exc:
        logger.warning("Failed to load posts for milestone notifications: %s", exc)
        return 0

    emitted = 0
    for post in posts:
        scorecard = post.get("scorecard")
        if not isinstance(scorecard, dict):
            continue
        author_id = post.get("author_id")
        post_id = post.get("id")
        if not author_id or not post_id:
            continue

        for key, entry in scorecard.items():
            if not isinstance(entry, dict) or not entry.get("correct"):
                continue
            if ":" not in str(key):
                continue
            ticker, horizon = str(key).rsplit(":", 1)
            if horizon not in ("1w", "1m"):
                continue

            milestone_key = f"boss_{horizon}_correct:{post_id}:{ticker}"
            body = f"Boss call on {ticker} was correct at {horizon}."
            if _insert_milestone(
                user_id=str(author_id),
                post_id=str(post_id),
                milestone_key=milestone_key,
                body=body,
                metadata={
                    "milestone_key": milestone_key,
                    "milestone": f"boss_{horizon}_correct",
                    "ticker": ticker,
                    "agent_key": None,
                    "hit_rate": None,
                    "pnl_pct": entry.get("pnlPct"),
                },
            ):
                emitted += 1

    return emitted


def _insert_milestone(
    *,
    user_id: str,
    post_id: str,
    milestone_key: str,
    body: str,
    metadata: dict[str, Any],
) -> bool:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return False

    row = {
        "user_id": user_id,
        "kind": "score_milestone",
        "post_id": post_id,
        "body": body,
        "metadata": metadata,
    }
    try:
        sb.client.table("notifications").insert(row).execute()
        return True
    except Exception as exc:
        err = str(exc).lower()
        if "duplicate" in err or "unique" in err:
            return False
        logger.warning("Failed to insert score milestone %s: %s", milestone_key, exc)
        return False
