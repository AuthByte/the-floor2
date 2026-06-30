"""Run-scoped analyst registry — merges PersonaPacks without mutating global ANALYST_CONFIG."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.utils.analysts import ANALYST_CONFIG
from src.utils.persona_models import PersonaPack, slug_from_agent_key
from src.utils.persona_store import cache_pack, load_packs_by_ids

MAX_PERSONAS_PER_SHIFT = 3


@dataclass
class RunAnalystRegistry:
    base: dict[str, Any]
    persona_keys: frozenset[str] = field(default_factory=frozenset)
    packs_by_agent_key: dict[str, PersonaPack] = field(default_factory=dict)

    def get(self, key: str) -> dict[str, Any] | None:
        return self.base.get(key)

    def has(self, key: str) -> bool:
        return key in self.base

    def analyst_config(self) -> dict[str, Any]:
        return self.base


def build_registry(packs: list[PersonaPack]) -> RunAnalystRegistry:
    from src.agents.persona_agent import persona_agent

    if len(packs) > MAX_PERSONAS_PER_SHIFT:
        raise ValueError(f"At most {MAX_PERSONAS_PER_SHIFT} persona packs per shift")

    merged: dict[str, Any] = {**ANALYST_CONFIG}
    persona_keys: set[str] = set()
    packs_by_key: dict[str, PersonaPack] = {}

    for pack in packs:
        key = pack.agent_key
        if key in ANALYST_CONFIG and ANALYST_CONFIG[key].get("type") != "persona":
            raise ValueError(f"Persona slug collides with built-in agent key: {key}")
        persona_keys.add(key)
        packs_by_key[key] = pack
        cache_pack(pack)
        merged[key] = {
            "display_name": pack.display_name,
            "description": pack.desk_label,
            "investing_style": pack.investing_style,
            "agent_func": persona_agent,
            "type": "persona",
            "order": 9000 + (hash(pack.slug) % 1000),
            "persona_pack_id": str(pack.id),
        }

    return RunAnalystRegistry(
        base=merged,
        persona_keys=frozenset(persona_keys),
        packs_by_agent_key=packs_by_key,
    )


def default_registry() -> RunAnalystRegistry:
    return RunAnalystRegistry(base={**ANALYST_CONFIG})


def packs_for_state(registry: RunAnalystRegistry | None) -> dict[str, PersonaPack]:
    if registry is None:
        return {}
    return dict(registry.packs_by_agent_key)


def is_persona_key(base_key: str, analyst_config: dict[str, Any] | None = None) -> bool:
    cfg = (analyst_config or ANALYST_CONFIG).get(base_key, {})
    if cfg.get("type") == "persona":
        return True
    return base_key.startswith("persona_") and slug_from_agent_key(base_key) is not None


__all__ = [
    "MAX_PERSONAS_PER_SHIFT",
    "RunAnalystRegistry",
    "build_registry",
    "default_registry",
    "is_persona_key",
    "load_packs_by_ids",
    "packs_for_state",
]
