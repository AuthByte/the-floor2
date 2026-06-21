"""Model selection for auxiliary, in-shift helper LLM calls.

Several helper tasks (one-line thesis summaries, chart/plan selection, supply
chain mapping, sub-agent planning) default to a free OpenRouter model. That
works when an OpenRouter key is configured, but otherwise every helper call
fails with a 401 — even when the shift itself runs on a fully working provider
such as a local Ollama model.

``resolve_aux_model`` keeps the OpenRouter default whenever its key is
available, and otherwise falls back to the run's primary model/provider so the
helper tasks work for any configured provider (local or cloud).
"""

from __future__ import annotations

import os
from typing import Any, Tuple

from src.llm.models import ModelProvider


def _api_keys_from_state(state: Any | None) -> dict | None:
    if not state or not hasattr(state, "get"):
        return None
    request = (state.get("metadata") or {}).get("request")
    if request is not None and hasattr(request, "api_keys"):
        return request.api_keys
    return None


def _run_model_from_state(state: Any | None) -> Tuple[str | None, str | None]:
    if not state or not hasattr(state, "get"):
        return None, None
    meta = state.get("metadata") or {}
    provider = meta.get("model_provider")
    provider_str = provider.value if hasattr(provider, "value") else (
        str(provider) if provider else None
    )
    return meta.get("model_name"), provider_str


def _has_openrouter_key(state: Any | None) -> bool:
    api_keys = _api_keys_from_state(state) or {}
    key = api_keys.get("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    return bool(key and key.strip() and key != "your-openrouter-api-key")


def resolve_aux_model(
    state: Any | None,
    default_model: str,
    default_provider: str = ModelProvider.OPENROUTER.value,
) -> Tuple[str, str]:
    """Return ``(model_name, provider)`` to use for an auxiliary helper call.

    When the default provider is OpenRouter but no usable OpenRouter key is
    configured, fall back to the run's primary model/provider so offline/local
    providers still work. In every other case the default is returned unchanged.
    """
    if default_provider == ModelProvider.OPENROUTER.value and not _has_openrouter_key(state):
        run_model, run_provider = _run_model_from_state(state)
        if run_model and run_provider and run_provider != ModelProvider.OPENROUTER.value:
            return run_model, run_provider
    return default_model, default_provider
