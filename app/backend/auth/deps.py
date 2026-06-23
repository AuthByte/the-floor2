"""Optional Supabase JWT verification for API routes."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

_bearer = HTTPBearer(auto_error=False)
_supabase_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
_jwt_secret = (os.getenv("SUPABASE_JWT_SECRET") or "").strip()
# Enforce auth when Supabase is configured (JWKS or legacy HS256 secret).
_auth_required = bool(_supabase_url)


def is_auth_required() -> bool:
    return _auth_required and bool(_supabase_url)


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient | None:
    if not _supabase_url:
        return None
    return PyJWKClient(f"{_supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)


def _decode_token(token: str) -> dict[str, Any]:
    if _jwt_secret:
        return jwt.decode(
            token,
            _jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    client = _jwks_client()
    if client is None:
        raise jwt.PyJWTError("Supabase auth verifier not configured")
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256", "RS256"],
        audience="authenticated",
    )


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any] | None:
    """Validate a Supabase access token when SUPABASE_URL is set."""
    if not is_auth_required():
        return None
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return _decode_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def hedge_fund_auth_dependencies() -> list:
    if not is_auth_required():
        return []
    return [Depends(require_user)]


def user_id_from_claims(claims: dict[str, Any] | None) -> str | None:
    if not claims:
        return None
    sub = claims.get("sub")
    return str(sub) if sub else None
