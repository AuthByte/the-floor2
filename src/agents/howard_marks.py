"""Howard Marks agent — cycles, credit risk, and margin for error."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, price_stats, ratio, run_legendary_agent, safe_get, stability_score, valuation_snapshot, values
from src.graph.state import AgentState


def howard_marks_agent(state: AgentState, agent_id: str = "howard_marks_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Howard Marks",
        agent_label="Howard Marks Agent",
        persona="You are a cycle-aware credit and risk-control investor. You care more about avoiding permanent loss than chasing upside.",
        checklist=[
            "Balance sheet leverage and interest coverage",
            "Durability of cash flows across periods",
            "Downside risk and price drawdown",
            "Valuation only if it compensates for cycle risk",
            "Prefer caution when evidence is mixed",
        ],
        analysis_fn=analyze_marks_metrics,
    )


def analyze_marks_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    valuation = valuation_snapshot(metrics, line_items, ctx["market_cap"])
    credit_cycle = score_credit_cycle(metrics, line_items)
    cash_durability = score_cash_flow_durability(line_items)
    downside = score_downside_risk(ctx["prices"], metrics)
    valuation_caution = score_valuation_vs_cycle(valuation, credit_cycle["score"])
    score = credit_cycle["score"] * 0.30 + cash_durability["score"] * 0.25 + downside["score"] * 0.25 + valuation_caution["score"] * 0.20
    return {
        "score": score,
        "marks_credit_cycle_analysis": credit_cycle,
        "marks_cash_flow_durability": cash_durability,
        "marks_downside_risk_control": downside,
        "marks_valuation_cycle_caution": valuation_caution,
    }


def score_credit_cycle(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    debt_to_equity = safe_get(m, "debt_to_equity") or ratio(safe_get(li, "total_debt"), safe_get(li, "shareholders_equity"))
    interest_coverage = safe_get(m, "interest_coverage") or ratio(safe_get(li, "ebit"), abs(safe_get(li, "interest_expense") or 0))
    current_ratio = safe_get(m, "current_ratio") or ratio(safe_get(li, "current_assets"), safe_get(li, "current_liabilities"))
    score = 5.0
    if debt_to_equity is not None:
        score += 2 if debt_to_equity < 0.6 else -2 if debt_to_equity > 2.0 else 0
    if interest_coverage is not None:
        score += 2 if interest_coverage > 6 else -2 if interest_coverage < 2 else 0
    if current_ratio is not None:
        score += 1 if current_ratio > 1.5 else -1 if current_ratio < 1 else 0
    return {"score": clamp(score), "details": f"D/E {debt_to_equity}; interest coverage {interest_coverage}; current ratio {current_ratio}"}


def score_cash_flow_durability(line_items: list[Any]) -> dict[str, Any]:
    fcf = values(line_items, "free_cash_flow")
    operating_income = values(line_items, "operating_income")
    positive_fcf_ratio = sum(1 for x in fcf if x > 0) / len(fcf) if fcf else 0
    stability = stability_score(operating_income, target_low_vol=0.35)
    score = clamp(positive_fcf_ratio * 6 + stability * 0.4)
    return {"score": score, "details": f"positive FCF periods {positive_fcf_ratio:.0%}; operating income stability {stability:.1f}"}


def score_downside_risk(prices: list[Any], metrics: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    debt_assets = safe_get(latest(metrics), "debt_to_assets")
    score = 6.0
    if stats["drawdown"] is not None:
        score += 1.5 if stats["drawdown"] > -0.15 else -2 if stats["drawdown"] < -0.40 else -0.5
    if stats["volatility"] is not None:
        score += 1 if stats["volatility"] < 0.30 else -1.5 if stats["volatility"] > 0.60 else 0
    if debt_assets is not None:
        score += 1 if debt_assets < 0.35 else -1 if debt_assets > 0.65 else 0
    return {"score": clamp(score), "details": f"drawdown {stats['drawdown']}; volatility {stats['volatility']}; debt/assets {debt_assets}"}


def score_valuation_vs_cycle(valuation: dict[str, Any], credit_score: float) -> dict[str, Any]:
    fcf_yield = valuation["fcf_yield"]
    pb = valuation["pb"]
    score = 5.0
    if fcf_yield is not None:
        score += 2 if fcf_yield > 0.06 else -1.5 if fcf_yield < 0.02 else 0
    if pb is not None:
        score += 1.5 if pb < 1.5 else -1 if pb > 5 else 0
    if credit_score < 5:
        score -= 1.5
    return {"score": clamp(score), "details": f"FCF yield {fcf_yield}; P/B {pb}; credit score adjustment {credit_score:.1f}"}

