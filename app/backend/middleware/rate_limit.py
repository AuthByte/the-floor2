"""In-memory sliding-window rate limits for expensive endpoints."""

from __future__ import annotations

import base64
import json
import os
import time
from collections import defaultdict
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_TRUST_PROXY = os.getenv("TRUST_PROXY", "").strip().lower() in ("1", "true", "yes")

# POST /hedge-fund/run — free tier
_RUN_LIMIT = 10
_RUN_WINDOW_SEC = 3600.0

# GET /public/* — anonymous embed/replay
_PUBLIC_GLOBAL_LIMIT = 60
_PUBLIC_GLOBAL_WINDOW_SEC = 60.0
_PUBLIC_POST_LIMIT = 20
_PUBLIC_POST_WINDOW_SEC = 60.0

_MAX_BUCKET_KEYS = 20_000


def trust_proxy_headers() -> bool:
    return _TRUST_PROXY


def client_ip(request: Request) -> str:
    """Resolve client IP; only trust X-Forwarded-For behind a known reverse proxy."""
    if _TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def user_id_from_request(request: Request) -> str | None:
    """Best-effort JWT sub for rate-limit bucketing (not used for auth)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        sub = data.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


class SlidingWindowLimiter:
    def __init__(self, *, limit: int, window_sec: float) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._last_prune = 0.0

    def allow(self, key: str) -> tuple[bool, int]:
        """Return (allowed, remaining_after_this_hit_if_allowed)."""
        now = time.time()
        self._maybe_prune(now)
        window_start = now - self.window_sec
        hits = [t for t in self._buckets[key] if t >= window_start]
        if len(hits) >= self.limit:
            self._buckets[key] = hits
            return False, 0
        hits.append(now)
        self._buckets[key] = hits
        return True, max(0, self.limit - len(hits))

    def _maybe_prune(self, now: float) -> None:
        if now - self._last_prune < self.window_sec:
            return
        self._last_prune = now
        window_start = now - self.window_sec
        stale: list[str] = []
        for key, hits in self._buckets.items():
            fresh = [t for t in hits if t >= window_start]
            if fresh:
                self._buckets[key] = fresh
            else:
                stale.append(key)
        for key in stale:
            del self._buckets[key]
        if len(self._buckets) > _MAX_BUCKET_KEYS:
            overflow = len(self._buckets) - _MAX_BUCKET_KEYS
            for key in list(self._buckets.keys())[:overflow]:
                del self._buckets[key]


_run_limiter = SlidingWindowLimiter(limit=_RUN_LIMIT, window_sec=_RUN_WINDOW_SEC)
_public_global_limiter = SlidingWindowLimiter(
    limit=_PUBLIC_GLOBAL_LIMIT, window_sec=_PUBLIC_GLOBAL_WINDOW_SEC
)
_public_post_limiter = SlidingWindowLimiter(
    limit=_PUBLIC_POST_LIMIT, window_sec=_PUBLIC_POST_WINDOW_SEC
)


def check_public_rate_limit(client_ip_value: str, post_id: str) -> bool:
    """Global per-IP cap plus per-post cap for anonymous public reads."""
    global_ok, _ = _public_global_limiter.allow(f"public:ip:{client_ip_value}")
    if not global_ok:
        return False
    post_ok, _ = _public_post_limiter.allow(f"public:ip:{client_ip_value}:post:{post_id}")
    return post_ok


def _run_rate_key(request: Request) -> str:
    user_id = user_id_from_request(request)
    if user_id:
        return f"run:user:{user_id}"
    return f"run:ip:{client_ip(request)}"


def _is_hedge_fund_run(request: Request) -> bool:
    return request.method == "POST" and request.url.path.rstrip("/") == "/hedge-fund/run"


class HedgeFundRunRateLimitMiddleware(BaseHTTPMiddleware):
    """Cap free-tier shift runs at 10/hour per authenticated user or client IP."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not _is_hedge_fund_run(request):
            return await call_next(request)

        key = _run_rate_key(request)
        allowed, remaining = _run_limiter.allow(key)
        if not allowed:
            retry_after = int(_RUN_WINDOW_SEC)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Shift rate limit exceeded (10/hour on free tier). Upgrade for unlimited runs.",
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(_RUN_LIMIT),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(_RUN_LIMIT)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
