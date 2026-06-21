"""Seth Klarman agent — deep value, asset backing, and downside protection."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, cagr, latest, news_tone, ratio, run_legendary_agent, safe_get, valuation_snapshot, values
from src.graph.state import AgentState


def seth_klarman_agent(state: AgentState, agent_id: str = "seth_klarman_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Seth Klarman",
        agent_label="Seth Klarman Agent",
        persona="You are a patient deep-value investor. You demand a large margin of safety, tangible asset backing, low expectations, and strong downside protection.",
        checklist=[
            "Asset backing and book value discount",
            "Free cash flow yield and normalized earnings power",
            "Low expectations or pessimism",
            "Balance sheet strength",
            "Downside protection before upside",
        ],
        analysis_fn=analyze_klarman_metrics,
    )


def analyze_klarman_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    valuation = valuation_snapshot(metrics, line_items, ctx["market_cap"])
    asset_backing = score_asset_backing(valuation, line_items)
    deep_value = score_deep_value_yield(valuation, line_items)
    expectations = score_low_expectations(ctx["news"], metrics)
    downside = score_balance_sheet_protection(metrics, line_items)
    score = asset_backing["score"] * 0.30 + deep_value["score"] * 0.30 + expectations["score"] * 0.15 + downside["score"] * 0.25
    return {
        "score": score,
        "klarman_asset_backing": asset_backing,
        "klarman_deep_value_yield": deep_value,
        "klarman_low_expectations": expectations,
        "klarman_downside_protection": downside,
    }


def score_asset_backing(valuation: dict[str, Any], line_items: list[Any]) -> dict[str, Any]:
    pb = valuation["pb"]
    equity = safe_get(latest(line_items), "shareholders_equity")
    liabilities = safe_get(latest(line_items), "total_liabilities")
    asset_cover = ratio(equity, liabilities)
    score = 5.0
    if pb is not None:
        score += 3 if pb < 1 else 1 if pb < 1.5 else -1.5 if pb > 4 else 0
    if asset_cover is not None:
        score += 2 if asset_cover > 1 else -1 if asset_cover < 0.4 else 0
    return {"score": clamp(score), "details": f"P/B {pb}; equity/liabilities {asset_cover}"}


def score_deep_value_yield(valuation: dict[str, Any], line_items: list[Any]) -> dict[str, Any]:
    fcf_yield = valuation["fcf_yield"]
    earnings_yield = valuation["earnings_yield"]
    fcf_growth = cagr(values(line_items, "free_cash_flow"))
    score = 5.0
    if fcf_yield is not None:
        score += 3 if fcf_yield > 0.08 else 1.5 if fcf_yield > 0.05 else -1 if fcf_yield < 0 else 0
    if earnings_yield is not None:
        score += 1.5 if earnings_yield > 0.07 else -1 if earnings_yield < 0.02 else 0
    if fcf_growth is not None and fcf_growth < -0.15:
        score -= 1
    return {"score": clamp(score), "details": f"FCF yield {fcf_yield}; earnings yield {earnings_yield}; FCF CAGR {fcf_growth}"}


def score_low_expectations(news: list[Any], metrics: list[Any]) -> dict[str, Any]:
    tone = news_tone(news)
    revenue_growth = safe_get(latest(metrics), "revenue_growth") or 0
    earnings_growth = safe_get(latest(metrics), "earnings_growth") or 0
    improving = revenue_growth > 0 or earnings_growth > 0
    score = 5 + (2 if tone["pessimism"] > 0.20 and improving else 0) - (1.5 if tone["optimism"] > 0.35 else 0)
    return {"score": clamp(score), "details": f"pessimism {tone['pessimism']:.0%}; revenue growth {revenue_growth:.1%}; earnings growth {earnings_growth:.1%}"}


def score_balance_sheet_protection(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    debt_to_equity = safe_get(m, "debt_to_equity") or ratio(safe_get(li, "total_debt"), safe_get(li, "shareholders_equity"))
    cash_to_debt = ratio(safe_get(li, "cash_and_equivalents"), safe_get(li, "total_debt"))
    current_ratio = safe_get(m, "current_ratio") or ratio(safe_get(li, "current_assets"), safe_get(li, "current_liabilities"))
    score = 5.0
    if debt_to_equity is not None:
        score += 2 if debt_to_equity < 0.5 else -2 if debt_to_equity > 1.5 else 0
    if cash_to_debt is not None:
        score += 1.5 if cash_to_debt > 0.5 else -1 if cash_to_debt < 0.1 else 0
    if current_ratio is not None:
        score += 1 if current_ratio > 1.5 else -1 if current_ratio < 1 else 0
    return {"score": clamp(score), "details": f"D/E {debt_to_equity}; cash/debt {cash_to_debt}; current ratio {current_ratio}"}

