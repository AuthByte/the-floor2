"""Graph-node factories for lens-driven floor analysts."""

from __future__ import annotations

from typing import Any, Callable

from src.desk.engine import run_lens_agent
from src.desk.lenses import LENSES
from src.graph.state import AgentState

AgentFn = Callable[..., dict[str, Any]]


def make_lens_agent(key: str, display_name: str) -> AgentFn:
    lens = LENSES[key]

    def agent(state: AgentState, agent_id: str = f"{key}_agent") -> dict[str, Any]:
        return run_lens_agent(state, agent_id, lens, display_name)

    agent.__name__ = f"{key}_agent"
    return agent
