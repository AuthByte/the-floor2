"""Artifact registry persona wildcard coverage."""

from src.utils.agent_artifacts.registry import canonical_registry_agent_id, catalog_for


def test_persona_agent_gets_legendary_wildcard_charts():
    agent_id = "persona_macro_surfing_x7k2m9"
    registry_id = canonical_registry_agent_id(agent_id)
    assert registry_id == "persona_macro_surfing_agent"
    specs = catalog_for(agent_id)
    assert any(s.id == "investor_cumulative_return" for s in specs)
