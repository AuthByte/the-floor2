"""Convert agent metrics context into JSON-safe structures for custom charts."""

from __future__ import annotations

from typing import Any


def _row(obj: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name in fields:
        val = getattr(obj, name, None) if not isinstance(obj, dict) else obj.get(name)
        if val is None:
            continue
        if isinstance(val, (str, int, float, bool)):
            out[name] = val
        else:
            out[name] = str(val)[:240]
    return out


def _price_row(p: Any) -> dict[str, Any]:
    return _row(p, ("time", "open", "high", "low", "close", "volume"))


def _metric_row(m: Any) -> dict[str, Any]:
    names = (
        "return_on_equity",
        "debt_to_equity",
        "gross_margin",
        "operating_margin",
        "net_margin",
        "revenue_growth",
        "earnings_growth",
        "book_value_growth",
        "current_ratio",
        "free_cash_flow_yield",
        "price_to_earnings_ratio",
        "price_to_book_ratio",
        "price_to_sales_ratio",
        "enterprise_value_to_ebitda_ratio",
        "peg_ratio",
    )
    return _row(m, names)


def _line_item_row(li: Any) -> dict[str, Any]:
    return _row(
        li,
        (
            "revenue",
            "net_income",
            "operating_income",
            "free_cash_flow",
            "earnings_per_share",
            "total_debt",
            "shareholders_equity",
        ),
    )


def _jsonable(value: Any, *, depth: int = 0) -> Any:
    if depth > 4:
        return str(value)[:200]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v, depth=depth + 1) for k, v in list(value.items())[:24]}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v, depth=depth + 1) for v in list(value)[:40]]
    return str(value)[:200]


def serialize_metrics_ctx(ctx: dict[str, Any]) -> dict[str, Any]:
    """Shrink and normalize ctx so custom chart code only sees safe data."""
    prices = ctx.get("prices") or []
    metrics = ctx.get("metrics") or []
    line_items = ctx.get("line_items") or []
    reasoning = ctx.get("reasoning")
    out: dict[str, Any] = {
        "ticker": ctx.get("ticker"),
        "market_cap": ctx.get("market_cap"),
        "prices": [_price_row(p) for p in prices[:400]],
        "metrics": [_metric_row(m) for m in metrics[:12]],
        "line_items": [_line_item_row(li) for li in line_items[:12]],
    }
    if isinstance(reasoning, dict):
        out["reasoning"] = _jsonable(reasoning)
    elif isinstance(reasoning, str):
        out["reasoning"] = reasoning[:4000]
    return out


def has_chartable_data(ctx: dict[str, Any]) -> bool:
    """True when there is enough serialized data for a custom chart attempt."""
    serialized = serialize_metrics_ctx(ctx)
    if serialized.get("prices"):
        return True
    if serialized.get("metrics"):
        return True
    if serialized.get("line_items"):
        return True
    reasoning = serialized.get("reasoning")
    return isinstance(reasoning, dict) and len(reasoning) >= 1
