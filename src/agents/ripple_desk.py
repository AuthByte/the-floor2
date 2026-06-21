"""Ripple Desk — second-order and third-order effect chains (then what?)."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, run_legendary_agent
from src.graph.state import AgentState
from src.utils.interactive_artifacts import build_ripple_cascade


def ripple_desk_agent(state: AgentState, agent_id: str = "ripple_desk_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Ripple Desk",
        agent_label="Ripple Desk (Second-Order Effects)",
        persona=(
            "You are the Ripple Desk. First-order analysts stop at the obvious: "
            "'AI demand rises → NVIDIA wins.' You ask THEN WHAT? Trace 3-5 step cascades: "
            "who benefits indirectly, where bottlenecks migrate, and which 'boring' names "
            "three hops away are the real trade. Name tickers at each ripple when possible. "
            "Bullish when the focal name captures ripples; bearish when value leaks downstream."
        ),
        checklist=[
            "State the first-order consensus",
            "Step 2-3: what breaks or surges next?",
            "Hidden beneficiaries 2-3 hops away",
            "Bottleneck migration (power, grids, materials)",
            "Which ripple node is the best risk/reward?",
        ],
        analysis_fn=analyze_ripple_effects,
        extra_artifacts_fn=lambda t, a, _c, _s: [build_ripple_cascade(t, a)],
    )


def analyze_ripple_effects(ctx: dict[str, Any]) -> dict[str, Any]:
    news = ctx.get("news") or []
    ticker = ctx.get("ticker", "")
    themes: dict[str, int] = {}
    keywords = {
        "power": ("power", "utility", "grid", "energy"),
        "supply": ("shortage", "supply", "bottleneck", "lead time"),
        "regulation": ("ban", "tariff", "antitrust", "regulat"),
        "demand": ("demand", "capex", "spending", "orders"),
    }
    for n in news:
        title = (getattr(n, "title", "") or "").lower()
        for theme, words in keywords.items():
            if any(w in title for w in words):
                themes[theme] = themes.get(theme, 0) + 1

    depth_score = min(10, 4 + len(themes) * 1.2 + (1 if themes.get("supply") else 0))
    concentration = max(themes.values()) if themes else 0

    return {
        "score": clamp(depth_score),
        "ripple_theme_hits": themes,
        "ripple_chain_seed": _default_chain_for_ticker(ticker),
        "ripple_max_theme_concentration": concentration,
    }


def _default_chain_for_ticker(ticker: str) -> list[dict[str, str]]:
    """Seed structure the LLM expands in reasoning."""
    t = ticker.upper()
    if t in {"NVDA", "AMD", "AVGO"}:
        return [
            {"step": 1, "effect": "AI accelerator demand rises", "beneficiary": t},
            {"step": 2, "effect": "Data-center power draw surges", "beneficiary": "Utilities / grid"},
            {"step": 3, "effect": "Transformer & switchgear shortages", "beneficiary": "Grid equipment"},
        ]
    return [
        {"step": 1, "effect": f"Demand narrative strengthens for {t}", "beneficiary": t},
        {"step": 2, "effect": "Input costs or capacity bind", "beneficiary": "Suppliers"},
        {"step": 3, "effect": "Adjacent enablers re-rate", "beneficiary": "Peer ecosystem"},
    ]
