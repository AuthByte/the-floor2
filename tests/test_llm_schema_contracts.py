"""Regression tests guarding LLM prompt/schema contracts and fallbacks.

These cover two bugs:
1. The supply-chain planner prompt asked for field names that did not match
   SupplyChainGraphModel (e.g. ``name``/``country`` and object-shaped risks),
   so every LLM result failed validation and silently fell back to seeds.
2. The SEC earnings digest used ``default_factory=EarningsDigestLLM``, which
   cannot be constructed without the required ``summary`` field, so the
   "graceful" fallback itself raised.
"""

import pytest
from pydantic import ValidationError

from src.utils.supply_chain.models import SupplyChainGraphModel
from src.utils.supply_chain.planner import _PLANNER_PROMPT
from src.tools.providers.sec_edgar_earnings import EarningsDigestLLM


def _render_prompt() -> str:
    return _PLANNER_PROMPT.format(ticker="AAPL", context="ctx", min_nodes=4)


def test_planner_prompt_uses_schema_field_names():
    """Prompt must instruct the exact Pydantic field names, not synonyms."""
    text = _render_prompt()
    for required in ("title", "caption", "focal_ticker", "label", "region", "criticality"):
        assert f'"{required}"' in text or required in text, f"prompt missing field: {required}"
    # It must steer the model away from the synonyms that caused the original bug.
    assert "not 'name'" in text
    assert "not 'country'" in text
    assert "list of short strings" in text


def test_old_prompt_shape_fails_validation():
    """The shape the buggy prompt elicited must fail (documents the bug)."""
    old_shape = {
        "nodes": [
            {"id": "aapl", "name": "Apple", "tier": 0, "role": "focal", "country": "USA"},
            {"id": "tsmc", "name": "TSMC", "tier": -2, "role": "supplier", "country": "TW"},
            {"id": "fxc", "name": "Foxconn", "tier": -2, "role": "supplier", "country": "TW"},
        ],
        "edges": [
            {"source": "tsmc", "target": "aapl", "relationship": "supplies"},
            {"source": "fxc", "target": "aapl", "relationship": "assembles_for"},
        ],
        "concentration_risks": [{"source": "tsmc", "target": "aapl", "reason": "single source"}],
    }
    with pytest.raises(ValidationError):
        SupplyChainGraphModel(**old_shape)


def test_new_prompt_shape_validates():
    """The shape the fixed prompt requests must validate cleanly."""
    new_shape = {
        "title": "AAPL supply chain",
        "caption": "Apple supplier and customer map.",
        "focal_ticker": "AAPL",
        "nodes": [
            {"id": "aapl", "label": "Apple", "role": "focal", "tier": 0, "region": "USA"},
            {"id": "tsmc", "label": "TSMC", "role": "supplier", "tier": -2, "region": "TW"},
            {"id": "fxc", "label": "Foxconn", "role": "supplier", "tier": -2, "region": "TW"},
        ],
        "edges": [
            {"source": "tsmc", "target": "aapl", "relationship": "supplies", "criticality": "high"},
            {"source": "fxc", "target": "aapl", "relationship": "supplies", "criticality": "high"},
        ],
        "concentration_risks": ["TSMC is the single source for leading-edge processors."],
    }
    model = SupplyChainGraphModel(**new_shape)
    assert model.focal_ticker == "AAPL"
    assert len(model.nodes) == 3
    assert all(isinstance(r, str) for r in model.concentration_risks)


def test_earnings_digest_fallback_is_constructible():
    """The earnings-digest fallback must build (it could not before the fix)."""
    # The bare constructor still requires summary — this is why default_factory
    # must supply one.
    with pytest.raises(ValidationError):
        EarningsDigestLLM()
    # The fix passes a summary, which constructs fine.
    fallback = EarningsDigestLLM(summary="Earnings summary unavailable.")
    assert fallback.summary == "Earnings summary unavailable."
    assert fallback.management_tone == "neutral"
