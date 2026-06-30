"""Helpers for Tier-0 agents to attach fetch provenance to payloads."""

from __future__ import annotations

from typing import Any

from src.tools.fetch_sources import reset_fetch_sources, take_fetch_sources


def begin_ticker_fetch() -> None:
    reset_fetch_sources()


def attach_data_sources(payload: dict[str, Any]) -> dict[str, Any]:
    sources = take_fetch_sources()
    if sources:
        payload["data_sources"] = sources
    return payload
