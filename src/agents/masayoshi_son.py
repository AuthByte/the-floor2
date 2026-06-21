"""Masayoshi Son agent — visionary growth, convexity, and valuation risk."""

from typing import Any

from src.agents._legendary_investor_utils import cagr, clamp, latest, news_tone, price_stats, ratio, run_legendary_agent, safe_get, valuation_snapshot, values
from src.graph.state import AgentState


def masayoshi_son_agent(state: AgentState, agent_id: str = "masayoshi_son_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Masayoshi Son",
        agent_label="Masayoshi Son Agent",
        persona="You seek visionary convexity: massive growth, reinvestment, category leadership, and narrative momentum, while explicitly penalizing valuation and volatility blow-up risk.",
        checklist=[
            "Revenue growth acceleration",
            "Reinvestment or capex intensity",
            "TAM and story momentum from news",
            "Convex upside versus valuation risk",
            "Volatility and balance-sheet risk penalty",
        ],
        analysis_fn=analyze_son_metrics,
    )


def analyze_son_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    growth = score_growth_acceleration(ctx["metrics"], ctx["line_items"])
    reinvestment = score_reinvestment_intensity(ctx["line_items"])
    story = score_tam_story_momentum(ctx["news"], ctx["prices"])
    risk = score_convexity_risk_penalty(ctx["metrics"], ctx["line_items"], ctx["prices"], valuation_snapshot(ctx["metrics"], ctx["line_items"], ctx["market_cap"]))
    score = growth["score"] * 0.35 + reinvestment["score"] * 0.20 + story["score"] * 0.25 + risk["score"] * 0.20
    return {
        "score": score,
        "son_growth_acceleration": growth,
        "son_reinvestment_intensity": reinvestment,
        "son_tam_story_momentum": story,
        "son_convexity_risk_penalty": risk,
    }


def score_growth_acceleration(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    revenue_growth = safe_get(latest(metrics), "revenue_growth")
    revenue_cagr = cagr(values(line_items, "revenue"))
    earnings_growth = safe_get(latest(metrics), "earnings_growth")
    score = 5.0
    if revenue_growth is not None:
        score += 3 if revenue_growth > 0.20 else 1.5 if revenue_growth > 0.10 else -1 if revenue_growth < 0 else 0
    if revenue_cagr is not None:
        score += 1.5 if revenue_cagr > 0.15 else 0.5 if revenue_cagr > 0.06 else 0
    if earnings_growth is not None and earnings_growth < -0.30:
        score -= 1
    return {"score": clamp(score), "details": f"revenue growth {revenue_growth}; revenue CAGR {revenue_cagr}; earnings growth {earnings_growth}"}


def score_reinvestment_intensity(line_items: list[Any]) -> dict[str, Any]:
    li = latest(line_items)
    capex_intensity = ratio(abs(safe_get(li, "capital_expenditure") or 0), safe_get(li, "revenue"))
    fcf = safe_get(li, "free_cash_flow")
    score = 5.0
    if capex_intensity is not None:
        score += 2 if 0.08 <= capex_intensity <= 0.25 else -1 if capex_intensity > 0.40 else 0
    if fcf is not None:
        score += 1 if fcf > 0 else -0.75
    return {"score": clamp(score), "details": f"capex/revenue {capex_intensity}; free cash flow {fcf}"}


def score_tam_story_momentum(news: list[Any], prices: list[Any]) -> dict[str, Any]:
    tone = news_tone(news)
    stats = price_stats(prices)
    tam_words = ["ai", "platform", "cloud", "robot", "semiconductor", "network", "marketplace", "autonomous", "data center", "frontier"]
    tam_hits = sum(1 for item in news if any(word in safe_get(item, "title", "").lower() for word in tam_words))
    score = 5 + min(3, tam_hits * 0.5) + tone["optimism"] * 4 - tone["pessimism"] * 2
    if stats["momentum"] and stats["momentum"] > 0.20:
        score += 1
    return {"score": clamp(score), "details": f"TAM headline hits {tam_hits}; optimism {tone['optimism']:.0%}; momentum {stats['momentum']}"}


def score_convexity_risk_penalty(metrics: list[Any], line_items: list[Any], prices: list[Any], valuation: dict[str, Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    ps = valuation["ps"]
    debt_to_equity = safe_get(latest(metrics), "debt_to_equity")
    cash_to_debt = ratio(safe_get(latest(line_items), "cash_and_equivalents"), safe_get(latest(line_items), "total_debt"))
    score = 7.0
    if ps is not None:
        score -= 2 if ps > 12 else 1 if ps > 7 else 0
    if stats["volatility"] is not None:
        score -= 2 if stats["volatility"] > 0.75 else 0.5 if stats["volatility"] > 0.45 else 0
    if debt_to_equity is not None and debt_to_equity > 2:
        score -= 1.5
    if cash_to_debt is not None and cash_to_debt > 0.5:
        score += 1
    return {"score": clamp(score), "details": f"P/S {ps}; volatility {stats['volatility']}; D/E {debt_to_equity}; cash/debt {cash_to_debt}"}

