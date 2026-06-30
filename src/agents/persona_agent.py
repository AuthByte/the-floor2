"""Generic runtime entrypoint for minted persona analysts."""

from __future__ import annotations

from typing import Any

from src.agents._legendary_investor_utils import run_legendary_agent
from src.agents.persona_metrics import generic_persona_metrics
from src.graph.state import AgentState
from src.utils.consultation import extract_base_agent_key
from src.utils.persona_models import PersonaPack
from src.utils.persona_store import get_pack_for_agent_key


def persona_agent(state: AgentState, agent_id: str = "persona_agent") -> dict[str, Any]:
    base = extract_base_agent_key(agent_id)
    pack = _resolve_pack(state, base)
    disclaimer = pack.safety.disclaimer.strip()
    persona = pack.persona_text
    if disclaimer:
        persona = f"{persona}\n\n{disclaimer}"

    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name=pack.display_name,
        agent_label=f"{pack.display_name} (Persona)",
        persona=persona,
        checklist=pack.checklist,
        analysis_fn=generic_persona_metrics(pack.metric_profile),
    )


def _resolve_pack(state: AgentState, agent_key: str) -> PersonaPack:
    data = state.get("data") or {}
    packs: dict[str, Any] = data.get("persona_packs") or {}
    raw = packs.get(agent_key)
    if raw is not None:
        if isinstance(raw, PersonaPack):
            return raw
        if isinstance(raw, dict):
            return PersonaPack.from_pack_body(raw)

    pack = get_pack_for_agent_key(agent_key)
    if pack is None:
        raise KeyError(f"No PersonaPack registered for agent key {agent_key!r}")
    return pack
