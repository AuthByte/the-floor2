"""Paul Tudor Jones agent — trend following, stops, catalysts, and volatility regimes."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, news_tone, price_stats, run_legendary_agent, safe_get
from src.graph.state import AgentState


def paul_tudor_jones_agent(state: AgentState, agent_id: str = "paul_tudor_jones_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Paul Tudor Jones",
        agent_label="Paul Tudor Jones Agent",
        persona="You are a disciplined macro trader. Respect trend, catalysts, volatility, and stops before valuation narratives.",
        checklist=[
            "Price trend and tape confirmation",
            "Drawdown discipline and stop risk",
            "Volatility regime",
            "Catalyst or news momentum",
            "Cut losing setups quickly",
        ],
        analysis_fn=analyze_tudor_jones_metrics,
    )


def analyze_tudor_jones_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    trend = score_trend_following(ctx["prices"])
    stops = score_stop_discipline(ctx["prices"])
    vol = score_volatility_regime(ctx["prices"])
    catalyst = score_catalyst_momentum(ctx["news"], ctx["metrics"])
    score = trend["score"] * 0.35 + stops["score"] * 0.25 + vol["score"] * 0.20 + catalyst["score"] * 0.20
    return {
        "score": score,
        "tudor_trend_following": trend,
        "tudor_stop_discipline": stops,
        "tudor_volatility_regime": vol,
        "tudor_catalyst_momentum": catalyst,
    }


def score_trend_following(prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    momentum = stats["momentum"]
    consistency = stats["trend_consistency"]
    score = 5.0
    if momentum is not None:
        score += 3 if momentum > 0.15 else -2 if momentum < -0.10 else 0
    if consistency is not None:
        score += 2 if consistency > 0.55 else -1 if consistency < 0.45 else 0
    return {"score": clamp(score), "details": f"momentum {momentum}; up-day consistency {consistency}"}


def score_stop_discipline(prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    drawdown = stats["drawdown"]
    reversal = stats["reversal_20d"]
    score = 6.0
    if drawdown is not None:
        score += 2 if drawdown > -0.10 else -3 if drawdown < -0.25 else -0.5
    if reversal is not None:
        score += 1 if reversal > -0.05 else -1.5 if reversal < -0.15 else 0
    return {"score": clamp(score), "details": f"drawdown {drawdown}; 20-day reversal {reversal}"}


def score_volatility_regime(prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    vol = stats["volatility"]
    score = 5.0
    if vol is not None:
        score += 2 if 0.15 <= vol <= 0.45 else -2 if vol > 0.75 else 0
    return {"score": clamp(score), "details": f"annualized volatility {vol}"}


def score_catalyst_momentum(news: list[Any], metrics: list[Any]) -> dict[str, Any]:
    tone = news_tone(news)
    revenue_growth = safe_get(metrics[0], "revenue_growth", 0) if metrics else 0
    earnings_growth = safe_get(metrics[0], "earnings_growth", 0) if metrics else 0
    score = 5 + tone["optimism"] * 6 - tone["pessimism"] * 4
    if revenue_growth and revenue_growth > 0.08:
        score += 1
    if earnings_growth and earnings_growth > 0.08:
        score += 1
    return {"score": clamp(score), "details": f"optimism {tone['optimism']:.0%}; pessimism {tone['pessimism']:.0%}; revenue growth {revenue_growth}; earnings growth {earnings_growth}"}

