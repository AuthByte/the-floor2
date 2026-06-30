"""Persona ingest job orchestrator — persists jobs and packs to Supabase when configured."""

from __future__ import annotations

import logging
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from src.utils.persona_mint import mint_from_text
from src.utils.persona_models import PersonaPack
from src.utils.persona_store import cache_pack, save_pack_to_dir

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug_from_source(source_type: str, source_ref: str) -> str:
    if source_type == "x_profile":
        handle = source_ref.rstrip("/").split("/")[-1].lstrip("@")
        return re.sub(r"[^a-z0-9_]+", "_", handle.lower()).strip("_") or "persona"
    return f"paste_{uuid.uuid4().hex[:8]}"


def _persist_job_row(job_id: str, updates: dict[str, Any]) -> None:
    try:
        from app.backend.services.persona_store_db import update_ingest_job

        update_ingest_job(job_id, updates)
    except Exception:
        logger.exception("Failed to persist ingest job %s", job_id)


def _job_from_db_row(row: dict[str, Any]) -> dict[str, Any]:
    progress = dict(row.get("progress") if isinstance(row.get("progress"), dict) else {})
    visibility = progress.pop("visibility", "private")
    display_name_override = progress.pop("display_name_override", None)
    callsign_override = progress.pop("callsign_override", None)
    preview = progress.pop("preview", None)
    return {
        "id": str(row["id"]),
        "owner_id": str(row["owner_id"]),
        "status": row["status"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "visibility": visibility,
        "display_name_override": display_name_override,
        "callsign_override": callsign_override,
        "progress": progress,
        "persona_pack_id": str(row["persona_pack_id"]) if row.get("persona_pack_id") else None,
        "preview": preview,
        "error": row.get("error"),
        "created_at": str(row.get("created_at") or _now_iso()),
        "updated_at": str(row.get("updated_at") or _now_iso()),
    }


def create_ingest_job(
    *,
    owner_id: str,
    source_type: str,
    source_ref: str,
    visibility: str = "private",
    display_name_override: str | None = None,
    callsign_override: str | None = None,
) -> dict[str, Any]:
    if source_type not in ("x_profile", "x_archive", "text_paste"):
        raise ValueError("Invalid source_type")
    if not source_ref.strip():
        raise ValueError("source_ref is required")
    if source_type == "text_paste" and len(source_ref) > 500_000:
        raise ValueError("text_paste source_ref exceeds 500k characters")

    job_id = str(uuid.uuid4())
    progress = {
        "step": "VALIDATE_SOURCE",
        "message": "Queued",
        "percent": 0,
        "visibility": visibility,
        "display_name_override": display_name_override,
        "callsign_override": callsign_override,
    }
    row = {
        "id": job_id,
        "owner_id": owner_id,
        "status": "queued",
        "source_type": source_type,
        "source_ref": source_ref,
        "visibility": visibility,
        "display_name_override": display_name_override,
        "callsign_override": callsign_override,
        "progress": progress,
        "persona_pack_id": None,
        "preview": None,
        "error": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }

    try:
        from app.backend.services.persona_store_db import create_ingest_job_row

        db_row = create_ingest_job_row(
            job_id=job_id,
            owner_id=owner_id,
            source_type=source_type,
            source_ref=source_ref,
            progress=progress,
            visibility=visibility,
        )
        if db_row:
            row["created_at"] = str(db_row.get("created_at") or row["created_at"])
            row["updated_at"] = str(db_row.get("updated_at") or row["updated_at"])
    except Exception:
        logger.exception("Failed to create ingest job in Supabase; using in-memory fallback")

    with _lock:
        _jobs[job_id] = row
    return row


def get_job(job_id: str, owner_id: str | None = None) -> dict[str, Any] | None:
    with _lock:
        row = _jobs.get(job_id)
        if row is not None:
            if owner_id and row.get("owner_id") != owner_id:
                return None
            return dict(row)

    try:
        from app.backend.services.persona_store_db import get_ingest_job_row

        db_row = get_ingest_job_row(job_id, owner_id=owner_id)
        if db_row is None:
            return None
        mapped = _job_from_db_row(db_row)
        with _lock:
            _jobs[job_id] = mapped
        return dict(mapped)
    except Exception:
        logger.exception("Failed to load ingest job %s from Supabase", job_id)
        return None


def list_jobs_for_owner(owner_id: str) -> list[dict[str, Any]]:
    with _lock:
        memory = [dict(row) for row in _jobs.values() if row.get("owner_id") == owner_id]
    return memory


def _persist_pack(
    pack: PersonaPack,
    *,
    owner_id: str,
    visibility: str,
    moderation_status: str,
) -> None:
    cache_pack(pack)
    try:
        from app.backend.services.persona_store_db import insert_persona_pack

        inserted = insert_persona_pack(
            pack,
            owner_id=owner_id,
            visibility=visibility,
            moderation_status=moderation_status,
        )
        if inserted:
            return
    except Exception:
        logger.exception("Failed to insert persona pack %s into Supabase", pack.id)

    save_pack_to_dir(pack)


def run_ingest_job(job_id: str) -> None:
    """Advance a job through digest stages (synchronous for v0 skeleton)."""
    row = get_job(job_id)
    if row is None:
        return

    digest_progress = {
        "step": "MULTI_AGENT_DIGEST",
        "message": "Synthesizing voice + philosophy…",
        "percent": 55,
        "visibility": row.get("visibility", "private"),
        "display_name_override": row.get("display_name_override"),
        "callsign_override": row.get("callsign_override"),
    }
    with _lock:
        cached = _jobs.get(job_id)
        if cached:
            cached["status"] = "digesting"
            cached["progress"] = digest_progress
            cached["updated_at"] = _now_iso()
    _persist_job_row(job_id, {"status": "digesting", "progress": digest_progress})

    source_type = row["source_type"]
    source_ref = row["source_ref"]
    visibility = row.get("visibility", "private")
    display_name_override = row.get("display_name_override")
    callsign_override = row.get("callsign_override")
    owner_id = row["owner_id"]

    try:
        slug = _slug_from_source(source_type, source_ref)

        if source_type == "text_paste":
            corpus = source_ref
        elif source_type == "x_profile":
            corpus = (
                f"Public profile @{slug}. Macro and markets commentary in short threads. "
                f"Liquidity is the tide; price is the surfboard. Rate-of-change beats levels. "
                f"Source: {source_ref}"
            )
        else:
            raise ValueError("x_archive ingest not implemented in skeleton — upload + parse in PR5")

        pack = mint_from_text(
            corpus,
            slug=slug,
            display_name=display_name_override,
            callsign=callsign_override,
            handle=slug if source_type == "x_profile" else None,
        )

        moderation = "pending" if visibility == "public" else "approved"
        preview = {
            "slug": pack.slug,
            "agent_key": pack.agent_key,
            "display_name": pack.display_name,
            "callsign": pack.callsign,
            "desk_label": pack.desk_label,
            "investing_style": pack.investing_style,
            "checklist": pack.checklist,
            "sample_quotes": pack.voice.sample_quotes,
            "room_image_url": f"/rooms/persona_{pack.slug}.png",
            "moderation_status": moderation,
            "pack_version": pack.version,
        }

        complete_progress = {
            "step": "COMPLETE",
            "message": "PersonaPack ready",
            "percent": 100,
            "preview": preview,
            "visibility": visibility,
            "display_name_override": display_name_override,
            "callsign_override": callsign_override,
        }

        _persist_pack(
            pack,
            owner_id=owner_id,
            visibility=visibility,
            moderation_status=moderation,
        )

        with _lock:
            cached = _jobs.get(job_id)
            if cached:
                cached["status"] = "complete"
                cached["persona_pack_id"] = str(pack.id)
                cached["preview"] = preview
                cached["pack"] = pack
                cached["progress"] = complete_progress
                cached["updated_at"] = _now_iso()

        _persist_job_row(
            job_id,
            {
                "status": "complete",
                "persona_pack_id": str(pack.id),
                "progress": complete_progress,
                "error": None,
            },
        )
    except Exception as exc:
        logger.exception("Ingest job %s failed", job_id)
        with _lock:
            cached = _jobs.get(job_id)
            if cached:
                cached["status"] = "failed"
                cached["error"] = str(exc)
                cached["updated_at"] = _now_iso()
        _persist_job_row(job_id, {"status": "failed", "error": str(exc)})


def job_pack(job_id: str) -> PersonaPack | None:
    with _lock:
        row = _jobs.get(job_id)
        if not row:
            return None
        pack = row.get("pack")
        return pack if isinstance(pack, PersonaPack) else None
