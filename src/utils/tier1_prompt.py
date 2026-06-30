"""Inject Tier-0 briefings into Tier-1 LLM prompts."""

from __future__ import annotations

import re
from typing import Any

from src.utils.data_feed_keys import DATA_FEED_KEYS
from src.utils.risk_pipeline import risk_briefing_for_ticker
from src.utils.ticker_dossier import dossier_prompt_block
from src.utils.tier0_briefing import extract_base_agent_key, tier0_briefing_for_ticker

_SKIP_INJECT_BASES = frozenset({"portfolio_manager", "risk_management_agent"})


def should_inject_tier0(agent_name: str | None, state: dict[str, Any] | None) -> bool:
    if not agent_name or not state:
        return False
    data = state.get("data") or {}
    if not data.get("tier0_complete"):
        return False
    base = extract_base_agent_key(agent_name)
    if base in DATA_FEED_KEYS or base in _SKIP_INJECT_BASES:
        return False
    if base.startswith("risk_management"):
        return False
    from src.utils.analysts import ANALYST_CONFIG
    return base in ANALYST_CONFIG


def extract_ticker_from_prompt(prompt: Any) -> str | None:
    """Best-effort ticker extraction from a LangChain prompt value."""
    text_parts: list[str] = []
    messages = getattr(prompt, "messages", None)
    if messages:
        for msg in messages:
            content = getattr(msg, "content", None)
            if isinstance(content, str):
                text_parts.append(content)
    elif isinstance(prompt, str):
        text_parts.append(prompt)

    blob = "\n".join(text_parts)
    m = re.search(r"Ticker:\s*([A-Z][A-Z0-9.\-]{0,9})", blob, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    m = re.search(r"Analysis Data for\s+([A-Z][A-Z0-9.\-]{0,9})", blob, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return None


def inject_tier0_into_prompt(prompt: Any, state: dict[str, Any], agent_name: str) -> Any:
    if not should_inject_tier0(agent_name, state):
        return prompt

    ticker = extract_ticker_from_prompt(prompt)
    if not ticker:
        return prompt

    block = tier0_briefing_for_ticker(state, ticker)
    dossier_block = dossier_prompt_block(state, ticker)
    risk_block = risk_briefing_for_ticker(state, ticker)
    macro = (state.get("data") or {}).get("macro_context")
    macro_block = ""
    if macro and macro.get("available"):
        from src.utils.tier0_summaries import macro_briefing_appendix

        macro_block = macro_briefing_appendix(macro)

    if not block and not dossier_block and not risk_block and not macro_block:
        return prompt

    appendix_parts: list[str] = []
    if block:
        appendix_parts.append(
            "TIER-0 DESK BRIEFINGS (primary feeds — synthesize with your framework; "
            "do not re-fetch sentiment/news if covered below):\n"
            f"{block}"
        )
    if risk_block:
        appendix_parts.append(
            "RISK DISCOVERY REGISTER (structured risks, scores, and scenarios — "
            "address top risks in your thesis):\n"
            f"{risk_block}"
        )
    if dossier_block:
        appendix_parts.append(
            "TICKER DOSSIER (structured facts, peer claims, and disputes — "
            "cite fact ids when grounding your view):\n"
            f"{dossier_block}"
        )

    if macro_block:
        appendix_parts.append(
            "MACRO CONTEXT (FRED + BLS — fold into top-down reasoning):\n"
            f"{macro_block}"
        )

    appendix = "\n\n---\n" + "\n\n".join(appendix_parts) + "\n"

    messages = list(getattr(prompt, "messages", []) or [])
    if not messages:
        return prompt

    last = messages[-1]
    content = getattr(last, "content", "")
    if not isinstance(content, str) or (
        (block and block in content)
        or (dossier_block and dossier_block in content)
        or (risk_block and risk_block in content)
    ):
        return prompt

    try:
        from langchain_core.messages import HumanMessage

        messages[-1] = HumanMessage(content=content + appendix)
        return prompt.model_copy(update={"messages": messages})
    except Exception:
        return prompt
