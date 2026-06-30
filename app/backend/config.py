"""Runtime configuration and production startup validation."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]


def is_production() -> bool:
    env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    return env == "production"


@lru_cache(maxsize=1)
def app_version() -> str:
    override = (os.getenv("APP_VERSION") or "").strip()
    if override:
        return override
    try:
        import tomllib

        data = tomllib.loads((_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        version = data.get("tool", {}).get("poetry", {}).get("version")
        if version:
            return str(version)
    except Exception:
        pass
    return "0.1.0"


def validate_production_env() -> None:
    """Fail fast when production-critical env vars are missing."""
    if not is_production():
        return

    missing: list[str] = []
    if not (os.getenv("SUPABASE_URL") or "").strip():
        missing.append("SUPABASE_URL")
    if not (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip():
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not (os.getenv("SCORING_CRON_SECRET") or "").strip():
        missing.append("SCORING_CRON_SECRET")

    if missing:
        raise RuntimeError(
            "Production startup blocked — set required env vars: " + ", ".join(missing)
        )
