"""Joel Greenblatt agent — magic formula earnings yield plus return on capital."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, ratio, run_legendary_agent, safe_get, valuation_snapshot
from src.graph.state import AgentState


def joel_greenblatt_agent(state: AgentState, agent_id: str = "joel_greenblatt_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Joel Greenblatt",
        agent_label="Joel Greenblatt Agent",
        persona="You apply the Magic Formula: buy good businesses at bargain prices using earnings yield and return on capital, while avoiding structurally weak firms.",
        checklist=[
            "High earnings yield",
            "High return on capital or invested capital",
            "Composite rank quality plus cheapness",
            "Avoid low-quality value traps",
        ],
        analysis_fn=analyze_greenblatt_metrics,
    )


def analyze_greenblatt_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    valuation = valuation_snapshot(metrics, line_items, ctx["market_cap"])
    earnings_yield = score_earnings_yield(valuation, line_items, ctx["market_cap"])
    return_capital = score_return_on_capital(metrics, line_items)
    magic_formula = score_magic_formula_composite(earnings_yield["score"], return_capital["score"])
    quality_guardrail = score_quality_guardrail(metrics, line_items)
    score = magic_formula["score"] * 0.55 + quality_guardrail["score"] * 0.20 + earnings_yield["score"] * 0.125 + return_capital["score"] * 0.125
    return {
        "score": score,
        "greenblatt_earnings_yield": earnings_yield,
        "greenblatt_return_on_capital": return_capital,
        "greenblatt_magic_formula_composite": magic_formula,
        "greenblatt_quality_guardrail": quality_guardrail,
    }


def score_earnings_yield(valuation: dict[str, Any], line_items: list[Any], market_cap: float | None) -> dict[str, Any]:
    ebit = safe_get(latest(line_items), "ebit")
    debt = safe_get(latest(line_items), "total_debt") or 0
    cash = safe_get(latest(line_items), "cash_and_equivalents") or 0
    enterprise_value = market_cap + debt - cash if market_cap is not None else None
    ebit_yield = ratio(ebit, enterprise_value)
    fallback_yield = valuation["earnings_yield"] or valuation["fcf_yield"]
    yld = ebit_yield if ebit_yield is not None else fallback_yield
    score = 5 + (4 if yld and yld > 0.10 else 2 if yld and yld > 0.06 else -2 if yld is not None and yld < 0.02 else 0)
    return {"score": clamp(score), "details": f"EBIT/EV {ebit_yield}; fallback yield {fallback_yield}"}


def score_return_on_capital(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    roic = safe_get(m, "return_on_invested_capital")
    roc_proxy = ratio(safe_get(li, "ebit"), (safe_get(li, "total_assets") or 0) - (safe_get(li, "current_liabilities") or 0))
    roc = roic if roic is not None else roc_proxy
    score = 5 + (4 if roc and roc > 0.25 else 2 if roc and roc > 0.12 else -2 if roc is not None and roc < 0.05 else 0)
    return {"score": clamp(score), "details": f"ROIC {roic}; EBIT/(assets-current liabilities) {roc_proxy}"}


def score_magic_formula_composite(cheapness_score: float, quality_score: float) -> dict[str, Any]:
    spread_penalty = abs(cheapness_score - quality_score) * 0.25
    score = clamp((cheapness_score + quality_score) / 2 - spread_penalty + (1 if cheapness_score >= 7 and quality_score >= 7 else 0))
    return {"score": score, "details": f"cheapness {cheapness_score:.1f}; quality {quality_score:.1f}; balance penalty {spread_penalty:.1f}"}


def score_quality_guardrail(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    margin = safe_get(latest(metrics), "operating_margin")
    fcf = safe_get(latest(line_items), "free_cash_flow")
    debt_to_equity = safe_get(latest(metrics), "debt_to_equity")
    score = 5.0
    if margin is not None:
        score += 1.5 if margin > 0.12 else -1 if margin < 0.03 else 0
    if fcf is not None:
        score += 1.5 if fcf > 0 else -1.5
    if debt_to_equity is not None:
        score += 1 if debt_to_equity < 1 else -1 if debt_to_equity > 2 else 0
    return {"score": clamp(score), "details": f"operating margin {margin}; FCF {fcf}; D/E {debt_to_equity}"}

