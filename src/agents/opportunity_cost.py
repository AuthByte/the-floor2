"""Opportunity Cost desk — what capital forgives by choosing this position."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, ratio, run_legendary_agent, safe_get
from src.graph.state import AgentState
from src.utils.interactive_artifacts import build_opportunity_frontier
from src.utils.thesis_outlook import latest_close


def opportunity_cost_agent(state: AgentState, agent_id: str = "opportunity_cost_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Opportunity Cost",
        agent_label="Opportunity Cost Agent",
        persona=(
            "You are the Opportunity Cost desk. Every dollar in this name is a dollar not "
            "in alternatives: cash yield, index beta, sector peers, or higher-conviction ideas. "
            "Quantify the tradeoff — expected return vs forgone options, time cost, and "
            "liquidity premium. Bearish when the name is a weak use of marginal capital."
        ),
        checklist=[
            "Risk-free and cash alternative yield",
            "Sector peer expected return spread",
            "Conviction-adjusted opportunity set",
            "Time and complexity cost of the thesis",
            "Marginal dollar better deployed elsewhere?",
        ],
        analysis_fn=analyze_opportunity_cost,
        extra_artifacts_fn=lambda t, a, c, _s: [
            build_opportunity_frontier(t, a, current_price=latest_close(c.get("prices") or []))
        ],
    )


def analyze_opportunity_cost(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx.get("metrics") or []
    m = latest(metrics)
    macro = ctx.get("macro") or {}
    series = macro.get("series") or {} if isinstance(macro, dict) else {}
    rf = None
    if isinstance(series, dict):
        tnx = series.get("DGS10") or series.get("GS10")
        if isinstance(tnx, dict):
            rf = tnx.get("latest") or tnx.get("value")
        elif isinstance(tnx, (int, float)):
            rf = tnx

    rev_g = safe_get(m, "revenue_growth")
    roe = safe_get(m, "return_on_equity")
    pe = safe_get(m, "price_to_earnings_ratio") or safe_get(m, "pe_ratio")
    earnings_g = safe_get(m, "earnings_growth")

    implied_return = None
    if pe and pe > 0:
        implied_return = ratio(1.0, pe)

    score = 5.0
    if rf is not None and implied_return is not None:
        spread = implied_return - float(rf) / 100.0
        if spread < 0.02:
            score -= 2
        elif spread > 0.08:
            score += 2
    if rev_g is not None and rev_g < 0.05:
        score -= 1
    if roe is not None and roe > 0.18:
        score += 1

    return {
        "score": clamp(score),
        "opportunity_risk_free_proxy": rf,
        "opportunity_implied_earnings_yield": round(implied_return, 4) if implied_return else None,
        "opportunity_revenue_growth": rev_g,
        "opportunity_roe": roe,
        "opportunity_earnings_growth": earnings_g,
        "opportunity_spread_vs_cash": (
            round((implied_return or 0) - float(rf) / 100.0, 4) if rf and implied_return else None
        ),
    }
