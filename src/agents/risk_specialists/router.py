"""Route risks to specialist researchers and run structured LLM research."""

from __future__ import annotations

from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.utils.llm import call_llm
from src.utils.risk_pipeline import (
    SPECIALIST_LABELS,
    assign_specialists,
    tier0_context_snippet,
)


class SpecialistReport(BaseModel):
    probability_pct: float = Field(ge=0, le=100)
    severity: str = Field(description="low, medium, or high")
    severity_score: float = Field(ge=0, le=10)
    early_warnings: list[str] = Field(default_factory=list)
    historical_examples: list[str] = Field(default_factory=list)
    summary: str = Field(description="2-4 sentence research memo")


def route_specialists(category: str) -> list[str]:
    return assign_specialists(category)


def research_risk(
    *,
    ticker: str,
    risk: dict[str, Any],
    specialist_id: str,
    state: AgentState,
    hub_agent_id: str,
) -> dict[str, Any]:
    label = SPECIALIST_LABELS.get(specialist_id, specialist_id.replace("_", " ").title())
    tier0 = tier0_context_snippet(state, ticker)
    macro = state.get("data", {}).get("macro_context") or {}

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are the {label} risk research desk. Assess one specific risk for "
                "{ticker}. Use only provided context; be concrete. Return JSON only.",
            ),
            (
                "human",
                "Risk: {title}\n"
                "Category: {category}\n"
                "Tags: {tags}\n\n"
                "Tier-0 desk context:\n{tier0}\n\n"
                "Macro backdrop:\n{macro}\n\n"
                "Return probability (0-100), severity, severity_score (0-10), "
                "early_warnings (3 bullets), historical_examples (2), summary.",
            ),
        ]
    )

    def default() -> SpecialistReport:
        return SpecialistReport(
            probability_pct=20.0,
            severity="medium",
            severity_score=5.0,
            early_warnings=["Insufficient data for precise indicators"],
            historical_examples=["No close analog identified"],
            summary=f"{label} sees moderate uncertainty on this risk.",
        )

    prompt = template.invoke(
        {
            "label": label,
            "ticker": ticker,
            "title": risk.get("title", ""),
            "category": risk.get("category", "macro"),
            "tags": ", ".join(risk.get("tags") or []),
            "tier0": tier0 or "(no tier-0 context)",
            "macro": str(macro.get("summary", macro))[:1200],
        }
    )

    out: SpecialistReport = call_llm(
        prompt=prompt,
        pydantic_model=SpecialistReport,
        agent_name=hub_agent_id,
        state=state,
        default_factory=default,
        stream=False,
    )
    return {
        "specialist": specialist_id,
        "label": label,
        "probability_pct": float(out.probability_pct),
        "severity": out.severity,
        "severity_score": float(out.severity_score),
        "early_warnings": out.early_warnings[:5],
        "historical_examples": out.historical_examples[:3],
        "summary": out.summary,
    }
