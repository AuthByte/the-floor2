
import os


def get_api_key_from_state(state: dict, api_key_name: str) -> str | None:
    """Get an API key from the request payload or environment."""
    if state and state.get("metadata", {}).get("request"):
        request = state["metadata"]["request"]
        if hasattr(request, "api_keys") and request.api_keys:
            val = request.api_keys.get(api_key_name)
            if val:
                return val
    return os.environ.get(api_key_name)