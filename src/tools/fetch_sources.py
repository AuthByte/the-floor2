"""Per-ticker fetch provenance for agent payloads."""

from __future__ import annotations

import contextvars

_sources: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar(
    "fetch_sources",
    default={},
)


def reset_fetch_sources() -> None:
    _sources.set({})


def record_fetch_source(kind: str, source: str | None) -> None:
    if not source or source == "none":
        return
    bag = dict(_sources.get({}))
    if kind in bag and source not in bag[kind]:
        bag[kind] = f"{bag[kind]}+{source}"
    else:
        bag[kind] = source
    _sources.set(bag)


def take_fetch_sources() -> dict[str, str]:
    bag = dict(_sources.get({}))
    _sources.set({})
    return bag
