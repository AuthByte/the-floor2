"""Barrier: legend floor must finish before specialist analysis desks start."""

from __future__ import annotations

from typing import Any

from src.graph.state import AgentState
from src.utils.progress import progress

ANALYSIS_GATE_ID = "analysis_gate"


def analysis_gate_node(state: AgentState) -> dict[str, Any]:
    briefings = (state["data"].get("tier0_briefings") or {})
    n = len(briefings)
    if n:
        msg = f"Legend floor complete — releasing {n} tier-0 briefing(s) to analysis desks"
    else:
        msg = "Legend floor complete — releasing further analysis desks"
    progress.update_status(ANALYSIS_GATE_ID, None, msg)
    return {"data": {"analysis_floor_released": True}}
