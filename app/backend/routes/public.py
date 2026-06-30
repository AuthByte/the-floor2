"""Anonymous-safe read endpoints for published floor posts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.backend.middleware.rate_limit import client_ip
from app.backend.services.public_post_service import (
    check_rate_limit,
    fetch_public_post,
    fetch_public_replay,
)
from app.backend.services.supabase_client import get_supabase

router = APIRouter(prefix="/public")


def _require_public_reads() -> None:
    sb = get_supabase()
    if not sb.configured or not (sb.service_key or sb.anon_key):
        raise HTTPException(
            status_code=503,
            detail="Public replays are unavailable — configure SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) on the API server.",
        )


def _guard_rate(request: Request, post_id: str) -> None:
    ip = client_ip(request)
    if not check_rate_limit(ip, post_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")


@router.get("/posts/{post_id}")
async def get_public_post(post_id: str, request: Request):
    _guard_rate(request, post_id)
    _require_public_reads()
    post = fetch_public_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.get("/posts/{post_id}/replay")
async def get_public_replay(post_id: str, request: Request):
    _guard_rate(request, post_id)
    _require_public_reads()
    replay = fetch_public_replay(post_id)
    if not replay:
        raise HTTPException(status_code=404, detail="Post not found")
    return replay
