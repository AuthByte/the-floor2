"""Li Lu agent — quality compounders, value discipline, and conservative leverage."""

from typing import Any

from src.agents._legendary_investor_utils import cagr, clamp, latest, ratio, run_legendary_agent, safe_get, stability_score, valuation_snapshot, values
from src.graph.state import AgentState


def li_lu_agent(state: AgentState, agent_id: str = "li_lu_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Li Lu",
        agent_label="Li Lu Agent",
        persona="You are a disciplined quality-value compounder. Seek durable businesses, long runways, high returns on capital, conservative leverage, and an unmistakable margin of safety.",
        checklist=[
            "Long-term revenue and earnings compounding",
            "ROE or ROIC quality",
            "Conservative leverage",
            "Margin of safety",
            "Avoid leverage-driven or speculative growth",
        ],
        analysis_fn=analyze_li_lu_metrics,
    )


def analyze_li_lu_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    compounding = score_compounding_record(ctx["metrics"], ctx["line_items"])
    quality = score_quality_returns(ctx["metrics"])
    leverage = score_conservative_leverage(ctx["metrics"], ctx["line_items"])
    margin = score_margin_of_safety(valuation_snapshot(ctx["metrics"], ctx["line_items"], ctx["market_cap"]))
    score = compounding["score"] * 0.30 + quality["score"] * 0.25 + leverage["score"] * 0.20 + margin["score"] * 0.25
    return {
        "score": score,
        "li_lu_compounding_record": compounding,
        "li_lu_quality_returns": quality,
        "li_lu_conservative_leverage": leverage,
        "li_lu_margin_of_safety": margin,
    }


def score_compounding_record(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    revenue_cagr = cagr(values(line_items, "revenue"))
    earnings_cagr = cagr(values(line_items, "net_income"))
    fcf_stability = stability_score(values(line_items, "free_cash_flow"), target_low_vol=0.35)
    score = 5.0
    if revenue_cagr is not None:
        score += 2 if revenue_cagr > 0.08 else 1 if revenue_cagr > 0.03 else -1 if revenue_cagr < 0 else 0
    if earnings_cagr is not None:
        score += 2 if earnings_cagr > 0.10 else 1 if earnings_cagr > 0.03 else -1 if earnings_cagr < 0 else 0
    score += (fcf_stability - 5) * 0.25
    return {"score": clamp(score), "details": f"revenue CAGR {revenue_cagr}; earnings CAGR {earnings_cagr}; FCF stability {fcf_stability:.1f}"}


def score_quality_returns(metrics: list[Any]) -> dict[str, Any]:
    roe = safe_get(latest(metrics), "return_on_equity")
    roic = safe_get(latest(metrics), "return_on_invested_capital")
    margin_stability = stability_score(values(metrics, "operating_margin"), target_low_vol=0.20)
    score = 5.0
    if roe is not None:
        score += 1.5 if roe > 0.15 else -1 if roe < 0.05 else 0
    if roic is not None:
        score += 2 if roic > 0.12 else -1 if roic < 0.05 else 0
    score += (margin_stability - 5) * 0.3
    return {"score": clamp(score), "details": f"ROE {roe}; ROIC {roic}; operating margin stability {margin_stability:.1f}"}


def score_conservative_leverage(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    li = latest(line_items)
    debt_to_equity = safe_get(latest(metrics), "debt_to_equity") or ratio(safe_get(li, "total_debt"), safe_get(li, "shareholders_equity"))
    cash_to_debt = ratio(safe_get(li, "cash_and_equivalents"), safe_get(li, "total_debt"))
    current_ratio = safe_get(latest(metrics), "current_ratio")
    score = 5.0
    if debt_to_equity is not None:
        score += 2 if debt_to_equity < 0.6 else -2 if debt_to_equity > 1.5 else 0
    if cash_to_debt is not None:
        score += 1.5 if cash_to_debt > 0.5 else -1 if cash_to_debt < 0.1 else 0
    if current_ratio is not None:
        score += 1 if current_ratio > 1.3 else -0.5 if current_ratio < 1 else 0
    return {"score": clamp(score), "details": f"D/E {debt_to_equity}; cash/debt {cash_to_debt}; current ratio {current_ratio}"}


def score_margin_of_safety(valuation: dict[str, Any]) -> dict[str, Any]:
    fcf_yield = valuation["fcf_yield"]
    pe = valuation["pe"]
    pb = valuation["pb"]
    score = 5.0
    if fcf_yield is not None:
        score += 2 if fcf_yield > 0.05 else -1 if fcf_yield < 0.015 else 0
    if pe is not None:
        score += 1.5 if 0 < pe < 18 else -1 if pe > 35 else 0
    if pb is not None:
        score += 1 if pb < 3 else -0.75 if pb > 8 else 0
    return {"score": clamp(score), "details": f"FCF yield {fcf_yield}; P/E {pe}; P/B {pb}"}

