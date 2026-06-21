"""One-line thesis summaries and live verdict metadata for floor SSE."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.llm.models import ModelProvider, get_model
from src.utils.progress import progress
from src.utils.ticker_dossier import record_ticker_claim
from src.utils.thesis_outlook import enrich_outlook, extract_outlook

SUMMARIZER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"
SUMMARIZER_PROVIDER = ModelProvider.OPENROUTER.value


class ThesisSummaryLine(BaseModel):
    summary: str = Field(
        description="Exactly one sentence, max 22 words, investor thesis headline",
    )


def _api_keys_from_state(state: AgentState | None) -> dict | None:
    if not state:
        return None
    request = state.get("metadata", {}).get("request")
    if request and hasattr(request, "api_keys"):
        return request.api_keys
    return None


def summarize_investor_thesis(
    *,
    ticker: str,
    signal: str,
    confidence: float,
    reasoning: str,
    state: AgentState | None,
) -> str:
    """One-sentence thesis via OpenRouter Nemotron (free tier)."""
    snippet = (reasoning or "").strip()[:2400]
    if not snippet:
        return f"{signal.upper()} on {ticker} with {confidence:.0f}% conviction."

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You write ultra-short trading desk headlines. "
                "Return JSON only with a single summary field. "
                "One sentence, max 22 words, no quotes inside.",
            ),
            (
                "human",
                "Ticker: {ticker}\n"
                "Signal: {signal}\n"
                "Confidence: {confidence}\n"
                "Full thesis:\n{reasoning}\n\n"
                'Return: {{"summary": "..."}}',
            ),
        ]
    )
    prompt = template.invoke(
        {
            "ticker": ticker,
            "signal": signal,
            "confidence": f"{confidence:.0f}",
            "reasoning": snippet,
        }
    )

    try:
        llm = get_model(SUMMARIZER_MODEL, SUMMARIZER_PROVIDER, _api_keys_from_state(state))
        structured = llm.with_structured_output(ThesisSummaryLine, method="json_mode")
        out: ThesisSummaryLine = structured.invoke(prompt)
        text = (out.summary or "").strip()
        if text:
            return text if text.endswith(".") else f"{text}."
    except Exception as exc:
        print(f"[thesis_verdict] summarizer failed: {exc}")

    words = snippet.replace("\n", " ").split()[:14]
    return f"{signal.upper()} on {ticker}: {' '.join(words)}…"


def finish_investor_ticker(
    agent_id: str,
    ticker: str,
    signal: str,
    confidence: float | int,
    reasoning: str,
    state: AgentState,
    artifacts: list[dict[str, Any]] | None = None,
    *,
    contradicts: list[str] | None = None,
    supports: list[str] | None = None,
    time_horizon_months: int | None = None,
    price_target: float | None = None,
    current_price: float | None = None,
    subagent_progress: dict[str, Any] | None = None,
) -> str:
    """Summarize thesis and push verdict fields to the floor stream.

    `analysis` is emitted as a JSON wrapper so the frontend can carry chart
    artifacts alongside the prose thesis without changing the SSE event shape.
    """
    conf = float(confidence)
    summary = summarize_investor_thesis(
        ticker=ticker,
        signal=signal,
        confidence=conf,
        reasoning=reasoning,
        state=state,
    )
    payload: dict[str, Any] = {
        "signal": signal,
        "confidence": conf,
        "reasoning": reasoning,
        "thesis_summary": summary,
    }
    if artifacts:
        payload["artifacts"] = artifacts
    if subagent_progress:
        payload["subagents"] = subagent_progress.get("subagents")
        payload["subagent_results"] = subagent_progress.get("subagent_results")

    outlook = enrich_outlook(
        {
            k: v
            for k, v in {
                "time_horizon_months": time_horizon_months,
                "price_target": price_target,
            }.items()
            if v is not None
        },
        current_price=current_price,
    )
    payload.update(outlook)

    progress.update_status(
        agent_id,
        ticker,
        "Done",
        analysis=json.dumps(payload, default=str),
        signal=signal,
        confidence=conf,
        thesis_summary=summary,
    )
    bucket = state["data"].setdefault("analyst_signals", {}).setdefault(agent_id, {})
    entry = bucket.setdefault(ticker, {})
    if isinstance(entry, dict):
        entry["signal"] = signal
        entry["confidence"] = conf
        entry["reasoning"] = reasoning
        entry["thesis_summary"] = summary
        for key in ("time_horizon_months", "price_target", "upside_pct", "reference_price"):
            if key in outlook:
                entry[key] = outlook[key]
        if artifacts:
            entry["artifacts"] = artifacts
        if subagent_progress:
            entry["subagents"] = subagent_progress.get("subagents")
            entry["subagent_results"] = subagent_progress.get("subagent_results")

    record_ticker_claim(
        state,
        agent_id=agent_id,
        ticker=ticker,
        signal=signal,
        confidence=conf,
        text=summary,
        supports=supports,
        contradicts=contradicts,
    )
    return summary


def finish_from_signal(
    agent_id: str,
    ticker: str,
    output: Any,
    state: AgentState,
    *,
    artifacts: list[dict[str, Any]] | None = None,
    contradicts: list[str] | None = None,
    supports: list[str] | None = None,
    current_price: float | None = None,
    subagent_progress: dict[str, Any] | None = None,
) -> str:
    """Extract signal, outlook, and reasoning from a structured investor output model."""
    outlook = extract_outlook(output)
    return finish_investor_ticker(
        agent_id,
        ticker,
        str(getattr(output, "signal", "neutral")),
        float(getattr(output, "confidence", 50)),
        str(getattr(output, "reasoning", "")),
        state,
        artifacts=artifacts,
        contradicts=contradicts,
        supports=supports,
        time_horizon_months=outlook.get("time_horizon_months"),
        price_target=outlook.get("price_target"),
        current_price=current_price,
        subagent_progress=subagent_progress,
    )


def publish_debate_verdict(
    agent_id: str,
    ticker: str,
    *,
    confidence: float,
    rebuttal: str,
    state: AgentState,
) -> None:
    """Live confidence refresh while investor is in the debate chamber."""
    own = state["data"].get("analyst_signals", {}).get(agent_id, {}).get(ticker, {})
    if not isinstance(own, dict):
        own = {}
    signal: str = own.get("signal", "neutral")
    summary: str = own.get("thesis_summary") or progress.agent_status.get(agent_id, {}).get(
        "thesis_summary", ""
    )
    progress.update_status(
        agent_id,
        ticker,
        "Debate done",
        signal=signal,
        confidence=round(confidence, 1),
        thesis_summary=summary or None,
    )
