"""Persona pack REST API — ingest + Supabase-backed pack listing."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from app.backend.auth.deps import _bearer, require_user, user_id_from_claims
from app.backend.services.persona_ingest.orchestrator import (
    create_ingest_job,
    get_job,
    run_ingest_job,
)
from src.utils.persona_models import PersonaPack
from src.utils.persona_store import load_pack_by_slug, load_packs_by_ids, load_packs_from_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/personas")


class PersonaIngestRequest(BaseModel):
    source_type: str = Field(..., pattern="^(x_profile|x_archive|text_paste)$")
    source_ref: str = Field(..., min_length=1)
    visibility: str = Field(default="private", pattern="^(private|unlisted|public)$")
    display_name_override: str | None = None
    callsign_override: str | None = Field(default=None, min_length=4, max_length=6)


class PersonaIngestStartResponse(BaseModel):
    job_id: str
    status: str
    poll_url: str


class PersonaPackSummary(BaseModel):
    id: str
    slug: str
    agent_key: str
    display_name: str
    callsign: str
    desk_label: str
    investing_style: str
    room_image_url: str | None = None
    accent_color: str | None = None
    visibility: str = "private"
    moderation_status: str = "approved"
    pack_version: int = 1
    source: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


class PersonaListResponse(BaseModel):
    packs: list[PersonaPackSummary]


def _pack_to_summary(
    pack: PersonaPack,
    *,
    visibility: str = "private",
    moderation_status: str = "approved",
) -> PersonaPackSummary:
    floor = pack.ensure_floor()
    return PersonaPackSummary(
        id=str(pack.id),
        slug=pack.slug,
        agent_key=pack.agent_key,
        display_name=pack.display_name,
        callsign=pack.callsign,
        desk_label=pack.desk_label,
        investing_style=pack.investing_style,
        room_image_url=f"/rooms/persona_{pack.slug}.png",
        accent_color=floor.accent_color,
        visibility=visibility,
        moderation_status=moderation_status,
        pack_version=pack.version,
        source=pack.provenance.model_dump(mode="json"),
        created_at=pack.created_at.isoformat() if pack.created_at else None,
    )


def _summary_from_row(row: dict[str, Any]) -> PersonaPackSummary:
    return PersonaPackSummary(**row)


def _list_from_supabase(
    *,
    owner_id: str | None = None,
    public: bool = False,
    slug: str | None = None,
    pack_ids: list[str] | None = None,
) -> list[PersonaPackSummary] | None:
    try:
        from app.backend.services.persona_store_db import (
            db_available,
            get_persona_pack_by_slug,
            get_persona_pack_row_by_id,
            list_packs_for_owner,
            list_public_packs,
            row_to_summary,
        )
    except ImportError:
        return None

    if not db_available():
        return None

    if pack_ids:
        summaries: list[PersonaPackSummary] = []
        for pid in pack_ids:
            row = get_persona_pack_row_by_id(pid)
            if row is None:
                raise KeyError(f"Persona pack not found: {pid}")
            summaries.append(_summary_from_row(row_to_summary(row)))
        return summaries

    if slug:
        pack = get_persona_pack_by_slug(slug, owner_id=owner_id)
        if pack is None:
            return []
        row = get_persona_pack_row_by_id(str(pack.id))
        if row:
            return [_summary_from_row(row_to_summary(row))]
        return [_pack_to_summary(pack)]

    if public:
        return [_summary_from_row(row) for row in list_public_packs()]

    if owner_id:
        return [_summary_from_row(row) for row in list_packs_for_owner(owner_id)]

    return []


@router.post("/ingest", status_code=202, response_model=PersonaIngestStartResponse)
async def start_ingest(
    body: PersonaIngestRequest,
    background_tasks: BackgroundTasks,
    user_claims: dict | None = Depends(require_user),
):
    owner_id = user_id_from_claims(user_claims) or "local-dev"
    try:
        row = create_ingest_job(
            owner_id=owner_id,
            source_type=body.source_type,
            source_ref=body.source_ref,
            visibility=body.visibility,
            display_name_override=body.display_name_override,
            callsign_override=body.callsign_override,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job_id = row["id"]
    background_tasks.add_task(run_ingest_job, job_id)
    return PersonaIngestStartResponse(
        job_id=job_id,
        status="queued",
        poll_url=f"/personas/ingest/{job_id}",
    )


@router.get("/ingest/{job_id}")
async def poll_ingest(
    job_id: str,
    user_claims: dict | None = Depends(require_user),
):
    owner_id = user_id_from_claims(user_claims) or "local-dev"
    row = get_job(job_id, owner_id=owner_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": row["id"],
        "status": row["status"],
        "progress": row.get("progress") or {},
        "persona_pack_id": row.get("persona_pack_id"),
        "preview": row.get("preview"),
        "error": row.get("error"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("", response_model=PersonaListResponse)
async def list_personas(
    mine: bool = Query(default=False),
    public: bool = Query(default=False),
    slug: str | None = Query(default=None),
    ids: str | None = Query(default=None),
    user_claims: dict | None = Depends(require_user),
):
    owner_id = user_id_from_claims(user_claims)
    id_list = [s.strip() for s in ids.split(",") if s.strip()] if ids else None

    if owner_id or public or id_list or slug:
        try:
            db_summaries = _list_from_supabase(
                owner_id=owner_id if mine else None,
                public=public,
                slug=slug,
                pack_ids=id_list,
            )
            if db_summaries is not None:
                if slug and not db_summaries:
                    raise HTTPException(status_code=404, detail="Pack not found")
                return PersonaListResponse(packs=db_summaries)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except HTTPException:
            raise
        except Exception:
            logger.exception("Supabase persona list failed; falling back to local packs")

    packs = load_packs_from_dir()
    summaries: list[PersonaPackSummary] = []

    if id_list:
        try:
            selected = load_packs_by_ids(id_list)
            summaries = [_pack_to_summary(p) for p in selected]
            return PersonaListResponse(packs=summaries)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    if slug:
        pack = load_pack_by_slug(slug)
        if pack is None:
            raise HTTPException(status_code=404, detail="Pack not found")
        return PersonaListResponse(packs=[_pack_to_summary(pack)])

    if public:
        summaries = [_pack_to_summary(p, visibility="public", moderation_status="approved") for p in packs]
        return PersonaListResponse(packs=summaries)

    if mine:
        summaries = [_pack_to_summary(p) for p in packs]
        return PersonaListResponse(packs=summaries)

    return PersonaListResponse(packs=[])


@router.get("/{pack_id}")
async def get_persona_pack(
    pack_id: str,
    user_claims: dict | None = Depends(require_user),
):
    try:
        UUID(pack_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid pack id") from exc

    owner_id = user_id_from_claims(user_claims)
    try:
        from app.backend.services.persona_store_db import (
            db_available,
            get_persona_pack_row_by_id,
            row_to_pack,
            row_to_summary,
        )

        if db_available():
            row = get_persona_pack_row_by_id(pack_id)
            if row is not None:
                if owner_id and str(row.get("owner_id")) != owner_id:
                    visibility = row.get("visibility")
                    if visibility not in ("public", "unlisted"):
                        raise HTTPException(status_code=404, detail="Pack not found")
                pack = row_to_pack(row)
                summary = row_to_summary(row)
                return {"pack": {**summary, "pack_body": pack.to_pack_body()}}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase persona pack fetch failed for %s", pack_id)

    try:
        packs = load_packs_by_ids([pack_id])
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    pack = packs[0]
    return {"pack": {**_pack_to_summary(pack).model_dump(), "pack_body": pack.to_pack_body()}}
