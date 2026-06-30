"""Public post + replay reads for anonymous embed/replay surfaces."""

from __future__ import annotations

import logging
from typing import Any

from app.backend.middleware.rate_limit import check_public_rate_limit

logger = logging.getLogger(__name__)


def check_rate_limit(client_ip: str, post_id: str) -> bool:
    """Return True if request is allowed."""
    return check_public_rate_limit(client_ip, post_id)


def _author_from_profiles(profiles: Any, author_id: str) -> dict[str, Any]:
    row = profiles[0] if isinstance(profiles, list) and profiles else profiles
    if not isinstance(row, dict):
        row = {}
    return {
        "displayName": (row.get("display_name") or "").strip() or "Desk analyst",
        "handle": row.get("handle"),
        "avatarUrl": row.get("avatar_url"),
    }


def _empty_reaction_counts() -> dict[str, int]:
    return {"contrarian": 0, "bear_case": 0, "nailed_it": 0}


def map_public_post(row: dict[str, Any], *, has_archived_replay: bool = False) -> dict[str, Any]:
    reactions = row.get("reaction_counts")
    if not isinstance(reactions, dict):
        reactions = _empty_reaction_counts()
    scorecard = row.get("scorecard")
    if not isinstance(scorecard, dict):
        scorecard = {}

    return {
        "id": row["id"],
        "tickers": row.get("tickers") or [],
        "caption": row.get("caption"),
        "model": row.get("model") or "",
        "analystCount": int(row.get("analyst_count") or 0),
        "tsMs": int(row.get("ts_ms") or 0),
        "publishedAt": row.get("published_at") or "",
        "author": _author_from_profiles(row.get("profiles"), str(row.get("author_id") or "")),
        "snapshot": row.get("snapshot") if isinstance(row.get("snapshot"), dict) else {},
        "scorecard": scorecard,
        "reactionCounts": {
            "contrarian": int(reactions.get("contrarian") or 0),
            "bear_case": int(reactions.get("bear_case") or 0),
            "nailed_it": int(reactions.get("nailed_it") or 0),
        },
        "likeCount": int(row.get("like_count") or 0),
        "commentCount": int(row.get("comment_count") or 0),
        "hasArchivedReplay": has_archived_replay,
        "shiftId": row.get("shift_id"),
        "heroArtifactUrl": row.get("hero_artifact_url"),
    }


def fetch_public_post(post_id: str) -> dict[str, Any] | None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return None

    select = (
        "id,author_id,shift_id,caption,tickers,model,analyst_count,ts_ms,snapshot,"
        "hero_artifact_url,like_count,comment_count,published_at,reaction_counts,scorecard,"
        "profiles!author_id(display_name,handle,avatar_url)"
    )
    row = sb.rest_select_one("floor_posts", select=select, filters={"id": post_id})
    if not row:
        return None

    has_replay = False
    shift_id = row.get("shift_id")
    if shift_id:
        replay_row = sb.rest_select_one(
            "shifts",
            select="replay",
            filters={"id": str(shift_id)},
        )
        replay = replay_row.get("replay") if replay_row else None
        if isinstance(replay, dict) and replay.get("timeline"):
            has_replay = True

    return map_public_post(row, has_archived_replay=has_replay)


def fetch_public_replay(post_id: str) -> dict[str, Any] | None:
    """Return archived replay timeline or a synthesized=false empty payload."""
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured:
        return None

    post_row = sb.rest_select_one(
        "floor_posts",
        select="id,shift_id,ts_ms,snapshot",
        filters={"id": post_id},
    )
    if not post_row:
        return None

    shift_id = post_row.get("shift_id")
    if shift_id:
        shift_row = sb.rest_select_one(
            "shifts",
            select="replay",
            filters={"id": str(shift_id)},
        )
        replay = shift_row.get("replay") if shift_row else None
        if isinstance(replay, dict) and replay.get("timeline"):
            timeline = replay.get("timeline")
            if isinstance(timeline, list) and timeline:
                log = replay.get("log")
                return {
                    "timeline": timeline,
                    "roomIds": replay.get("roomIds") or replay.get("room_ids") or [],
                    "shiftStartedAt": int(
                        replay.get("shiftStartedAt") or replay.get("shift_started_at") or post_row.get("ts_ms") or 0
                    ),
                    "log": log if isinstance(log, list) else [],
                    "synthesized": False,
                }

    return {
        "timeline": [],
        "roomIds": [],
        "shiftStartedAt": int(post_row.get("ts_ms") or 0),
        "log": [],
        "synthesized": True,
        "snapshot": post_row.get("snapshot") if isinstance(post_row.get("snapshot"), dict) else {},
        "tsMs": int(post_row.get("ts_ms") or 0),
    }
