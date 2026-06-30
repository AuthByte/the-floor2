import os

from src.tools.providers.keys import keys_from_state as _keys_from_state
from src.tools.providers.keys import merge_api_keys


def keys_from_state(state: dict | None) -> dict[str, str | None]:
    """Full market-data + integration key map (env merged with shift request)."""
    return _keys_from_state(state)


def get_api_key_from_state(state: dict, api_key_name: str) -> str | None:
    """Get one API key from the merged shift map or environment."""
    if state and state.get("metadata", {}).get("request"):
        request = state["metadata"]["request"]
        if hasattr(request, "api_keys") and request.api_keys:
            merged = merge_api_keys(request.api_keys)
            val = merged.get(api_key_name)
            if val:
                return val
    return os.environ.get(api_key_name)
