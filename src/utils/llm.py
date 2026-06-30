"""Helper functions for LLM"""

import json
import time
from pydantic import BaseModel
from src.llm.models import get_model, get_model_info
from src.utils.progress import progress
from src.graph.state import AgentState
from src.utils.tier1_prompt import inject_tier0_into_prompt
from src.utils.token_usage import extract_usage_from_llm_payload

STREAM_FLUSH_CHARS = 48
STREAM_FLUSH_SECONDS = 0.18


def call_llm(
    prompt: any,
    pydantic_model: type[BaseModel],
    agent_name: str | None = None,
    state: AgentState | None = None,
    max_retries: int = 3,
    default_factory=None,
    *,
    stream: bool = True,
) -> BaseModel:
    """
    Makes an LLM call with retry logic. When agent_name is set and stream=True,
    token output is pushed to progress.analysis as it arrives.
    """
    if state and agent_name:
        model_name, model_provider = get_agent_model_config(state, agent_name)
    else:
        model_name = "gpt-4.1"
        model_provider = "OPENAI"

    api_keys = None
    if state:
        request = state.get("metadata", {}).get("request")
        if request and hasattr(request, "api_keys"):
            api_keys = request.api_keys

    model_info = get_model_info(model_name, model_provider)
    llm = get_model(model_name, model_provider, api_keys)
    use_streaming = bool(stream and agent_name)

    if state and agent_name:
        prompt = inject_tier0_into_prompt(prompt, state, agent_name)

    for attempt in range(max_retries):
        try:
            if use_streaming:
                result = _invoke_streaming(
                    llm=llm,
                    prompt=prompt,
                    pydantic_model=pydantic_model,
                    agent_name=agent_name,
                )
                if result is not None:
                    return result
                raise ValueError("Could not parse streamed LLM JSON response")

            structured_llm = llm
            if not (model_info and not model_info.has_json_mode()):
                structured_llm = llm.with_structured_output(
                    pydantic_model,
                    method="json_mode",
                    include_raw=True,
                )
            result = structured_llm.invoke(prompt)
            if isinstance(result, dict) and "parsed" in result:
                if agent_name:
                    usage = extract_usage_from_llm_payload(result.get("raw"))
                    if usage:
                        progress.record_token_usage(agent_name, usage)
                result = result.get("parsed")
            elif agent_name:
                usage = extract_usage_from_llm_payload(result)
                if usage:
                    progress.record_token_usage(agent_name, usage)
            if model_info and not model_info.has_json_mode():
                content = getattr(result, "content", result)
                parsed_result = extract_json_from_response(content)
                if parsed_result:
                    return pydantic_model(**parsed_result)
            else:
                return result

        except Exception as e:
            if agent_name:
                detail = str(e).replace("\n", " ").strip()[:100]
                progress.update_status(
                    agent_name,
                    None,
                    f"Error — retry {attempt + 1}/{max_retries}"
                    + (f": {detail}" if detail else ""),
                )

            if attempt == max_retries - 1:
                print(f"Error in LLM call after {max_retries} attempts: {e}")
                if default_factory:
                    return default_factory()
                return create_default_response(pydantic_model)

    return create_default_response(pydantic_model)


def _invoke_streaming(
    *,
    llm,
    prompt,
    pydantic_model: type[BaseModel],
    agent_name: str,
) -> BaseModel | None:
    buffer = ""
    last_emit_len = 0
    last_emit_at = 0.0
    usage_delta = None
    progress.update_status(agent_name, None, "Composing thesis…", clear_analysis=True)

    for chunk in llm.stream(prompt):
        chunk_usage = extract_usage_from_llm_payload(chunk)
        if chunk_usage:
            usage_delta = chunk_usage
        piece = _chunk_text(chunk)
        if not piece:
            continue
        buffer += piece
        now = time.monotonic()
        if (
            len(buffer) - last_emit_len >= STREAM_FLUSH_CHARS
            or now - last_emit_at >= STREAM_FLUSH_SECONDS
        ):
            progress.update_status(agent_name, None, "Composing thesis…", analysis=buffer)
            last_emit_len = len(buffer)
            last_emit_at = now

    if buffer:
        progress.update_status(agent_name, None, "Composing thesis…", analysis=buffer)

    usage = usage_delta
    if usage:
        progress.record_token_usage(agent_name, usage)

    parsed = extract_json_from_response(buffer)
    if parsed:
        return pydantic_model(**parsed)
    return None


def _chunk_text(chunk) -> str:
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                if part.get("type") == "text":
                    parts.append(str(part.get("text", "")))
                elif "text" in part:
                    parts.append(str(part["text"]))
        return "".join(parts)
    return ""


def create_default_response(model_class: type[BaseModel]) -> BaseModel:
    """Creates a safe default response based on the model's fields."""
    default_values = {}
    for field_name, field in model_class.model_fields.items():
        if field.annotation == str:
            default_values[field_name] = "Error in analysis, using default"
        elif field.annotation == float:
            default_values[field_name] = 0.0
        elif field.annotation == int:
            default_values[field_name] = 0
        elif hasattr(field.annotation, "__origin__") and field.annotation.__origin__ == dict:
            default_values[field_name] = {}
        else:
            # For other types (like Literal), try to use the first allowed value
            if hasattr(field.annotation, "__args__"):
                default_values[field_name] = field.annotation.__args__[0]
            else:
                default_values[field_name] = None

    return model_class(**default_values)


def extract_json_from_response(content: str) -> dict | None:
    """Extracts JSON from a response, handling markdown-wrapped and raw JSON formats."""
    try:
        # 1. Try markdown code block with ```json
        json_start = content.find("```json")
        if json_start != -1:
            json_text = content[json_start + 7:]  # Skip past ```json
            json_end = json_text.find("```")
            if json_end != -1:
                json_text = json_text[:json_end].strip()
                try:
                    return json.loads(json_text)
                except json.JSONDecodeError:
                    pass

        # 2. Try markdown code block without json specifier
        json_start = content.find("```")
        if json_start != -1:
            json_text = content[json_start + 3:]
            json_end = json_text.find("```")
            if json_end != -1:
                json_text = json_text[:json_end].strip()
                try:
                    return json.loads(json_text)
                except json.JSONDecodeError:
                    pass

        # 3. Try to parse the entire content as JSON
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            pass

        # 4. Find the first top-level JSON object by matching braces
        brace_start = content.find("{")
        if brace_start != -1:
            depth = 0
            for i, char in enumerate(content[brace_start:], brace_start):
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(content[brace_start:i + 1])
                        except json.JSONDecodeError:
                            break

    except Exception as e:
        print(f"Error extracting JSON from response: {e}")
    return None


def get_agent_model_config(state, agent_name):
    """
    Get model configuration for a specific agent from the state.
    Falls back to global model configuration if agent-specific config is not available.
    Always returns valid model_name and model_provider values.
    """
    request = state.get("metadata", {}).get("request")
    
    if request and hasattr(request, 'get_agent_model_config'):
        # Get agent-specific model configuration
        model_name, model_provider = request.get_agent_model_config(agent_name)
        # Ensure we have valid values
        if model_name and model_provider:
            return model_name, model_provider.value if hasattr(model_provider, 'value') else str(model_provider)
    
    # Fall back to global configuration (system defaults)
    model_name = state.get("metadata", {}).get("model_name") or "gpt-4.1"
    model_provider = state.get("metadata", {}).get("model_provider") or "OPENAI"
    
    # Convert enum to string if necessary
    if hasattr(model_provider, 'value'):
        model_provider = model_provider.value
    
    return model_name, model_provider
