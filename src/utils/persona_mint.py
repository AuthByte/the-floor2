"""Local PersonaPack minting helpers (v0 text-paste stub)."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone

from src.utils.persona_models import (
    PersonaFloor,
    PersonaIdentity,
    PersonaInvesting,
    PersonaMetrics,
    PersonaPack,
    PersonaProvenance,
    PersonaSafety,
    PersonaVoice,
    SLUG_PATTERN,
)


def slugify_persona(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")
    if not slug or not SLUG_PATTERN.match(slug):
        slug = "persona_" + hashlib.sha256(value.encode()).hexdigest()[:8]
    return slug


def callsign_from_slug(slug: str) -> str:
    parts = [p for p in slug.split("_") if p]
    if len(parts) >= 2:
        return (parts[0][:3] + parts[1][:3]).upper()[:6]
    return slug[:6].upper().ljust(4, "X")[:6]


def display_from_slug(slug: str) -> str:
    return " ".join(word.capitalize() for word in slug.split("_"))


def mint_from_text(
    text: str,
    *,
    slug: str | None = None,
    display_name: str | None = None,
    callsign: str | None = None,
    handle: str | None = None,
) -> PersonaPack:
    corpus = text.strip()
    if len(corpus) < 80:
        raise ValueError("Corpus too short — provide at least 80 characters of source text")

    derived_slug = slug or slugify_persona(handle or corpus[:40])
    lines = [ln.strip() for ln in corpus.splitlines() if ln.strip()]
    sample_quotes = [ln for ln in lines if 20 <= len(ln) <= 200][:3]
    if not sample_quotes:
        sample_quotes = [lines[0][:200]]

    return PersonaPack(
        id=uuid.uuid4(),
        slug=derived_slug,
        identity=PersonaIdentity(
            display_name=display_name or display_from_slug(derived_slug),
            callsign=(callsign or callsign_from_slug(derived_slug))[:6],
            desk_label="custom persona desk",
        ),
        voice=PersonaVoice(
            persona_text=corpus[:2000],
            tone_tags=["custom"],
            sample_quotes=sample_quotes,
        ),
        investing=PersonaInvesting(
            investing_style="Style distilled from uploaded corpus — macro/micro mix inferred locally.",
            checklist=[
                "Regime and liquidity context",
                "Cross-asset confirmation",
                "Positioning and crowding",
                "Valuation as filter not anchor",
                "Explicit invalidation",
            ],
        ),
        metrics=PersonaMetrics(),
        provenance=PersonaProvenance(
            source_type="text_paste",
            handle=handle,
            tweet_sample_count=max(1, len(lines)),
            content_hash="sha256:" + hashlib.sha256(corpus.encode()).hexdigest(),
        ),
        floor=PersonaFloor(
            agent_key=f"persona_{derived_slug}",
            room_prompt=f"Pixel-art trading desk themed for {derived_slug.replace('_', ' ')}",
            accent_color="#0ea5e9",
        ),
        safety=PersonaSafety(),
        created_at=datetime.now(timezone.utc),
    )
