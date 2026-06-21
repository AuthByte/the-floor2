"""Pydantic models for supply chain graph artifacts."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChainNode(BaseModel):
    id: str = Field(description="Unique slug id")
    label: str = Field(description="Company or entity name")
    role: str = Field(description="focal|supplier|customer|material|geography|competitor")
    tier: int = Field(description="-3 to +3; 0 is focal company")
    region: str | None = Field(default=None, description="Geography if relevant")
    risk_note: str | None = Field(default=None, description="Single-line risk or concentration note")


class ChainEdge(BaseModel):
    source: str = Field(description="Node id")
    target: str = Field(description="Node id")
    relationship: str = Field(description="supplies|depends_on|distributes|competes|owns")
    criticality: str = Field(default="medium", description="low|medium|high")


class SupplyChainGraphModel(BaseModel):
    title: str
    caption: str
    focal_ticker: str
    nodes: list[ChainNode] = Field(min_length=3, max_length=28)
    edges: list[ChainEdge] = Field(min_length=2, max_length=40)
    concentration_risks: list[str] = Field(default_factory=list, max_length=8)
