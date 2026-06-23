"""Resolve API keys from env, request payload, or legacy single-key string."""

from __future__ import annotations

import os
from typing import Any

# All keys the floor can use — env baseline merged with per-request overrides.
KNOWN_API_KEY_NAMES: tuple[str, ...] = (
    # Market data (fallback chain)
    "FINANCIAL_DATASETS_API_KEY",
    "FMP_API_KEY",
    "FINNHUB_API_KEY",
    "ALPHA_VANTAGE_API_KEY",
    "MARKETAUX_API_KEY",
    "FRED_API_KEY",
    "POLYGON_API_KEY",
    "TIINGO_API_KEY",
    "TWELVE_DATA_API_KEY",
    "EODHD_API_KEY",
    "SIMFIN_API_KEY",
    # SEC EDGAR (User-Agent header, not a secret)
    "SEC_EDGAR_USER_AGENT",
    # LLM providers
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "XAI_API_KEY",
    "MOONSHOT_API_KEY",
    "KIMI_API_KEY",
    "GIGACHAT_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
    # Post-shift integrations
    "ALPACA_API_KEY_ID",
    "ALPACA_API_SECRET_KEY",
    "ALPACA_PAPER_BASE_URL",
    "RESEND_API_KEY",
    "RESEND_FROM",
)


def merge_api_keys(explicit: dict[str, str] | None = None) -> dict[str, str | None]:
    """Load every known key from the environment, then apply request overrides."""
    keys: dict[str, str | None] = {name: os.environ.get(name) for name in KNOWN_API_KEY_NAMES}
    if explicit:
        for key, value in explicit.items():
            if value:
                keys[key] = value
    return keys


def resolve_api_keys(api_key: str | dict[str, str] | None = None) -> dict[str, str | None]:
    """Normalize legacy single-key or dict input into a full provider map."""
    if isinstance(api_key, dict):
        return merge_api_keys(api_key)

    keys = merge_api_keys()
    if isinstance(api_key, str) and api_key:
        keys["FINANCIAL_DATASETS_API_KEY"] = api_key
    return keys


def keys_from_state(state: dict[str, Any] | None) -> dict[str, str | None]:
    """Full provider map for an agent graph node (env + shift request)."""
    explicit: dict[str, str] | None = None
    if state and state.get("metadata", {}).get("request"):
        request = state["metadata"]["request"]
        if hasattr(request, "api_keys") and request.api_keys:
            explicit = request.api_keys
    return merge_api_keys(explicit)


def active_keys_dict(keys: dict[str, str | None] | None = None) -> dict[str, str]:
    """Strip nulls — suitable for attaching to HedgeFundRequest."""
    merged = keys if keys is not None else merge_api_keys()
    return {k: v for k, v in merged.items() if v}


__all__ = [
    "KNOWN_API_KEY_NAMES",
    "merge_api_keys",
    "resolve_api_keys",
    "keys_from_state",
    "active_keys_dict",
]
