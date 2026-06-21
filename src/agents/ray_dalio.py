"""Ray Dalio agent — all-weather balance, macro resilience, and leverage risk."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, price_stats, ratio, run_legendary_agent, safe_get, stability_score, values
from src.graph.state import AgentState
from src.utils.interactive_artifacts import build_dalio_regime
def ray_dalio_agent(state: AgentState, agent_id: str = "ray_dalio_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Ray Dalio",
        agent_label="Ray Dalio Agent",
        persona="You think in economic machines and balanced exposures. Favor companies resilient across inflation, growth, deleveraging, and volatility regimes.",
        checklist=[
            "Inflation and growth sensitivity proxies",
            "Leverage and debt service risk",
            "Cash-flow resilience across environments",
            "Correlation-style volatility and drawdown risk",
            "All-weather balance over one-scenario upside",
        ],
        analysis_fn=analyze_dalio_metrics,
        extra_artifacts_fn=lambda t, a, c, _s: [
            art
            for art in [build_dalio_regime(t, a, c.get("macro"))]
            if art
        ],
    )


def analyze_dalio_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    macro_balance = score_macro_balance(ctx["metrics"], ctx["line_items"])
    leverage = score_deleveraging_resilience(ctx["metrics"], ctx["line_items"])
    cash_flow = score_cash_flow_resilience(ctx["line_items"])
    volatility = score_all_weather_volatility(ctx["prices"])
    score = macro_balance["score"] * 0.30 + leverage["score"] * 0.25 + cash_flow["score"] * 0.25 + volatility["score"] * 0.20
    return {
        "score": score,
        "dalio_macro_balance": macro_balance,
        "dalio_deleveraging_resilience": leverage,
        "dalio_cash_flow_resilience": cash_flow,
        "dalio_all_weather_volatility": volatility,
    }


def score_macro_balance(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    gross_margin = safe_get(latest(metrics), "gross_margin")
    revenue_growth = safe_get(latest(metrics), "revenue_growth")
    capex = abs(safe_get(latest(line_items), "capital_expenditure") or 0)
    revenue = safe_get(latest(line_items), "revenue")
    capex_intensity = ratio(capex, revenue)
    score = 5.0
    if gross_margin is not None:
        score += 2 if gross_margin > 0.35 else -1 if gross_margin < 0.15 else 0
    if revenue_growth is not None:
        score += 1.5 if revenue_growth > 0.03 else -1 if revenue_growth < -0.08 else 0
    if capex_intensity is not None:
        score += 1 if capex_intensity < 0.08 else -1 if capex_intensity > 0.20 else 0
    return {"score": clamp(score), "details": f"gross margin {gross_margin}; revenue growth {revenue_growth}; capex intensity {capex_intensity}"}


def score_deleveraging_resilience(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    li = latest(line_items)
    debt_to_equity = safe_get(latest(metrics), "debt_to_equity") or ratio(safe_get(li, "total_debt"), safe_get(li, "shareholders_equity"))
    interest_coverage = safe_get(latest(metrics), "interest_coverage") or ratio(safe_get(li, "ebit"), abs(safe_get(li, "interest_expense") or 0))
    cash_to_debt = ratio(safe_get(li, "cash_and_equivalents"), safe_get(li, "total_debt"))
    score = 5.0
    if debt_to_equity is not None:
        score += 2 if debt_to_equity < 0.7 else -2 if debt_to_equity > 2.0 else 0
    if interest_coverage is not None:
        score += 1.5 if interest_coverage > 5 else -1.5 if interest_coverage < 2 else 0
    if cash_to_debt is not None:
        score += 1 if cash_to_debt > 0.4 else -1 if cash_to_debt < 0.1 else 0
    return {"score": clamp(score), "details": f"D/E {debt_to_equity}; interest coverage {interest_coverage}; cash/debt {cash_to_debt}"}


def score_cash_flow_resilience(line_items: list[Any]) -> dict[str, Any]:
    fcf = values(line_items, "free_cash_flow")
    operating_cash = values(line_items, "operating_cash_flow")
    positive_ratio = sum(1 for x in fcf if x > 0) / len(fcf) if fcf else 0
    stability = stability_score(operating_cash, target_low_vol=0.30)
    score = clamp(positive_ratio * 5 + stability * 0.5)
    return {"score": score, "details": f"positive FCF ratio {positive_ratio:.0%}; operating cash stability {stability:.1f}"}


def score_all_weather_volatility(prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    score = 5.0
    if stats["volatility"] is not None:
        score += 2 if stats["volatility"] < 0.28 else -1.5 if stats["volatility"] > 0.55 else 0
    if stats["drawdown"] is not None:
        score += 2 if stats["drawdown"] > -0.15 else -1.5 if stats["drawdown"] < -0.35 else 0
    return {"score": clamp(score), "details": f"volatility {stats['volatility']}; drawdown {stats['drawdown']}"}

