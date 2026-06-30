"""Cron worker: fire due shift schedules."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.backend.services.schedule_service import (
    compute_next_run_at,
    get_due_schedules,
    get_last_completed_run,
    get_scheduler_prefs,
    get_shift_for_repeat,
    insert_schedule_run,
    is_floor_open_et,
    update_schedule,
    update_schedule_run,
)
from app.backend.services.shift_runner_service import (
    execute_scheduled_shift,
    notify_shift_complete,
)
from src.tools.api import get_macro_context
from src.tools.providers.keys import merge_api_keys

logger = logging.getLogger(__name__)

BUDGET_SECONDS = 50.0
MAX_PER_CYCLE = 5


def _platform_keys() -> dict[str, str]:
    key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    return merge_api_keys({"OPENROUTER_API_KEY": key}) if key else {}


def _build_briefing(schedule: dict[str, Any]) -> str | None:
    keys = _platform_keys()
    if not keys.get("OPENROUTER_API_KEY"):
        return None
    try:
        macro = get_macro_context(None, keys)
        headline = ""
        if macro.get("available"):
            headline = str(macro.get("summary", {}).get("headline") or "")
        last = get_last_completed_run(str(schedule["id"]))
        gap = ""
        if last and last.get("scheduled_for"):
            try:
                prev = datetime.fromisoformat(str(last["scheduled_for"]).replace("Z", "+00:00"))
                days = (datetime.now(timezone.utc) - prev).days
                gap = f"Last run was {days} day(s) ago."
            except (TypeError, ValueError):
                pass
        parts = [p for p in (headline, gap) if p]
        return " ".join(parts)[:400] if parts else None
    except Exception as exc:
        logger.warning("Briefing build failed: %s", exc)
        return None


def _build_delta_summary(schedule_id: str, new_payload: dict[str, Any]) -> str | None:
    last = get_last_completed_run(schedule_id)
    if not last or not last.get("shift_id"):
        return None
    try:
        from app.backend.services.schedule_service import _rest_get

        rows = _rest_get(
            "shifts",
            select="decisions",
            params={"id": f"eq.{last['shift_id']}", "limit": "1"},
        )
        if not rows:
            return None
        old_decisions = rows[0].get("decisions") or {}
        new_decisions = new_payload.get("decisions") or {}
        flips: list[str] = []
        for ticker, nd in new_decisions.items():
            od = old_decisions.get(ticker) or {}
            old_action = str(od.get("action") or od.get("signal") or "").lower()
            new_action = str(nd.get("action") or nd.get("signal") or "").lower()
            if old_action and new_action and old_action != new_action:
                flips.append(f"{ticker}: {old_action} → {new_action}")
        if flips:
            return "Verdict changes: " + "; ".join(flips[:4])
    except Exception as exc:
        logger.warning("Delta summary failed: %s", exc)
    return None


def run_schedule_cycle() -> dict[str, Any]:
    t0 = time.perf_counter()
    due = get_due_schedules(limit=MAX_PER_CYCLE)
    processed = 0
    completed = 0
    failed = 0
    skipped = 0
    errors: list[str] = []

    for schedule in due:
        if time.perf_counter() - t0 > BUDGET_SECONDS:
            break

        user_id = str(schedule["user_id"])
        schedule_id = str(schedule["id"])
        prefs = get_scheduler_prefs(user_id)
        if prefs.get("vacation_mode"):
            skipped += 1
            nxt = compute_next_run_at(schedule)
            update_schedule(user_id, schedule_id, {"next_run_at": nxt.isoformat() if nxt else None})
            continue

        scheduled_for_raw = schedule.get("next_run_at")
        try:
            scheduled_for = datetime.fromisoformat(str(scheduled_for_raw).replace("Z", "+00:00"))
            if scheduled_for.tzinfo is None:
                scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            skipped += 1
            continue

        if not is_floor_open_et(scheduled_for):
            nxt = compute_next_run_at(schedule, after=datetime.now(timezone.utc))
            update_schedule(user_id, schedule_id, {"next_run_at": nxt.isoformat() if nxt else None})
            skipped += 1
            continue

        run_row = insert_schedule_run({
            "schedule_id": schedule_id,
            "user_id": user_id,
            "scheduled_for": scheduled_for.isoformat(),
            "status": "running",
            "metadata": {},
        })
        if not run_row:
            skipped += 1
            continue

        run_id_row = str(run_row["id"])
        briefing = _build_briefing(schedule)
        processed += 1

        try:
            result = execute_scheduled_shift(schedule, scheduled_for=scheduled_for)
            delta = _build_delta_summary(schedule_id, result["complete_payload"])
            update_schedule_run(run_id_row, {
                "status": "completed",
                "duration_ms": result["duration_ms"],
                "metadata": {"run_id": result["run_id"], "briefing": briefing, "delta": delta},
            })

            from app.backend.services.schedule_service import _rest_get, _rest_patch

            shift_rows = _rest_get(
                "shifts",
                select="id",
                params={"user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": "1"},
            )
            if shift_rows:
                _rest_patch(
                    "shift_schedule_runs",
                    {"id": f"eq.{run_id_row}"},
                    {"shift_id": shift_rows[0]["id"]},
                )

            notify_shift_complete(
                user_id=user_id,
                schedule=schedule,
                run_id=result["run_id"],
                delta_summary=delta,
                briefing=briefing,
            )

            nxt = compute_next_run_at(schedule, after=scheduled_for)
            update_schedule(user_id, schedule_id, {
                "last_run_at": datetime.now(timezone.utc).isoformat(),
                "next_run_at": nxt.isoformat() if nxt else None,
                "enabled": bool(nxt) or str(schedule.get("recurrence")) != "once",
            })
            completed += 1
        except Exception as exc:
            logger.exception("Scheduled shift failed for %s", schedule_id)
            failed += 1
            errors.append(f"{schedule_id}: {exc}")
            update_schedule_run(run_id_row, {
                "status": "failed",
                "error": str(exc)[:500],
            })
            from app.backend.services.schedule_service import insert_notification

            insert_notification({
                "user_id": user_id,
                "kind": "scheduled_shift_failed",
                "body": f"Scheduled shift failed: {exc}",
                "metadata": {"schedule_id": schedule_id},
            })

            retry_at = scheduled_for + timedelta(minutes=15)
            meta = run_row.get("metadata") or {}
            if not meta.get("retried"):
                insert_schedule_run({
                    "schedule_id": schedule_id,
                    "user_id": user_id,
                    "scheduled_for": retry_at.isoformat(),
                    "status": "pending",
                    "metadata": {"retried": True},
                    "retry_of": run_id_row,
                })
                update_schedule(user_id, schedule_id, {"next_run_at": retry_at.isoformat()})
            else:
                nxt = compute_next_run_at(schedule, after=datetime.now(timezone.utc))
                update_schedule(user_id, schedule_id, {"next_run_at": nxt.isoformat() if nxt else None})

    return {
        "due": len(due),
        "processed": processed,
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
        "errors": errors,
        "duration_ms": int((time.perf_counter() - t0) * 1000),
    }
