"""David Einhorn agent — forensic accounting, balance-sheet stress, and short thesis."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, ratio, run_legendary_agent, safe_get, valuation_snapshot
from src.graph.state import AgentState


def david_einhorn_agent(state: AgentState, agent_id: str = "david_einhorn_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="David Einhorn",
        agent_label="David Einhorn Agent",
        persona=(
            "You are a forensic accountant and activist short seller. Hunt for accounting "
            "aggressiveness, deteriorating cash conversion, insider selling, and balance-sheet "
            "stress that the market is ignoring. Prefer bearish when evidence is asymmetric."
        ),
        checklist=[
            "Cash flow vs reported earnings divergence",
            "Accruals and working-capital red flags",
            "Insider selling or dilution",
            "Leverage and liquidity stress",
            "Valuation that prices perfection",
        ],
        analysis_fn=analyze_einhorn_metrics,
    )


def analyze_einhorn_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    valuation = valuation_snapshot(metrics, line_items, ctx["market_cap"])
    cash_quality = score_cash_quality(metrics, line_items)
    accruals = score_accruals(metrics, line_items)
    insider = score_insider_pressure(ctx["insider_trades"])
    leverage = score_leverage_stress(metrics, line_items)
    valuation_risk = score_valuation_risk(valuation)
    score = (
        cash_quality["score"] * 0.25
        + accruals["score"] * 0.25
        + insider["score"] * 0.15
        + leverage["score"] * 0.20
        + valuation_risk["score"] * 0.15
    )
    return {
        "score": score,
        "einhorn_cash_quality": cash_quality,
        "einhorn_accruals": accruals,
        "einhorn_insider_pressure": insider,
        "einhorn_leverage_stress": leverage,
        "einhorn_valuation_risk": valuation_risk,
    }


def score_cash_quality(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    fcf = safe_get(li, "free_cash_flow")
    net_income = safe_get(li, "net_income")
    ocf = safe_get(li, "operating_cash_flow")
    conversion = ratio(fcf, net_income) if net_income else ratio(ocf, net_income)
    score = 5.0
    if conversion is not None:
        if conversion < 0.5:
            score += 3
        elif conversion < 0.85:
            score += 1
        elif conversion > 1.2:
            score -= 1.5
    if fcf is not None and fcf < 0:
        score += 2
    return {
        "score": clamp(score),
        "details": f"FCF/NI conversion {conversion}; FCF {fcf}",
    }


def score_accruals(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    li = latest(line_items)
    assets = safe_get(li, "total_assets")
    revenue = safe_get(li, "revenue")
    receivables_proxy = safe_get(li, "current_assets")
    accrual_proxy = ratio(receivables_proxy, revenue) if revenue else None
    score = 5.0
    if accrual_proxy is not None:
        if accrual_proxy > 0.45:
            score += 2.5
        elif accrual_proxy > 0.30:
            score += 1
        elif accrual_proxy < 0.15:
            score -= 0.5
    margin = safe_get(latest(metrics), "operating_margin")
    if margin is not None and margin < 0.05:
        score += 1.5
    if assets is not None and assets <= 0:
        score += 1
    return {
        "score": clamp(score),
        "details": f"working-capital/revenue proxy {accrual_proxy}; op margin {margin}",
    }


def score_insider_pressure(insider_trades: list[Any]) -> dict[str, Any]:
    sells = 0
    buys = 0
    for t in insider_trades or []:
        side = getattr(t, "transaction_type", None) or (t.get("transaction_type") if isinstance(t, dict) else None)
        if not side:
            continue
        s = str(side).lower()
        if "sell" in s or "sale" in s:
            sells += 1
        elif "buy" in s or "purchase" in s:
            buys += 1
    score = 5.0
    if sells > buys + 2:
        score += 2.5
    elif sells > buys:
        score += 1
    elif buys > sells + 2:
        score -= 1.5
    return {
        "score": clamp(score),
        "details": f"insider sells {sells}; buys {buys}",
    }


def score_leverage_stress(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    dte = safe_get(m, "debt_to_equity")
    debt = safe_get(li, "total_debt")
    cash = safe_get(li, "cash_and_equivalents")
    interest = safe_get(li, "interest_expense")
    ebit = safe_get(li, "ebit")
    coverage = ratio(ebit, interest) if interest else None
    score = 5.0
    if dte is not None:
        if dte > 2.5:
            score += 2.5
        elif dte > 1.5:
            score += 1
        elif dte < 0.4:
            score -= 0.5
    if coverage is not None:
        if coverage < 2:
            score += 2
        elif coverage < 4:
            score += 0.5
    if debt and cash and debt > cash * 3:
        score += 1
    return {
        "score": clamp(score),
        "details": f"D/E {dte}; interest coverage {coverage}; debt {debt}; cash {cash}",
    }


def score_valuation_risk(valuation: dict[str, Any]) -> dict[str, Any]:
    pe = valuation.get("pe_ratio")
    fcf_yield = valuation.get("fcf_yield")
    score = 5.0
    if pe is not None:
        if pe > 45:
            score += 2.5
        elif pe > 30:
            score += 1
        elif pe < 12:
            score -= 1
    if fcf_yield is not None:
        if fcf_yield < 0.02:
            score += 2
        elif fcf_yield < 0.04:
            score += 0.5
        elif fcf_yield > 0.08:
            score -= 1
    return {
        "score": clamp(score),
        "details": f"P/E {pe}; FCF yield {fcf_yield}",
    }
