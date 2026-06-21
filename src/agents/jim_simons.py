"""Jim Simons agent — statistical anomalies, signal quality, and liquidity."""

from typing import Any

from src.agents._legendary_investor_utils import clamp, latest, news_tone, price_stats, ratio, run_legendary_agent, safe_get, stability_score, values
from src.graph.state import AgentState


def jim_simons_agent(state: AgentState, agent_id: str = "jim_simons_agent"):
    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Jim Simons",
        agent_label="Jim Simons Agent",
        persona="You think like a quantitative scientist: prefer repeatable statistical edges, clean data, liquidity, stable volatility, and exploitable anomalies over stories.",
        checklist=[
            "Price momentum versus short-term reversal",
            "Volatility stability and trend consistency",
            "Earnings or price anomaly confirmation",
            "Liquidity sufficient for a systematic edge",
            "Penalize noisy, unstable, story-only setups",
        ],
        analysis_fn=analyze_simons_metrics,
    )


def analyze_simons_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx["metrics"]
    line_items = ctx["line_items"]
    prices = ctx["prices"]
    market_cap = ctx["market_cap"]
    stats = price_stats(prices)
    latest_metric = latest(metrics)

    statistical_signal = score_statistical_signal(stats)
    volatility_regime = score_volatility_regime(stats)
    anomaly_signal = score_earnings_price_anomaly(metrics, line_items, market_cap, stats)
    liquidity_signal = score_liquidity_proxy(stats, market_cap)

    score = (
        statistical_signal["score"] * 0.35
        + volatility_regime["score"] * 0.20
        + anomaly_signal["score"] * 0.30
        + liquidity_signal["score"] * 0.15
    )
    return {
        "score": score,
        "simons_statistical_signal": statistical_signal,
        "simons_volatility_regime": volatility_regime,
        "simons_earnings_price_anomaly": anomaly_signal,
        "simons_liquidity_proxy": liquidity_signal,
        "latest_metric_snapshot": latest_metric.model_dump() if latest_metric else {},
    }


def score_statistical_signal(stats: dict[str, Any]) -> dict[str, Any]:
    momentum = stats["momentum"]
    reversal = stats["reversal_20d"]
    trend = stats["trend_consistency"]
    score = 5.0
    details = []
    if momentum is not None:
        score += 2.0 if 0.05 <= momentum <= 0.45 else -1.0 if momentum < -0.15 else 0.5
        details.append(f"full-period momentum {momentum:.1%}")
    if reversal is not None:
        score += 1.5 if -0.08 <= reversal <= 0.02 and momentum and momentum > 0 else -0.5 if reversal > 0.20 else 0
        details.append(f"20-day reversal {reversal:.1%}")
    if trend is not None:
        score += 1.5 if 0.52 <= trend <= 0.68 else -1.0 if trend < 0.45 else 0
        details.append(f"trend consistency {trend:.1%}")
    return {"score": clamp(score), "details": "; ".join(details) or "Insufficient price tape"}


def score_volatility_regime(stats: dict[str, Any]) -> dict[str, Any]:
    vol = stats["volatility"]
    drawdown = stats["drawdown"]
    score = 5.0
    details = []
    if vol is not None:
        score += 2.5 if 0.12 <= vol <= 0.40 else -2.0 if vol > 0.70 else 0.5
        details.append(f"annualized volatility {vol:.1%}")
    if drawdown is not None:
        score += 1.5 if drawdown > -0.12 else -1.5 if drawdown < -0.35 else 0
        details.append(f"current drawdown {drawdown:.1%}")
    return {"score": clamp(score), "details": "; ".join(details) or "Insufficient volatility data"}


def score_earnings_price_anomaly(metrics: list[Any], line_items: list[Any], market_cap: float | None, stats: dict[str, Any]) -> dict[str, Any]:
    revenue_growth = safe_get(latest(metrics), "revenue_growth")
    earnings_growth = safe_get(latest(metrics), "earnings_growth")
    fcf_yield = safe_get(latest(metrics), "free_cash_flow_yield") or ratio(safe_get(latest(line_items), "free_cash_flow"), market_cap)
    margin_stability = stability_score(values(metrics, "operating_margin"))
    momentum = stats["momentum"] or 0
    surprise_proxy = ((revenue_growth or 0) + (earnings_growth or 0)) / 2 - momentum
    score = 5 + clamp(surprise_proxy * 20, -3, 3) + (margin_stability - 5) * 0.35 + (1.5 if fcf_yield and fcf_yield > 0.04 else 0)
    return {
        "score": clamp(score),
        "details": f"fundamental acceleration minus price move {surprise_proxy:.1%}; margin stability {margin_stability:.1f}; FCF yield {fcf_yield:.1%}" if fcf_yield is not None else f"fundamental acceleration minus price move {surprise_proxy:.1%}; margin stability {margin_stability:.1f}",
    }


def score_liquidity_proxy(stats: dict[str, Any], market_cap: float | None) -> dict[str, Any]:
    liquidity = stats["liquidity"]
    score = 5.0
    if liquidity is not None:
        score += 2 if liquidity > 1_000_000 else 0.5 if liquidity > 200_000 else -1.5
    if market_cap is not None:
        score += 2 if market_cap > 10_000_000_000 else 0.5 if market_cap > 1_000_000_000 else -1
    return {"score": clamp(score), "details": f"average volume {liquidity or 0:,.0f}; market cap {market_cap or 0:,.0f}"}

