"""Filesystem paths for SQLite, artifacts, and other persisted backend data."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
_DEFAULT_ARTIFACT_DIR = BACKEND_DIR / "static" / "artifacts"


def data_dir() -> Path:
    """Root directory for persisted backend files (SQLite, etc.)."""
    raw = os.getenv("DATA_DIR", "").strip()
    return Path(raw) if raw else BACKEND_DIR


def artifact_dir() -> Path:
    """Directory where agent charts are written and served from `/artifacts`."""
    raw = os.getenv("ARTIFACT_DIR", "").strip()
    return Path(raw) if raw else _DEFAULT_ARTIFACT_DIR


def database_path() -> Path:
    return data_dir() / "hedge_fund.db"
