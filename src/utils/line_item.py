"""Safe access to dynamic LineItem fields (SEC / yfinance extras)."""

from __future__ import annotations

from typing import Any

from src.data.models import LineItem


def line_get(item: LineItem | None, name: str, default: Any = None) -> Any:
    if item is None:
        return default
    extra = getattr(item, "__pydantic_extra__", None) or {}
    if name in extra:
        return extra[name]
    if name in type(item).model_fields:
        return getattr(item, name, default)
    return default
