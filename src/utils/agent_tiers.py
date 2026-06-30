"""Analyst tier keys — shared by graph routing and prompts."""

from __future__ import annotations

from src.utils.data_feed_keys import DATA_FEED_KEYS

LEGEND_KEYS = frozenset(
    {
        "aswath_damodaran",
        "ben_graham",
        "bill_ackman",
        "cathie_wood",
        "charlie_munger",
        "michael_burry",
        "mohnish_pabrai",
        "nassim_taleb",
        "peter_lynch",
        "phil_fisher",
        "rakesh_jhunjhunwala",
        "stanley_druckenmiller",
        "george_soros",
        "jim_simons",
        "howard_marks",
        "seth_klarman",
        "john_templeton",
        "joel_greenblatt",
        "ray_dalio",
        "paul_tudor_jones",
        "carl_icahn",
        "li_lu",
        "masayoshi_son",
        "david_einhorn",
        "warren_buffett",
    }
)

SPECIALIST_KEYS = frozenset(
    {
        "supply_chain_cartographer",
        "opportunity_cost",
        "ripple_desk",
        "bastion_moat",
        "unknown_unknowns",
    }
)

QUANT_KEYS = frozenset(
    {
        "quant_pead",
        "quant_momentum",
        "quant_mean_reversion",
        "quant_volatility",
    }
)

TIER0_KEYS = DATA_FEED_KEYS


def is_legend_tier(base_key: str, analyst_config: dict | None = None) -> bool:
    """Legends and minted personas route through tier1_gate."""
    from src.utils.analysts import ANALYST_CONFIG
    from src.utils.persona_registry import is_persona_key

    cfg_source = analyst_config or ANALYST_CONFIG
    if is_persona_key(base_key, cfg_source):
        return True
    return base_key in LEGEND_KEYS


__all__ = [
    "TIER0_KEYS",
    "LEGEND_KEYS",
    "SPECIALIST_KEYS",
    "QUANT_KEYS",
    "is_legend_tier",
]
