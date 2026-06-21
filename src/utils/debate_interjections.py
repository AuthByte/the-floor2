"""Thread-safe queue for live chair interjections during debate."""

from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_active_run_id: str | None = None
_queues: dict[str, list[dict[str, Any]]] = {}


def bind_run(run_id: str | None) -> None:
    """Mark which shift run accepts chair interjections."""
    global _active_run_id
    with _lock:
        _active_run_id = run_id
        if run_id:
            _queues.setdefault(run_id, [])


def clear_run(run_id: str | None) -> None:
    """Drop queued interjections when a shift ends."""
    global _active_run_id
    with _lock:
        if run_id and run_id in _queues:
            del _queues[run_id]
        if _active_run_id == run_id:
            _active_run_id = None


def active_run_id() -> str | None:
    with _lock:
        return _active_run_id


def push_interjection(
    *,
    run_id: str,
    ticker: str,
    text: str,
    chair_name: str = "Chair",
) -> bool:
    """Queue a user line for the debate chamber. Returns False if run is inactive."""
    message = (text or "").strip()
    if not message:
        return False
    with _lock:
        if _active_run_id != run_id:
            return False
        bucket = _queues.setdefault(run_id, [])
        bucket.append(
            {
                "ticker": str(ticker).strip().upper(),
                "text": message[:1200],
                "chair_name": (chair_name or "Chair").strip()[:48] or "Chair",
            }
        )
        return True


def drain_interjections(run_id: str | None, ticker: str) -> list[dict[str, Any]]:
    """Remove and return queued interjections for a ticker."""
    if not run_id:
        return []
    key = str(ticker).strip().upper()
    with _lock:
        bucket = _queues.get(run_id, [])
        kept: list[dict[str, Any]] = []
        out: list[dict[str, Any]] = []
        for item in bucket:
            if str(item.get("ticker", "")).upper() == key:
                out.append(item)
            else:
                kept.append(item)
        _queues[run_id] = kept
        return out


def wait_for_interjections(
    run_id: str | None,
    ticker: str,
    *,
    timeout: float = 10.0,
    poll: float = 0.4,
) -> list[dict[str, Any]]:
    """Block until the chair speaks or the window expires."""
    if not run_id or timeout <= 0:
        return drain_interjections(run_id, ticker)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        batch = drain_interjections(run_id, ticker)
        if batch:
            return batch
        time.sleep(poll)
    return []
