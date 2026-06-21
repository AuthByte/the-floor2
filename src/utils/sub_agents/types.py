"""Shared types for parent-agent sub-agent delegation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from pydantic import BaseModel, Field


class SubAgentBrief(BaseModel):
    """Structured output every sub-agent must return."""

    summary: str = Field(description="2-4 sentence focused memo")
    key_findings: list[str] = Field(
        default_factory=list,
        description="3-5 bullet findings grounded in provided context",
    )
    confidence: float = Field(ge=0, le=100, description="Confidence in this sub-task conclusion")
    data_gaps: list[str] = Field(
        default_factory=list,
        description="What data was missing or uncertain",
    )


class SubAgentPick(BaseModel):
    """Planner selection — which sub-agent to run and what to focus on."""

    id: str
    task_focus: str = Field(description="One sentence describing the delegated sub-task")


class SubAgentPlan(BaseModel):
    tasks: list[SubAgentPick] = Field(default_factory=list)


@dataclass(frozen=True)
class SubAgentSpec:
    """Registered sub-agent task type a parent can delegate."""

    id: str
    label: str
    description: str
    system_prompt: str
    build_context: Callable[[dict[str, Any]], str] | None = None


@dataclass
class SubAgentStatus:
    id: str
    label: str
    task: str
    status: str = "queued"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "task": self.task,
            "status": self.status,
        }


@dataclass
class SubAgentResult:
    id: str
    label: str
    task: str
    summary: str
    key_findings: list[str] = field(default_factory=list)
    confidence: float = 50.0
    data_gaps: list[str] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "task": self.task,
            "summary": self.summary,
            "key_findings": self.key_findings,
            "confidence": self.confidence,
            "data_gaps": self.data_gaps,
        }
        if self.error:
            out["error"] = self.error
        return out
