"""Thread-safe registry for in-flight shift runs (user consultations, signal mirror)."""

from __future__ import annotations

import threading
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

_lock = threading.Lock()
_sessions: dict[str, LiveRunSession] = {}


@dataclass
class LiveRunSession:
    run_id: str
    tickers: list[str]
    request: Any = None
    analyst_signals: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    consultation_messages: list[dict[str, Any]] = field(default_factory=list)
    phase: str = "starting"
    graph_signals: dict[str, dict[str, dict[str, Any]]] | None = None
    debate_baselines: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    pm_baselines: dict[str, dict[str, Any]] = field(default_factory=dict)
    propagation_queue: list[dict[str, Any]] = field(default_factory=list)
    chair_impact: dict[str, Any] | None = None

    def set_phase(self, phase: str) -> None:
        self.phase = phase

    def mirror_agent_bucket(self, agent_id: str, ticker: str, bucket: dict[str, Any]) -> None:
        if not agent_id or not ticker or not isinstance(bucket, dict):
            return
        key = ticker.upper()
        self.analyst_signals.setdefault(agent_id, {})[key] = deepcopy(bucket)
        if self.graph_signals is not None:
            self.graph_signals.setdefault(agent_id, {})[key] = deepcopy(bucket)

    def get_bucket(self, agent_id: str, ticker: str) -> dict[str, Any] | None:
        raw = self.analyst_signals.get(agent_id, {}).get(ticker.upper())
        return deepcopy(raw) if isinstance(raw, dict) else None

    def apply_bucket(self, agent_id: str, ticker: str, bucket: dict[str, Any]) -> None:
        key = ticker.upper()
        self.analyst_signals.setdefault(agent_id, {})[key] = deepcopy(bucket)
        if self.graph_signals is not None:
            self.graph_signals.setdefault(agent_id, {})[key] = deepcopy(bucket)

    def merge_into(self, target: dict[str, Any]) -> dict[str, Any]:
        """Overlay mirrored + revised signals onto graph result analyst_signals."""
        if not isinstance(target, dict):
            target = {}
        for agent_id, by_ticker in self.analyst_signals.items():
            tgt_agent = target.setdefault(agent_id, {})
            if not isinstance(tgt_agent, dict):
                continue
            for ticker, bucket in by_ticker.items():
                if isinstance(bucket, dict):
                    tgt_agent[ticker] = deepcopy(bucket)
        return target


def bind_session(
    run_id: str,
    *,
    tickers: list[str],
    request: Any = None,
) -> LiveRunSession:
    session = LiveRunSession(
        run_id=run_id,
        tickers=[str(t).upper() for t in tickers],
        request=request,
    )
    with _lock:
        _sessions[run_id] = session
    return session


def bind_graph_signals(run_id: str | None, analyst_signals: dict[str, Any]) -> None:
    """Share graph analyst_signals dict so mid-shift consults write through."""
    if not run_id:
        return
    session = get_session(run_id)
    if not session:
        return
    session.graph_signals = analyst_signals
    if session.phase == "starting":
        session.set_phase("analysis")


def get_session(run_id: str | None) -> LiveRunSession | None:
    if not run_id:
        return None
    with _lock:
        return _sessions.get(run_id)


def clear_session(run_id: str | None) -> None:
    if not run_id:
        return
    with _lock:
        _sessions.pop(run_id, None)


def active_run_id() -> str | None:
    with _lock:
        if len(_sessions) == 1:
            return next(iter(_sessions))
        return None
