"""PersonaPack v1 schema — custom floor analysts minted from social profiles."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,48}$")
RESERVED_PREFIX = "persona_"


class PersonaIdentity(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    callsign: str = Field(..., min_length=4, max_length=6)
    desk_label: str = Field(..., min_length=1, max_length=160)
    avatar_url: str | None = None


class PersonaVoice(BaseModel):
    persona_text: str = Field(..., min_length=1, max_length=2000)
    tone_tags: list[str] = Field(default_factory=list)
    sample_quotes: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)


class PersonaInvesting(BaseModel):
    investing_style: str = Field(..., min_length=1, max_length=800)
    checklist: list[str] = Field(..., min_length=1, max_length=12)
    time_horizon_months_default: int = Field(default=6, ge=1, le=60)
    signal_bias: Literal["bullish", "bearish", "neutral"] = "neutral"
    preferred_sectors: list[str] = Field(default_factory=list)
    avoided_instruments: list[str] = Field(default_factory=list)


class PersonaMetricWeights(BaseModel):
    valuation: float = 0.15
    momentum: float = 0.25
    quality: float = 0.20
    macro_sensitivity: float = 0.25
    risk_control: float = 0.15

    @model_validator(mode="after")
    def weights_sum_to_one(self) -> PersonaMetricWeights:
        total = (
            self.valuation
            + self.momentum
            + self.quality
            + self.macro_sensitivity
            + self.risk_control
        )
        if abs(total - 1.0) > 0.05:
            raise ValueError(f"metric weights must sum to ~1.0, got {total:.3f}")
        return self


class PersonaMetrics(BaseModel):
    template: str = "generic_legendary_v1"
    weights: PersonaMetricWeights = Field(default_factory=PersonaMetricWeights)
    custom_flags: dict[str, Any] = Field(default_factory=dict)


class PersonaProvenance(BaseModel):
    source_type: Literal["x_profile", "x_archive", "text_paste"] = "text_paste"
    handle: str | None = None
    source_url: str | None = None
    archive_sha256: str | None = None
    tweet_sample_count: int = 0
    date_range: dict[str, str] | None = None
    content_hash: str | None = None


class PersonaFloor(BaseModel):
    agent_key: str
    tier: Literal["legend"] = "legend"
    room_prompt: str = ""
    accent_color: str = "#0ea5e9"


class PersonaSafety(BaseModel):
    disclaimer: str = (
        "Simulated persona for education. Not affiliated with or endorsed by the source."
    )
    impersonation_risk: Literal["low", "medium", "high"] = "low"
    moderation_labels: list[str] = Field(default_factory=list)


class PersonaPack(BaseModel):
    """Full PersonaPack v1 document."""

    schema_version: str = Field(default="https://thefloor.dev/schemas/persona-pack/v1", alias="$schema")
    id: UUID = Field(default_factory=uuid4)
    slug: str
    version: int = 1
    identity: PersonaIdentity
    voice: PersonaVoice
    investing: PersonaInvesting
    metrics: PersonaMetrics = Field(default_factory=PersonaMetrics)
    provenance: PersonaProvenance = Field(default_factory=PersonaProvenance)
    floor: PersonaFloor | None = None
    safety: PersonaSafety = Field(default_factory=PersonaSafety)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    model_config = {"populate_by_name": True}

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        slug = value.strip().lower()
        if not SLUG_PATTERN.match(slug):
            raise ValueError("slug must match ^[a-z][a-z0-9_]{2,48}$")
        return slug

    @property
    def agent_key(self) -> str:
        return f"{RESERVED_PREFIX}{self.slug}"

    @property
    def display_name(self) -> str:
        return self.identity.display_name

    @property
    def callsign(self) -> str:
        return self.identity.callsign

    @property
    def desk_label(self) -> str:
        return self.identity.desk_label

    @property
    def persona_text(self) -> str:
        return self.voice.persona_text

    @property
    def investing_style(self) -> str:
        return self.investing.investing_style

    @property
    def checklist(self) -> list[str]:
        return self.investing.checklist

    @property
    def metric_profile(self) -> PersonaMetrics:
        return self.metrics

    def ensure_floor(self) -> PersonaFloor:
        if self.floor is None:
            self.floor = PersonaFloor(agent_key=self.agent_key)
        elif not self.floor.agent_key:
            self.floor.agent_key = self.agent_key
        return self.floor

    def to_pack_body(self) -> dict[str, Any]:
        body = self.model_dump(mode="json", by_alias=True)
        body["floor"] = self.ensure_floor().model_dump(mode="json")
        return body

    @classmethod
    def from_pack_body(cls, body: dict[str, Any]) -> PersonaPack:
        return cls.model_validate(body)


def agent_key_for_slug(slug: str) -> str:
    return f"{RESERVED_PREFIX}{slug.strip().lower()}"


def slug_from_agent_key(agent_key: str) -> str | None:
    if not agent_key.startswith(RESERVED_PREFIX):
        return None
    slug = agent_key[len(RESERVED_PREFIX) :]
    return slug if SLUG_PATTERN.match(slug) else None
