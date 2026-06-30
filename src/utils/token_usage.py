"""Accumulate OpenRouter / LLM token usage per agent and per shift."""

from __future__ import annotations

import re
from typing import Any

_SUFFIX_RE = re.compile(r"^(.+)_([a-z0-9]{6})$", re.I)


def normalize_agent_key(agent_name: str) -> str:
    m = _SUFFIX_RE.match(agent_name.strip())
    if m:
        return m.group(1)
    return agent_name


def empty_usage() -> dict[str, Any]:
    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cost": 0.0,
        "calls": 0,
    }


def _coerce_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _coerce_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def extract_usage_from_llm_payload(payload: Any) -> dict[str, Any] | None:
    """Read token usage from a LangChain AIMessage chunk or response."""
    if payload is None:
        return None

    usage_meta = getattr(payload, "usage_metadata", None)
    if isinstance(usage_meta, dict) and usage_meta:
        prompt = _coerce_int(
            usage_meta.get("input_tokens") or usage_meta.get("prompt_tokens")
        )
        completion = _coerce_int(
            usage_meta.get("output_tokens") or usage_meta.get("completion_tokens")
        )
        total = _coerce_int(usage_meta.get("total_tokens")) or (prompt + completion)
        if total <= 0:
            return None
        return {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
            "cost": 0.0,
            "calls": 1,
        }

    response_meta = getattr(payload, "response_metadata", None)
    if isinstance(response_meta, dict):
        token_usage = response_meta.get("token_usage")
        if isinstance(token_usage, dict):
            prompt = _coerce_int(token_usage.get("prompt_tokens"))
            completion = _coerce_int(token_usage.get("completion_tokens"))
            total = _coerce_int(token_usage.get("total_tokens")) or (prompt + completion)
            if total <= 0:
                return None
            return {
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": total,
                "cost": _coerce_float(token_usage.get("cost")),
                "calls": 1,
            }

    if isinstance(payload, dict):
        usage = payload.get("usage")
        if isinstance(usage, dict):
            prompt = _coerce_int(usage.get("prompt_tokens"))
            completion = _coerce_int(usage.get("completion_tokens"))
            total = _coerce_int(usage.get("total_tokens")) or (prompt + completion)
            if total <= 0:
                return None
            return {
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": total,
                "cost": _coerce_float(usage.get("cost")),
                "calls": 1,
            }

    return None


def merge_usage(target: dict[str, Any], delta: dict[str, Any]) -> dict[str, Any]:
    target["prompt_tokens"] = _coerce_int(target.get("prompt_tokens")) + _coerce_int(
        delta.get("prompt_tokens")
    )
    target["completion_tokens"] = _coerce_int(
        target.get("completion_tokens")
    ) + _coerce_int(delta.get("completion_tokens"))
    target["total_tokens"] = _coerce_int(target.get("total_tokens")) + _coerce_int(
        delta.get("total_tokens")
    )
    target["cost"] = _coerce_float(target.get("cost")) + _coerce_float(delta.get("cost"))
    target["calls"] = _coerce_int(target.get("calls")) + max(1, _coerce_int(delta.get("calls")))
    return target


class TokenUsageTracker:
    def __init__(self) -> None:
        self._by_agent: dict[str, dict[str, Any]] = {}
        self._run_total = empty_usage()

    def reset(self) -> None:
        self._by_agent.clear()
        self._run_total = empty_usage()

    def record(self, agent_name: str | None, delta: dict[str, Any] | None) -> dict[str, Any] | None:
        if not agent_name or not delta:
            return None
        key = normalize_agent_key(agent_name)
        bucket = self._by_agent.setdefault(key, empty_usage())
        merge_usage(bucket, delta)
        merge_usage(self._run_total, delta)
        return dict(bucket)

    def agent_totals(self, agent_name: str) -> dict[str, Any] | None:
        key = normalize_agent_key(agent_name)
        totals = self._by_agent.get(key)
        return dict(totals) if totals else None

    def snapshot(self) -> dict[str, Any]:
        agents = {
            key: dict(vals)
            for key, vals in sorted(self._by_agent.items())
            if _coerce_int(vals.get("total_tokens")) > 0
        }
        return {
            "total": dict(self._run_total),
            "agents": agents,
        }


tracker = TokenUsageTracker()
