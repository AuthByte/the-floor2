"""Supabase CRUD for persona_packs and persona_ingest_jobs (service role)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from app.backend.services.supabase_client import get_supabase
from src.utils.persona_models import PersonaPack, agent_key_for_slug

logger = logging.getLogger(__name__)

_PERSONA_PACKS = "persona_packs"
_INGEST_JOBS = "persona_ingest_jobs"

_PACK_COLUMNS = (
    "id,slug,owner_id,display_name,callsign,desk_label,persona_text,investing_style,"
    "checklist,metric_profile,source,pack_version,pack_body,room_image_url,accent_color,"
    "sprite_sheet_url,visibility,moderation_status,moderation_notes,created_at,updated_at"
)

_JOB_COLUMNS = (
    "id,owner_id,status,source_type,source_ref,progress,persona_pack_id,error,created_at,updated_at"
)


def db_available() -> bool:
    sb = get_supabase()
    return sb.configured and bool(sb.service_key)


def _sb():
    sb = get_supabase()
    if not db_available():
        raise RuntimeError("Supabase service role is not configured")
    return sb


def _rest_get(
    table: str,
    *,
    select: str,
    params: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    sb = _sb()
    query = {"select": select, **(params or {})}
    with httpx.Client(timeout=30.0) as client:
        res = client.get(
            f"{sb.url}/rest/v1/{table}",
            headers=sb._service_headers(),
            params=query,
        )
        if res.status_code >= 400:
            logger.warning("Supabase GET %s failed: %s %s", table, res.status_code, res.text)
            return []
        data = res.json()
        return data if isinstance(data, list) else []


def _rest_insert(table: str, row: dict[str, Any], *, on_conflict: str | None = None) -> dict[str, Any] | None:
    sb = _sb()
    headers = {**sb._service_headers(), "Prefer": "return=representation"}
    params: dict[str, str] = {}
    if on_conflict:
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"
        params["on_conflict"] = on_conflict
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            f"{sb.url}/rest/v1/{table}",
            headers=headers,
            params=params,
            json=row,
        )
        if res.status_code >= 400:
            logger.warning("Supabase INSERT %s failed: %s %s", table, res.status_code, res.text)
            return None
        data = res.json()
        if isinstance(data, list) and data:
            return data[0]
        return data if isinstance(data, dict) else None


def _rest_patch(table: str, filters: dict[str, str], updates: dict[str, Any]) -> dict[str, Any] | None:
    sb = _sb()
    params = {**filters, "select": _PACK_COLUMNS if table == _PERSONA_PACKS else _JOB_COLUMNS}
    with httpx.Client(timeout=30.0) as client:
        res = client.patch(
            f"{sb.url}/rest/v1/{table}",
            headers={**sb._service_headers(), "Prefer": "return=representation"},
            params=params,
            json=updates,
        )
        if res.status_code >= 400:
            logger.warning("Supabase PATCH %s failed: %s %s", table, res.status_code, res.text)
            return None
        data = res.json()
        if isinstance(data, list) and data:
            return data[0]
        return data if isinstance(data, dict) else None


def _rest_delete(table: str, filters: dict[str, str]) -> bool:
    sb = _sb()
    with httpx.Client(timeout=30.0) as client:
        res = client.delete(
            f"{sb.url}/rest/v1/{table}",
            headers=sb._service_headers(),
            params=filters,
        )
        if res.status_code >= 400:
            logger.warning("Supabase DELETE %s failed: %s %s", table, res.status_code, res.text)
            return False
        return True


def pack_to_row(
    pack: PersonaPack,
    *,
    owner_id: str,
    visibility: str = "private",
    moderation_status: str = "approved",
    room_image_url: str | None = None,
) -> dict[str, Any]:
    floor = pack.ensure_floor()
    return {
        "id": str(pack.id),
        "slug": pack.slug,
        "owner_id": owner_id,
        "display_name": pack.display_name,
        "callsign": pack.callsign,
        "desk_label": pack.desk_label,
        "persona_text": pack.persona_text,
        "investing_style": pack.investing_style,
        "checklist": pack.checklist,
        "metric_profile": pack.metrics.model_dump(mode="json"),
        "source": pack.provenance.model_dump(mode="json"),
        "pack_version": pack.version,
        "pack_body": pack.to_pack_body(),
        "room_image_url": room_image_url or f"/rooms/persona_{pack.slug}.png",
        "accent_color": floor.accent_color,
        "visibility": visibility,
        "moderation_status": moderation_status,
    }


def row_to_pack(row: dict[str, Any]) -> PersonaPack:
    body = row.get("pack_body")
    if isinstance(body, dict) and body.get("slug"):
        pack = PersonaPack.from_pack_body(body)
        pack.id = UUID(str(row["id"]))
        return pack
    raise ValueError(f"persona_packs row {row.get('id')} missing pack_body")


def row_to_summary(row: dict[str, Any]) -> dict[str, Any]:
    slug = str(row["slug"])
    created = row.get("created_at")
    source = row.get("source")
    return {
        "id": str(row["id"]),
        "slug": slug,
        "agent_key": agent_key_for_slug(slug),
        "display_name": row["display_name"],
        "callsign": row["callsign"],
        "desk_label": row["desk_label"],
        "investing_style": row["investing_style"],
        "room_image_url": row.get("room_image_url"),
        "accent_color": row.get("accent_color"),
        "visibility": row.get("visibility") or "private",
        "moderation_status": row.get("moderation_status") or "approved",
        "pack_version": int(row.get("pack_version") or 1),
        "source": source if isinstance(source, dict) else {},
        "created_at": str(created) if created else None,
    }


def insert_persona_pack(
    pack: PersonaPack,
    *,
    owner_id: str,
    visibility: str = "private",
    moderation_status: str = "approved",
) -> dict[str, Any] | None:
    if not db_available():
        return None
    row = pack_to_row(pack, owner_id=owner_id, visibility=visibility, moderation_status=moderation_status)
    return _rest_insert(_PERSONA_PACKS, row)


def get_persona_pack_by_id(pack_id: str) -> PersonaPack | None:
    if not db_available():
        return None
    rows = _rest_get(_PERSONA_PACKS, select=_PACK_COLUMNS, params={"id": f"eq.{pack_id}"})
    if not rows:
        return None
    try:
        return row_to_pack(rows[0])
    except ValueError:
        logger.exception("Invalid pack row for id %s", pack_id)
        return None


def get_persona_pack_row_by_id(pack_id: str) -> dict[str, Any] | None:
    if not db_available():
        return None
    rows = _rest_get(_PERSONA_PACKS, select=_PACK_COLUMNS, params={"id": f"eq.{pack_id}"})
    return rows[0] if rows else None


def get_persona_pack_by_slug(slug: str, *, owner_id: str | None = None) -> PersonaPack | None:
    if not db_available():
        return None
    params: dict[str, str] = {"slug": f"eq.{slug.strip().lower()}"}
    if owner_id:
        params["owner_id"] = f"eq.{owner_id}"
    rows = _rest_get(_PERSONA_PACKS, select=_PACK_COLUMNS, params=params)
    if not rows:
        return None
    try:
        return row_to_pack(rows[0])
    except ValueError:
        return None


def list_packs_for_owner(owner_id: str) -> list[dict[str, Any]]:
    if not db_available():
        return []
    rows = _rest_get(
        _PERSONA_PACKS,
        select=_PACK_COLUMNS,
        params={
            "owner_id": f"eq.{owner_id}",
            "order": "updated_at.desc",
        },
    )
    return [row_to_summary(row) for row in rows]


def list_public_packs() -> list[dict[str, Any]]:
    if not db_available():
        return []
    rows = _rest_get(
        _PERSONA_PACKS,
        select=_PACK_COLUMNS,
        params={
            "visibility": "eq.public",
            "moderation_status": "eq.approved",
            "order": "created_at.desc",
        },
    )
    return [row_to_summary(row) for row in rows]


def load_packs_by_ids(pack_ids: list[str]) -> list[PersonaPack]:
    if not pack_ids or not db_available():
        return []
    wanted = [str(pid).strip() for pid in pack_ids if str(pid).strip()]
    if not wanted:
        return []
    id_filter = ",".join(wanted)
    rows = _rest_get(_PERSONA_PACKS, select=_PACK_COLUMNS, params={"id": f"in.({id_filter})"})
    by_id: dict[str, PersonaPack] = {}
    for row in rows:
        try:
            by_id[str(row["id"])] = row_to_pack(row)
        except ValueError:
            logger.exception("Skipping invalid pack row %s", row.get("id"))
    missing = set(wanted) - set(by_id)
    if missing:
        raise KeyError(f"Persona pack(s) not found: {', '.join(sorted(missing))}")
    return [by_id[pid] for pid in wanted if pid in by_id]


def delete_persona_pack(pack_id: str, *, owner_id: str) -> bool:
    if not db_available():
        return False
    return _rest_delete(
        _PERSONA_PACKS,
        {"id": f"eq.{pack_id}", "owner_id": f"eq.{owner_id}"},
    )


def create_ingest_job_row(
    *,
    job_id: str,
    owner_id: str,
    source_type: str,
    source_ref: str,
    progress: dict[str, Any],
    visibility: str = "private",
) -> dict[str, Any] | None:
    if not db_available():
        return None
    row = {
        "id": job_id,
        "owner_id": owner_id,
        "status": "queued",
        "source_type": source_type,
        "source_ref": source_ref,
        "progress": {**progress, "visibility": visibility},
    }
    return _rest_insert(_INGEST_JOBS, row)


def get_ingest_job_row(job_id: str, *, owner_id: str | None = None) -> dict[str, Any] | None:
    if not db_available():
        return None
    params: dict[str, str] = {"id": f"eq.{job_id}"}
    if owner_id:
        params["owner_id"] = f"eq.{owner_id}"
    rows = _rest_get(_INGEST_JOBS, select=_JOB_COLUMNS, params=params)
    return rows[0] if rows else None


def update_ingest_job(job_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    if not db_available():
        return None
    return _rest_patch(_INGEST_JOBS, {"id": f"eq.{job_id}"}, updates)
