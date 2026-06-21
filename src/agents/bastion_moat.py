"""Bastion — moat strength, switching costs, and network-effect durability."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, ratio, run_legendary_agent, safe_get
from src.graph.state import AgentState
from src.utils.interactive_artifacts import build_moat_radar


def bastion_moat_agent(state: AgentState, agent_id: str = "bastion_moat_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Bastion",
        agent_label="Bastion Moat Analyst",
        persona=(
            "You are Bastion — the moat strength desk. Measure whether customers can leave, "
            "whether value compounds with users (network effects), and how durable the "
            "advantage is over 5-10 years. Especially rigorous on software and platforms. "
            "Score switching costs, ecosystem lock-in, brand/pricing power, and scale economies. "
            "Bearish when moats are narrative-only; bullish when structural and widening."
        ),
        checklist=[
            "Can customers leave without pain? (switching costs)",
            "Does value rise with more users? (network effects)",
            "Pricing power evidence",
            "Durability: tech disruption risk",
            "Moat widening or eroding vs 3 years ago?",
        ],
        analysis_fn=analyze_bastion_moat,
        extra_artifacts_fn=lambda t, a, _c, _s: [build_moat_radar(t, a)],
    )


def analyze_bastion_moat(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx.get("metrics") or []
    line_items = ctx.get("line_items") or []
    m = latest(metrics)
    li = latest(line_items)

    gross_margin = safe_get(m, "gross_margin") or safe_get(m, "gross_profit_margin")
    op_margin = safe_get(m, "operating_margin")
    roe = safe_get(m, "return_on_equity")
    rev_g = safe_get(m, "revenue_growth")
    debt_eq = safe_get(m, "debt_to_equity")

    switching = score_switching_proxies(gross_margin, op_margin)
    network = score_network_proxies(rev_g, gross_margin)
    durability = score_durability(roe, debt_eq, op_margin)

    score = switching["score"] * 0.35 + network["score"] * 0.30 + durability["score"] * 0.35

    return {
        "score": clamp(score),
        "bastion_switching_costs": switching,
        "bastion_network_effects": network,
        "bastion_durability": durability,
        "bastion_composite_moat": round(score, 2),
    }


def score_switching_proxies(gross_margin: float | None, op_margin: float | None) -> dict[str, Any]:
    score = 5.0
    if gross_margin is not None:
        if gross_margin > 0.55:
            score += 2.5
        elif gross_margin > 0.40:
            score += 1
        elif gross_margin < 0.25:
            score -= 1.5
    if op_margin is not None:
        if op_margin > 0.25:
            score += 1.5
        elif op_margin < 0.08:
            score -= 1
    return {
        "score": clamp(score),
        "details": f"Gross margin {gross_margin}; operating margin {op_margin} as pricing power proxy",
    }


def score_network_proxies(rev_g: float | None, gross_margin: float | None) -> dict[str, Any]:
    score = 5.0
    if rev_g is not None:
        if rev_g > 0.20:
            score += 2
        elif rev_g > 0.10:
            score += 1
        elif rev_g < 0:
            score -= 1.5
    if gross_margin is not None and gross_margin > 0.50 and rev_g and rev_g > 0.15:
        score += 1
    return {
        "score": clamp(score),
        "details": f"Revenue growth {rev_g} with margin profile suggests platform leverage",
    }


def score_durability(roe: float | None, debt_eq: float | None, op_margin: float | None) -> dict[str, Any]:
    score = 5.0
    if roe is not None:
        if roe > 0.20:
            score += 2
        elif roe < 0.08:
            score -= 1
    if debt_eq is not None and debt_eq > 1.5:
        score -= 1.5
    if op_margin is not None and op_margin > 0.20:
        score += 0.5
    return {
        "score": clamp(score),
        "details": f"ROE {roe}; leverage {debt_eq}",
    }
