"""Run-scoped persona registry isolation tests."""

from __future__ import annotations

import json
from pathlib import Path

from src.utils.persona_models import PersonaPack
from src.utils.persona_registry import build_registry, default_registry
from src.utils.persona_store import load_pack_from_json


def test_build_registry_merges_without_mutating_global():
    path = Path(__file__).resolve().parents[1] / "data" / "persona_packs" / "macro_surfing.json"
    pack = load_pack_from_json(path)
    before = default_registry()
    reg_a = build_registry([pack])
    reg_b = build_registry([])

    assert pack.agent_key in reg_a.persona_keys
    assert pack.agent_key not in reg_b.persona_keys
    assert pack.agent_key not in before.persona_keys
    assert reg_a.get(pack.agent_key)["type"] == "persona"
    assert "warren_buffett" in reg_a.base
    assert "warren_buffett" in before.base


def test_is_legend_tier_for_persona_type():
    from src.utils.agent_tiers import is_legend_tier

    cfg = {
        "persona_macro_surfing": {"type": "persona"},
        "supply_chain_cartographer": {"type": "analyst"},
    }
    assert is_legend_tier("persona_macro_surfing", cfg)
    assert not is_legend_tier("supply_chain_cartographer", cfg)

    path = Path(__file__).resolve().parents[1] / "data" / "persona_packs" / "macro_surfing.json"
    pack = PersonaPack.from_pack_body(json.loads(path.read_text(encoding="utf-8")))
    reg_one = build_registry([pack])
    reg_two = build_registry([])
    assert pack.agent_key in reg_one.persona_keys
    assert pack.agent_key not in reg_two.persona_keys
