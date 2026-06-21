"""Typed records for agent visualization artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class ChartSpec:
    """A registered, deterministic chart builder.

    `builder` is a pure function that takes a context dict and returns a
    matplotlib Figure. The LLM planner can only choose ids in the catalog —
    it never executes arbitrary code.
    """

    id: str
    label: str
    description: str
    agent_ids: tuple[str, ...]
    builder: Callable[[dict[str, Any]], Any]
    min_data: Callable[[dict[str, Any]], bool] = lambda _ctx: True


class ChartPick(BaseModel):
    id: str = Field(description="Chart id from the offered catalog")
    title: str = Field(description="Short, human-readable title")
    caption: str = Field(description="One-sentence reason this chart matters")


class ChartPlan(BaseModel):
    charts: list[ChartPick] = Field(default_factory=list)


class CustomChartDraft(BaseModel):
    title: str = Field(description="Short chart title, max 10 words")
    caption: str = Field(description="One sentence explaining why this chart matters")
    code: str = Field(
        description=(
            "Python matplotlib code using injected helpers. Must assign a Figure to `fig`. "
            "Use new_figure(), style_chart_title(), ctx, prices_df, metrics_df, line_items_df, "
            "plt, np, pd, and theme colors (PHOS, BRASS, SIREN, etc.). No file or network IO."
        )
    )


class ArtifactMeta(BaseModel):
    id: str
    title: str
    caption: str
    url: str
    width: int = 1296
    height: int = 734
