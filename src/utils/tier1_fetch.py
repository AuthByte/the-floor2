"""Tier-1 fetch helpers — reuse Tier-0 outputs instead of duplicate sentiment pulls."""

from __future__ import annotations

from typing import Any


def tier0_briefings_ready(state: dict[str, Any]) -> bool:
    data = state.get("data") or {}
    return bool(data.get("tier0_complete") and data.get("tier0_briefings"))
