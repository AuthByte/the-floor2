"""Nemotron summaries and winner picks for argument-room rounds."""

from __future__ import annotations

from typing import Literal

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.llm.models import ModelProvider, get_model
from src.utils.thesis_verdict import SUMMARIZER_MODEL, SUMMARIZER_PROVIDER, _api_keys_from_state


class DebateRoundVerdict(BaseModel):
    winner: Literal["left", "right", "draw"] = Field(
        description="left = first debater listed, right = second",
    )
    summary: str = Field(description="One sentence: who won and why, max 28 words")
    recap: str = Field(description="2-3 sentences on how confidence shifted")


def judge_debate_round(
    *,
    ticker: str,
    left_name: str,
    left_signal: str,
    left_conf_before: float,
    left_conf_after: float,
    left_lines: str,
    right_name: str,
    right_signal: str,
    right_conf_before: float,
    right_conf_after: float,
    right_lines: str,
    state: AgentState,
) -> DebateRoundVerdict:
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You judge an investment committee head-to-head debate. "
                "Winner held their thesis better with stronger reasoning and smaller confidence loss. "
                "Return JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\n\n"
                "LEFT — {left_name} ({left_signal}): {left_conf_before}% → {left_conf_after}%\n"
                "{left_lines}\n\n"
                "RIGHT — {right_name} ({right_signal}): {right_conf_before}% → {right_conf_after}%\n"
                "{right_lines}\n\n"
                'Return: {{"winner": "left"|"right"|"draw", "summary": "...", "recap": "..."}}',
            ),
        ]
    )
    prompt = template.invoke(
        {
            "ticker": ticker,
            "left_name": left_name,
            "left_signal": left_signal,
            "left_conf_before": int(left_conf_before),
            "left_conf_after": int(left_conf_after),
            "left_lines": left_lines[:2000],
            "right_name": right_name,
            "right_signal": right_signal,
            "right_conf_before": int(right_conf_before),
            "right_conf_after": int(right_conf_after),
            "right_lines": right_lines[:2000],
        }
    )

    try:
        llm = get_model(SUMMARIZER_MODEL, SUMMARIZER_PROVIDER, _api_keys_from_state(state))
        structured = llm.with_structured_output(DebateRoundVerdict, method="json_mode")
        return structured.invoke(prompt)
    except Exception as exc:
        print(f"[debate_judge] failed: {exc}")
        left_drop = left_conf_before - left_conf_after
        right_drop = right_conf_before - right_conf_after
        if left_drop < right_drop - 2:
            winner = "left"
        elif right_drop < left_drop - 2:
            winner = "right"
        else:
            winner = "draw"
        return DebateRoundVerdict(
            winner=winner,
            summary=f"{ticker}: {left_name} vs {right_name} — committee split after rebuttals.",
            recap="Automated tie-break from confidence erosion.",
        )
