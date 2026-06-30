"""Time horizon and price target fields for investor agent theses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ThesisOutlookFields(BaseModel):
    time_horizon_months: int = Field(
        default=12,
        ge=1,
        le=120,
        description="Investment horizon in months (e.g. 6, 12, 24, 36)",
    )
    price_target: float | None = Field(
        default=None,
        ge=0,
        description="USD price target over the stated horizon; null only if truly no view",
    )


OUTLOOK_JSON_SCHEMA = (
    '  "time_horizon_months": int (1-120),\n'
    '  "price_target": number | null (USD price target over that horizon),'
)

OUTLOOK_PROMPT_RULES = (
    "Always set time_horizon_months to your expected holding period (e.g. 6, 12, 24, 36). "
    "Set price_target to a specific USD price you expect over that horizon when bullish or bearish; "
    "it must be directionally consistent with your signal (above spot for bullish, below for bearish). "
    "Use null price_target only for genuinely neutral/no-view cases."
)


def latest_close(prices: list[Any] | None) -> float | None:
    if not prices:
        return None
    ordered = list(prices)
    if len(ordered) > 1:
        first = getattr(ordered[0], "time", None) or (ordered[0].get("time") if isinstance(ordered[0], dict) else None)
        last = getattr(ordered[-1], "time", None) or (ordered[-1].get("time") if isinstance(ordered[-1], dict) else None)
        if first and last and str(first) > str(last):
            ordered = list(reversed(ordered))
    for row in reversed(ordered):
        close = getattr(row, "close", None) if not isinstance(row, dict) else row.get("close")
        if close is not None:
            try:
                val = float(close)
                if val > 0:
                    return val
            except (TypeError, ValueError):
                continue
    return None


def compute_upside_pct(
    price_target: float | None,
    current_price: float | None,
) -> float | None:
    if price_target is None or current_price is None or current_price <= 0:
        return None
    return round((price_target - current_price) / current_price * 100.0, 1)


def format_horizon(months: int | None) -> str:
    if months is None:
        return "—"
    if months < 12:
        return f"{months}mo"
    if months % 12 == 0:
        years = months // 12
        return f"{years}yr" if years == 1 else f"{years}yr"
    return f"{months}mo"


def extract_outlook(output: Any) -> dict[str, Any]:
    months = getattr(output, "time_horizon_months", None)
    target = getattr(output, "price_target", None)
    out: dict[str, Any] = {}
    if months is not None:
        try:
            out["time_horizon_months"] = int(months)
        except (TypeError, ValueError):
            pass
    if target is not None:
        try:
            val = float(target)
            if val > 0:
                out["price_target"] = round(val, 2)
        except (TypeError, ValueError):
            pass
    return out


def enrich_outlook(
    outlook: dict[str, Any],
    *,
    current_price: float | None,
) -> dict[str, Any]:
    enriched = dict(outlook)
    upside = compute_upside_pct(enriched.get("price_target"), current_price)
    if upside is not None:
        enriched["upside_pct"] = upside
    if current_price is not None and current_price > 0:
        enriched["reference_price"] = round(float(current_price), 2)
    return enriched


def _dig(analysis: dict[str, Any], *keys: str) -> Any:
    cur: Any = analysis
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _positive_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        val = float(value)
        if val > 0:
            return round(val, 2)
    except (TypeError, ValueError):
        return None
    return None


def derive_price_target(
    analysis: dict[str, Any] | None,
    *,
    current_price: float | None = None,
) -> float | None:
    """Derive a per-share USD price target from deterministic valuation blocks."""
    if not analysis:
        return None

    for path in (
        ("intrinsic_per_share",),
        ("intrinsic_value_per_share",),
        ("fair_value_per_share",),
        ("graham_number",),
        ("valuation_analysis", "graham_number"),
        ("intrinsic_val_analysis", "intrinsic_per_share"),
        ("intrinsic_value_analysis", "intrinsic_per_share"),
    ):
        val = _dig(analysis, *path)
        per_share = _positive_float(val)
        if per_share is not None:
            return per_share

    shares = _positive_float(_dig(analysis, "outstanding_shares"))
    if shares is None:
        for path in (
            ("intrinsic_value_analysis", "outstanding_shares"),
            ("intrinsic_val_analysis", "outstanding_shares"),
        ):
            shares = _positive_float(_dig(analysis, *path))
            if shares is not None:
                break

    for path in (
        ("intrinsic_value_analysis", "intrinsic_value"),
        ("intrinsic_val_analysis", "intrinsic_value"),
        ("intrinsic_value",),
    ):
        total_iv = _positive_float(_dig(analysis, *path))
        if total_iv is not None and shares is not None:
            per_share = _positive_float(total_iv / shares)
            if per_share is not None:
                return per_share

    market_cap = _positive_float(_dig(analysis, "market_cap"))
    total_iv = _positive_float(
        _dig(analysis, "intrinsic_value_analysis", "intrinsic_value")
        or _dig(analysis, "intrinsic_val_analysis", "intrinsic_value")
        or _dig(analysis, "intrinsic_value")
    )
    if (
        total_iv is not None
        and market_cap is not None
        and current_price is not None
        and current_price > 0
    ):
        per_share = _positive_float(total_iv / market_cap * current_price)
        if per_share is not None:
            return per_share

    return None
