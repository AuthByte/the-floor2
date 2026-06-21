"""Resolve API keys from a single legacy key, env, or request dict."""

from __future__ import annotations

import os
from typing import Any


def resolve_api_keys(api_key: str | dict[str, str] | None = None) -> dict[str, str | None]:
    """Merge explicit keys with environment variables."""
    keys: dict[str, str | None] = {
        "FINANCIAL_DATASETS_API_KEY": os.environ.get("FINANCIAL_DATASETS_API_KEY"),
        "FMP_API_KEY": os.environ.get("FMP_API_KEY"),
        "FINNHUB_API_KEY": os.environ.get("FINNHUB_API_KEY"),
        "ALPHA_VANTAGE_API_KEY": os.environ.get("ALPHA_VANTAGE_API_KEY"),
        "MARKETAUX_API_KEY": os.environ.get("MARKETAUX_API_KEY"),
        "FRED_API_KEY": os.environ.get("FRED_API_KEY"),
        "POLYGON_API_KEY": os.environ.get("POLYGON_API_KEY"),
        "TIINGO_API_KEY": os.environ.get("TIINGO_API_KEY"),
        "TWELVE_DATA_API_KEY": os.environ.get("TWELVE_DATA_API_KEY"),
        "EODHD_API_KEY": os.environ.get("EODHD_API_KEY"),
        "SIMFIN_API_KEY": os.environ.get("SIMFIN_API_KEY"),
    }
    if isinstance(api_key, dict):
        keys.update({k: v for k, v in api_key.items() if v})
    elif api_key:
        keys["FINANCIAL_DATASETS_API_KEY"] = api_key
    return keys


def keys_from_state(state: dict[str, Any] | None) -> dict[str, str | None]:
    if state and state.get("metadata", {}).get("request"):
        request = state["metadata"]["request"]
        if hasattr(request, "api_keys") and request.api_keys:
            return resolve_api_keys(request.api_keys)
    return resolve_api_keys()
