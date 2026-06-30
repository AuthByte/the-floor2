"""Weighted generic metrics for persona agents — no per-persona Python modules."""

from __future__ import annotations

from typing import Any, Callable

from src.agents._legendary_investor_utils import (
    clamp,
    latest,
    price_stats,
    ratio,
    safe_get,
    stability_score,
    valuation_snapshot,
    values,
)
from src.utils.persona_models import PersonaMetrics, PersonaMetricWeights


def generic_persona_metrics(metric_profile: PersonaMetrics | dict[str, Any]) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """Return an analysis_fn compatible with run_legendary_agent."""
    if isinstance(metric_profile, dict):
        weights = PersonaMetricWeights.model_validate(
            metric_profile.get("weights") or metric_profile
        )
        flags = metric_profile.get("custom_flags") or {}
    else:
        weights = metric_profile.weights
        flags = metric_profile.custom_flags

    def analyze(ctx: dict[str, Any]) -> dict[str, Any]:
        return _analyze_persona_metrics(ctx, weights, flags)

    return analyze


def _analyze_persona_metrics(
    ctx: dict[str, Any],
    weights: PersonaMetricWeights,
    flags: dict[str, Any],
) -> dict[str, Any]:
    metrics = ctx.get("metrics") or []
    line_items = ctx.get("line_items") or []
    prices = ctx.get("prices") or []
    macro = ctx.get("macro") or {}

    valuation = _score_valuation(metrics, line_items, ctx.get("market_cap"))
    momentum = _score_momentum(prices)
    quality = _score_quality(metrics, line_items)
    macro_sensitivity = _score_macro_sensitivity(macro, prices)
    risk_control = _score_risk_control(prices, metrics, flags)

    score = (
        valuation["score"] * weights.valuation
        + momentum["score"] * weights.momentum
        + quality["score"] * weights.quality
        + macro_sensitivity["score"] * weights.macro_sensitivity
        + risk_control["score"] * weights.risk_control
    )

    return {
        "score": score,
        "max_score": 10,
        "persona_valuation": valuation,
        "persona_momentum": momentum,
        "persona_quality": quality,
        "persona_macro_sensitivity": macro_sensitivity,
        "persona_risk_control": risk_control,
    }


def _score_valuation(metrics: list[Any], line_items: list[Any], market_cap: float | None) -> dict[str, Any]:
    snap = valuation_snapshot(metrics, line_items, market_cap)
    fcf_yield = snap.get("fcf_yield")
    pe = snap.get("pe")
    pb = snap.get("pb")
    score = 5.0
    if fcf_yield is not None:
        score += 2 if fcf_yield > 0.06 else -1.5 if fcf_yield < 0.02 else 0
    if pe is not None:
        score += 1.5 if 8 < pe < 22 else -1 if pe > 40 else 0
    if pb is not None:
        score += 1 if pb < 2 else -1 if pb > 8 else 0
    return {"score": clamp(score), "details": f"FCF yield {fcf_yield}; P/E {pe}; P/B {pb}"}


def _score_momentum(prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    ret = stats.get("total_return")
    vol = stats.get("volatility")
    score = 5.0
    if ret is not None:
        score += 2 if ret > 0.12 else -2 if ret < -0.12 else 0
    if vol is not None:
        score += 1 if 0.15 < vol < 0.45 else -1 if vol > 0.75 else 0
    return {
        "score": clamp(score),
        "details": f"total return {ret}; volatility {vol}",
    }


def _score_quality(metrics: list[Any], line_items: list[Any]) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    roe = safe_get(m, "return_on_equity")
    fcf = values(line_items, "free_cash_flow")
    positive_fcf = sum(1 for x in fcf if x > 0) / len(fcf) if fcf else 0
    operating = values(line_items, "operating_income")
    stability = stability_score(operating, target_low_vol=0.35)
    debt_to_equity = safe_get(m, "debt_to_equity") or ratio(
        safe_get(li, "total_debt"), safe_get(li, "shareholders_equity")
    )
    score = clamp(positive_fcf * 4 + stability * 0.35 + (2 if roe and roe > 0.12 else 0))
    if debt_to_equity is not None and debt_to_equity > 2:
        score = clamp(score - 1.5)
    return {
        "score": score,
        "details": f"ROE {roe}; positive FCF ratio {positive_fcf:.0%}; stability {stability:.1f}",
    }


def _score_macro_sensitivity(macro: dict[str, Any], prices: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    headline = (macro.get("summary") or {}).get("headline", "")
    risk_tone = (macro.get("summary") or {}).get("risk_tone", "neutral")
    score = 5.0
    if risk_tone == "risk_off":
        score -= 1.5
    elif risk_tone == "risk_on":
        score += 1.0
    if stats.get("drawdown") is not None and stats["drawdown"] < -0.25:
        score -= 1.0
    return {
        "score": clamp(score),
        "details": f"macro tone {risk_tone}; headline {headline[:80]}",
    }


def _score_risk_control(
    prices: list[Any],
    metrics: list[Any],
    flags: dict[str, Any],
) -> dict[str, Any]:
    stats = price_stats(prices)
    m = latest(metrics)
    debt_assets = safe_get(m, "debt_to_assets")
    score = 6.0
    if stats.get("drawdown") is not None:
        score += 1.5 if stats["drawdown"] > -0.15 else -2 if stats["drawdown"] < -0.40 else -0.5
    if stats.get("volatility") is not None:
        score += 1 if stats["volatility"] < 0.30 else -1.5 if stats["volatility"] > 0.60 else 0
    if debt_assets is not None:
        score += 1 if debt_assets < 0.35 else -1 if debt_assets > 0.65 else 0
    if flags.get("penalize_high_debt") and debt_assets is not None and debt_assets > 0.5:
        score -= 1.0
    return {
        "score": clamp(score),
        "details": f"drawdown {stats.get('drawdown')}; vol {stats.get('volatility')}; debt/assets {debt_assets}",
    }
