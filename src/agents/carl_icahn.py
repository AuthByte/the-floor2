"""Carl Icahn agent — activist value, capital structure, and pressure points."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, insider_tone, latest, news_tone, ratio, run_legendary_agent, safe_get, valuation_snapshot
from src.graph.state import AgentState


def carl_icahn_agent(state: AgentState, agent_id: str = "carl_icahn_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Carl Icahn",
        agent_label="Carl Icahn Agent",
        persona="You are an activist investor. Look for undervalued companies where capital allocation, leverage, governance, or pressure can unlock value.",
        checklist=[
            "Undervaluation with tangible levers",
            "Capital structure and leverage optionality",
            "Buybacks, dividends, and capital returns",
            "Insider signals",
            "Governance or news pressure proxy",
        ],
        analysis_fn=analyze_icahn_metrics,
    )


def analyze_icahn_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    valuation = score_activist_undervaluation(valuation_snapshot(ctx["metrics"], ctx["line_items"], ctx["market_cap"]))
    capital_structure = score_capital_structure_lever(ctx["metrics"], ctx["line_items"])
    capital_returns = score_capital_returns(ctx["line_items"], ctx["market_cap"])
    pressure = score_pressure_and_insiders(ctx["news"], ctx["insider_trades"])
    score = valuation["score"] * 0.30 + capital_structure["score"] * 0.25 + capital_returns["score"] * 0.20 + pressure["score"] * 0.25
    return {
        "score": score,
        "icahn_activist_undervaluation": valuation,
        "icahn_capital_structure_levers": capital_structure,
        "icahn_capital_return_record": capital_returns,
        "icahn_governance_pressure_proxy": pressure,
    }


def score_activist_undervaluation(valuation: dict[str, Any]) -> dict[str, Any]:
    pe = valuation["pe"]
    fcf_yield = valuation["fcf_yield"]
    pb = valuation["pb"]
    score = 5.0
    if fcf_yield is not None:
        score += 2.5 if fcf_yield > 0.06 else -1 if fcf_yield < 0.01 else 0
    if pe is not None:
        score += 1.5 if 0 < pe < 15 else -1 if pe > 35 else 0
    if pb is not None:
        score += 1 if pb < 2 else -0.5 if pb > 6 else 0
    return {"score": clamp(score), "details": f"P/E {pe}; FCF yield {fcf_yield}; P/B {pb}"}


def score_capital_structure_lever(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    li = latest(line_items)
    debt_to_equity = safe_get(latest(metrics), "debt_to_equity") or ratio(safe_get(li, "total_debt"), safe_get(li, "shareholders_equity"))
    interest_coverage = safe_get(latest(metrics), "interest_coverage") or ratio(safe_get(li, "ebit"), abs(safe_get(li, "interest_expense") or 0))
    cash = safe_get(li, "cash_and_equivalents")
    score = 5.0
    if debt_to_equity is not None:
        score += 1.5 if 0.2 <= debt_to_equity <= 1.5 else -1.5 if debt_to_equity > 3 else 0
    if interest_coverage is not None:
        score += 1.5 if interest_coverage > 4 else -1.5 if interest_coverage < 1.5 else 0
    if cash and cash > 0:
        score += 0.75
    return {"score": clamp(score), "details": f"D/E {debt_to_equity}; interest coverage {interest_coverage}; cash {cash}"}


def score_capital_returns(line_items: list[Any], market_cap: float | None) -> dict[str, Any]:
    li = latest(line_items)
    buybacks = safe_get(li, "issuance_or_purchase_of_equity_shares")
    dividends = safe_get(li, "dividends_and_other_cash_distributions")
    buyback_yield = ratio(abs(buybacks), market_cap) if buybacks and buybacks < 0 else None
    dividend_yield = ratio(abs(dividends), market_cap) if dividends and dividends < 0 else None
    score = 5.0
    if buyback_yield is not None:
        score += 2 if buyback_yield > 0.03 else 1
    if dividend_yield is not None:
        score += 1.5 if dividend_yield > 0.02 else 0.5
    return {"score": clamp(score), "details": f"buyback yield {buyback_yield}; dividend yield {dividend_yield}"}


def score_pressure_and_insiders(news: list[Any], insider_trades: list[Any]) -> dict[str, Any]:
    tone = news_tone(news)
    insiders = insider_tone(insider_trades)
    pressure_words = ["activist", "board", "governance", "strategic review", "spinoff", "proxy", "settlement"]
    pressure_hits = sum(1 for item in news if any(word in safe_get(item, "title", "").lower() for word in pressure_words))
    score = 5 + min(2.5, pressure_hits) + (insiders["buy_ratio"] - 0.5) * 3 - tone["pessimism"] * 1.5
    return {"score": clamp(score), "details": f"pressure headlines {pressure_hits}; insider buy ratio {insiders['buy_ratio']:.0%}; pessimism {tone['pessimism']:.0%}"}

