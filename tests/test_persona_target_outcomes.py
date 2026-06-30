"""Persona agent key scoring eligibility."""

from src.utils.target_outcomes import is_scorable_agent


def test_persona_agent_keys_are_scorable():
    assert is_scorable_agent("persona_macro_surfing_x7k2m9")
    assert is_scorable_agent("persona_foo_bar_abc123")


def test_excluded_channels_not_scorable():
    assert not is_scorable_agent("portfolio_manager_pmoss0")
    assert not is_scorable_agent("debate_chamber")
