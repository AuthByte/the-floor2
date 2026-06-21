"""John Templeton agent — global contrarian bargains and recovery potential."""

from typing import Any

from src.agents._legendary_investor_utils import cagr, clamp, latest, news_tone, run_legendary_agent, safe_get, trend_slope, valuation_snapshot, values
from src.graph.state import AgentState


def john_templeton_agent(state: AgentState, agent_id: str = "john_templeton_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="John Templeton",
        agent_label="John Templeton Agent",
        persona="You are a global contrarian bargain hunter. Look for maximum pessimism paired with improving long-term fundamentals and recovery potential.",
        checklist=[
            "Pessimism from headlines or depressed expectations",
            "Valuation discount versus fundamentals",
            "Improving revenue, earnings, or margins",
            "Long-term recovery runway",
            "Avoid value traps where fundamentals keep deteriorating",
        ],
        analysis_fn=analyze_templeton_metrics,
    )


def analyze_templeton_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    tone = score_maximum_pessimism(ctx["news"], metrics)
    bargain = score_global_bargain(valuation_snapshot(metrics, line_items, ctx["market_cap"]))
    improvement = score_fundamental_improvement(metrics, line_items)
    recovery = score_recovery_potential(metrics, line_items)
    score = tone["score"] * 0.25 + bargain["score"] * 0.30 + improvement["score"] * 0.25 + recovery["score"] * 0.20
    return {
        "score": score,
        "templeton_maximum_pessimism": tone,
        "templeton_bargain_valuation": bargain,
        "templeton_improving_fundamentals": improvement,
        "templeton_long_term_recovery": recovery,
    }


def score_maximum_pessimism(news: list[Any], metrics: list[Any]) -> dict[str, Any]:
    tone = news_tone(news)
    earnings_growth = safe_get(latest(metrics), "earnings_growth") or 0
    score = 5 + (3 if tone["pessimism"] > 0.25 and earnings_growth >= -0.05 else 0) - (2 if tone["pessimism"] > 0.35 and earnings_growth < -0.20 else 0)
    return {"score": clamp(score), "details": f"negative headline share {tone['pessimism']:.0%}; earnings growth {earnings_growth:.1%}"}


def score_global_bargain(valuation: dict[str, Any]) -> dict[str, Any]:
    pe = valuation["pe"]
    pb = valuation["pb"]
    fcf_yield = valuation["fcf_yield"]
    score = 5.0
    if pe is not None:
        score += 2 if 0 < pe < 12 else -1 if pe > 30 else 0
    if pb is not None:
        score += 2 if pb < 1.5 else -1 if pb > 5 else 0
    if fcf_yield is not None:
        score += 2 if fcf_yield > 0.06 else -1 if fcf_yield < 0 else 0
    return {"score": clamp(score), "details": f"P/E {pe}; P/B {pb}; FCF yield {fcf_yield}"}


def score_fundamental_improvement(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    revenue_growth = safe_get(latest(metrics), "revenue_growth")
    margin_change = trend_slope(values(metrics, "operating_margin"))
    income_cagr = cagr(values(line_items, "net_income"))
    score = 5.0
    if revenue_growth is not None:
        score += 1.5 if revenue_growth > 0.03 else -1 if revenue_growth < -0.10 else 0
    score += 1.5 if margin_change > 0.05 else -1 if margin_change < -0.10 else 0
    if income_cagr is not None:
        score += 1.5 if income_cagr > 0 else -1 if income_cagr < -0.15 else 0
    return {"score": clamp(score), "details": f"revenue growth {revenue_growth}; margin change {margin_change:.1%}; income CAGR {income_cagr}"}


def score_recovery_potential(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    revenues = values(line_items, "revenue")
    equity = values(line_items, "shareholders_equity")
    revenue_floor = min(revenues) / max(revenues) if revenues and max(revenues) else None
    equity_trend = trend_slope(equity)
    roe = safe_get(latest(metrics), "return_on_equity")
    score = 5.0
    if revenue_floor is not None:
        score += 1.5 if revenue_floor > 0.70 else -1 if revenue_floor < 0.40 else 0
    score += 1.5 if equity_trend > -0.05 else -1 if equity_trend < -0.25 else 0
    if roe is not None:
        score += 1 if roe > 0.08 else -0.5 if roe < 0 else 0
    return {"score": clamp(score), "details": f"revenue floor {revenue_floor}; equity trend {equity_trend:.1%}; ROE {roe}"}

