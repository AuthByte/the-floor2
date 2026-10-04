"""Generic runtime entrypoint for minted persona analysts."""

from __future__ import annotations

from typing import Any

from src.desk.engine import run_lens_agent
from src.desk.lenses import lens_from_persona_weights
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

    checklist = "; ".join(pack.checklist)
    creed = f"{persona}\n\nChecklist: {checklist}" if checklist else persona
    lens = lens_from_persona_weights(base, creed, pack.metric_profile.weights.model_dump())
    return run_lens_agent(state, agent_id, lens, pack.display_name)


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
