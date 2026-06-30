"""Unit tests for Supabase persona pack row mapping."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from app.backend.services.persona_store_db import (
    pack_to_row,
    row_to_pack,
    row_to_summary,
)
from src.utils.persona_store import load_pack_from_json


@pytest.fixture
def sample_pack():
    path = Path(__file__).resolve().parents[1] / "data" / "persona_packs" / "macro_surfing.json"
    return load_pack_from_json(path)


def test_pack_to_row_round_trip(sample_pack):
    owner_id = "11111111-1111-1111-1111-111111111111"
    row = pack_to_row(sample_pack, owner_id=owner_id, visibility="private", moderation_status="approved")
    assert row["slug"] == sample_pack.slug
    assert row["owner_id"] == owner_id
    assert row["pack_body"]["slug"] == sample_pack.slug
    restored = row_to_pack(row)
    assert restored.slug == sample_pack.slug
    assert restored.agent_key == sample_pack.agent_key


def test_row_to_summary(sample_pack):
    row = pack_to_row(sample_pack, owner_id="11111111-1111-1111-1111-111111111111")
    summary = row_to_summary(row)
    assert summary["agent_key"] == sample_pack.agent_key
    assert summary["display_name"] == sample_pack.display_name
    assert summary["visibility"] == "private"


def test_load_packs_by_ids_from_db(sample_pack):
    mock_row = pack_to_row(sample_pack, owner_id="11111111-1111-1111-1111-111111111111")
    mock_row["id"] = str(sample_pack.id)

    with patch("app.backend.services.persona_store_db.db_available", return_value=True), patch(
        "app.backend.services.persona_store_db._rest_get", return_value=[mock_row]
    ):
        from app.backend.services.persona_store_db import load_packs_by_ids

        packs = load_packs_by_ids([str(sample_pack.id)])
        assert len(packs) == 1
        assert packs[0].slug == sample_pack.slug


def test_create_ingest_job_writes_supabase():
    with patch("app.backend.services.persona_store_db.create_ingest_job_row") as create_row:
        create_row.return_value = {"id": "job-1", "created_at": "2026-01-01T00:00:00Z"}
        from app.backend.services.persona_ingest.orchestrator import create_ingest_job

        row = create_ingest_job(
            owner_id="user-1",
            source_type="text_paste",
            source_ref="x" * 80,
            visibility="private",
        )
        assert row["status"] == "queued"
        create_row.assert_called_once()


def test_run_ingest_job_persists_pack(sample_pack):
    from app.backend.services.persona_ingest import orchestrator

    job_id = "job-test-1"
    orchestrator._jobs[job_id] = {
        "id": job_id,
        "owner_id": "user-1",
        "status": "queued",
        "source_type": "text_paste",
        "source_ref": "Liquidity is the tide. " * 10,
        "visibility": "private",
        "display_name_override": None,
        "callsign_override": None,
        "progress": {},
        "persona_pack_id": None,
        "preview": None,
        "error": None,
        "created_at": orchestrator._now_iso(),
        "updated_at": orchestrator._now_iso(),
    }

    with patch.object(orchestrator, "_persist_pack") as persist_pack, patch.object(
        orchestrator, "_persist_job_row"
    ) as persist_job:
        orchestrator.run_ingest_job(job_id)
        persist_pack.assert_called_once()
        persist_job.assert_called()
        row = orchestrator.get_job(job_id)
        assert row is not None
        assert row["status"] == "complete"
        assert row["persona_pack_id"]
        assert row["preview"]["agent_key"].startswith("persona_")
