"""PersonaPack schema validation tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.utils.persona_models import (
    PersonaPack,
    agent_key_for_slug,
    slug_from_agent_key,
)


def test_sample_pack_json_validates():
    path = Path(__file__).resolve().parents[1] / "data" / "persona_packs" / "macro_surfing.json"
    pack = PersonaPack.from_pack_body(json.loads(path.read_text(encoding="utf-8")))
    assert pack.slug == "macro_surfing"
    assert pack.agent_key == "persona_macro_surfing"
    assert len(pack.checklist) >= 5


def test_agent_key_for_slug():
    assert agent_key_for_slug("macro_surfing") == "persona_macro_surfing"


def test_slug_from_agent_key_multi_underscore():
    assert slug_from_agent_key("persona_macro_surfing") == "macro_surfing"
    assert slug_from_agent_key("warren_buffett") is None


def test_invalid_slug_rejected():
    with pytest.raises(ValueError):
        PersonaPack.from_pack_body(
            {
                "slug": "BAD-SLUG",
                "identity": {
                    "display_name": "X",
                    "callsign": "ABCD",
                    "desk_label": "desk",
                },
                "voice": {"persona_text": "voice"},
                "investing": {
                    "investing_style": "style",
                    "checklist": ["one"],
                },
            }
        )


def test_metric_weights_sum_validation():
    with pytest.raises(ValueError):
        PersonaPack.from_pack_body(
            {
                "slug": "bad_weights",
                "identity": {
                    "display_name": "X",
                    "callsign": "ABCD",
                    "desk_label": "desk",
                },
                "voice": {"persona_text": "voice"},
                "investing": {
                    "investing_style": "style",
                    "checklist": ["one"],
                },
                "metrics": {
                    "weights": {
                        "valuation": 0.9,
                        "momentum": 0.9,
                        "quality": 0.9,
                        "macro_sensitivity": 0.9,
                        "risk_control": 0.9,
                    }
                },
            }
        )
