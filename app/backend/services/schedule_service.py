"""Shift schedule CRUD, next-run computation, and cron helpers."""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx

from app.backend.services.supabase_client import get_supabase
from src.utils.ticker_resolve import MAX_SHIFT_TICKERS, normalize_ticker_list

logger = logging.getLogger(__name__)

Recurrence = Literal["daily", "weekly", "once"]

FLOOR_OPEN_HOUR_ET = 7
FLOOR_CLOSE_HOUR_ET = 18
DEFAULT_TIMEZONE = "America/New_York"
MAX_ACTIVE_SCHEDULES = 5

_SCHEDULE_COLUMNS = (
    "id,user_id,label,tickers,ticker_query,enabled,timezone,recurrence,time_local,"
    "days_of_week,run_once_at,enabled_agent_keys,watchlist_id,source_shift_id,"
    "template_key,auto_publish,notify_email,initial_cash,run_risk_pipeline,"
    "model_name,next_run_at,last_run_at,created_at,updated_at"
)

_TEMPLATE_PRESETS: dict[str, dict[str, Any]] = {
    "market_open": {"label": "Opening Bell Desk", "time_local": "09:30:00", "recurrence": "weekly"},
    "midday_pulse": {"label": "Midday Pulse", "time_local": "12:00:00", "recurrence": "daily"},
    "pre_close": {"label": "Pre-close Memo", "time_local": "15:45:00", "recurrence": "daily"},
}

# US market holidays (NYSE full closures) — extend annually.
US_MARKET_HOLIDAYS: frozenset[date] = frozenset({
    date(2025, 1, 1),
    date(2025, 1, 20),
    date(2025, 2, 17),
    date(2025, 4, 18),
    date(2025, 5, 26),
    date(2025, 6, 19),
    date(2025, 7, 4),
    date(2025, 9, 1),
    date(2025, 11, 27),
    date(2025, 12, 25),
    date(2026, 1, 1),
    date(2026, 1, 19),
    date(2026, 2, 16),
    date(2026, 4, 3),
    date(2026, 5, 25),
    date(2026, 6, 19),
    date(2026, 7, 3),
    date(2026, 9, 7),
    date(2026, 11, 26),
    date(2026, 12, 25),
})

# In-memory fallback when Supabase unavailable.
_mem_schedules: dict[str, list[dict[str, Any]]] = {}
_mem_conversations: dict[str, dict[str, Any]] = {}
_mem_runs: list[dict[str, Any]] = []


def db_available() -> bool:
    sb = get_supabase()
    return sb.configured and bool(sb.service_key)


def _sb():
    sb = get_supabase()
    if not db_available():
        raise RuntimeError("Supabase service role is not configured")
    return sb


def _rest_get(table: str, *, select: str, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
    if not db_available():
        return []
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


def _rest_insert(table: str, row: dict[str, Any]) -> dict[str, Any] | None:
    if not db_available():
        return row
    sb = _sb()
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            f"{sb.url}/rest/v1/{table}",
            headers={**sb._service_headers(), "Prefer": "return=representation"},
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
    if not db_available():
        return updates
    sb = _sb()
    params = {**filters, "select": _SCHEDULE_COLUMNS if table == "shift_schedules" else "*"}
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
    if not db_available():
        return True
    sb = _sb()
    with httpx.Client(timeout=30.0) as client:
        res = client.delete(
            f"{sb.url}/rest/v1/{table}",
            headers=sb._service_headers(),
            params=filters,
        )
        return res.status_code < 400


def _parse_time_local(raw: Any) -> dt_time:
    if isinstance(raw, dt_time):
        return raw
    text = str(raw or "09:30:00")
    parts = text.split(":")
    h = int(parts[0]) if parts else 9
    m = int(parts[1]) if len(parts) > 1 else 30
    s = int(parts[2].split(".")[0]) if len(parts) > 2 else 0
    return dt_time(h, m, s)


def is_market_holiday(d: date) -> bool:
    return d in US_MARKET_HOLIDAYS


def is_floor_open_et(when: datetime) -> bool:
    et = when.astimezone(ZoneInfo("America/New_York"))
    if is_market_holiday(et.date()):
        return False
    if et.weekday() >= 5:
        return False
    mins = et.hour * 60 + et.minute
    return FLOOR_OPEN_HOUR_ET * 60 <= mins < FLOOR_CLOSE_HOUR_ET * 60


def get_scheduler_prefs(user_id: str) -> dict[str, Any]:
    rows = _rest_get(
        "user_settings",
        select="settings",
        params={"user_id": f"eq.{user_id}", "limit": "1"},
    )
    if rows:
        settings = rows[0].get("settings") or {}
        sched = settings.get("scheduler") or {}
        return {
            "timezone": sched.get("timezone") or DEFAULT_TIMEZONE,
            "vacation_mode": bool(sched.get("vacation_mode")),
            "max_active_schedules": int(sched.get("max_active_schedules") or MAX_ACTIVE_SCHEDULES),
        }
    return {
        "timezone": DEFAULT_TIMEZONE,
        "vacation_mode": False,
        "max_active_schedules": MAX_ACTIVE_SCHEDULES,
    }


def set_scheduler_prefs(user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    current = get_scheduler_prefs(user_id)
    merged = {**current, **updates}
    if not db_available():
        return merged
    rows = _rest_get(
        "user_settings",
        select="settings",
        params={"user_id": f"eq.{user_id}", "limit": "1"},
    )
    settings = (rows[0].get("settings") if rows else {}) or {}
    if not isinstance(settings, dict):
        settings = {}
    settings["scheduler"] = merged
    sb = _sb()
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            f"{sb.url}/rest/v1/user_settings",
            headers={
                **sb._service_headers(),
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            params={"on_conflict": "user_id"},
            json={
                "user_id": user_id,
                "settings": settings,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        if res.status_code >= 400:
            _rest_patch("user_settings", {"user_id": f"eq.{user_id}"}, {"settings": settings})
    return merged


def _slot_in_floor_hours(local_dt: datetime) -> bool:
    et = local_dt.astimezone(ZoneInfo("America/New_York"))
    if is_market_holiday(et.date()):
        return False
    if et.weekday() >= 5:
        return False
    mins = et.hour * 60 + et.minute
    return FLOOR_OPEN_HOUR_ET * 60 <= mins < FLOOR_CLOSE_HOUR_ET * 60


def compute_next_run_at(
    schedule: dict[str, Any],
    *,
    after: datetime | None = None,
) -> datetime | None:
    """Return next UTC fire time, or None for exhausted one-off schedules."""
    if not schedule.get("enabled", True):
        return None

    recurrence = str(schedule.get("recurrence") or "daily")
    tz_name = str(schedule.get("timezone") or DEFAULT_TIMEZONE)
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo(DEFAULT_TIMEZONE)

    time_local = _parse_time_local(schedule.get("time_local"))

    if recurrence == "once":
        run_once = schedule.get("run_once_at")
        if not run_once:
            return None
        try:
            once_dt = datetime.fromisoformat(str(run_once).replace("Z", "+00:00"))
            if once_dt.tzinfo is None:
                once_dt = once_dt.replace(tzinfo=timezone.utc)
            if once_dt <= (after or datetime.now(timezone.utc)):
                return None
            return once_dt.astimezone(timezone.utc)
        except (TypeError, ValueError):
            return None

    start = (after or datetime.now(timezone.utc)).astimezone(tz) + timedelta(minutes=1)
    days_of_week = schedule.get("days_of_week")
    if recurrence == "weekly" and days_of_week:
        allowed = {int(d) for d in days_of_week}
    else:
        allowed = set(range(5))  # Mon–Fri for daily

    for _ in range(366):
        candidate = start.replace(
            hour=time_local.hour,
            minute=time_local.minute,
            second=0,
            microsecond=0,
        )
        if candidate <= start:
            candidate += timedelta(days=1)
            candidate = candidate.replace(
                hour=time_local.hour,
                minute=time_local.minute,
                second=0,
                microsecond=0,
            )
        if recurrence == "weekly":
            while candidate.weekday() not in allowed:
                candidate += timedelta(days=1)
        else:
            while candidate.weekday() >= 5:
                candidate += timedelta(days=1)

        if _slot_in_floor_hours(candidate):
            return candidate.astimezone(timezone.utc)
        start = candidate + timedelta(days=1)

    return None


def preview_schedule_times(schedule: dict[str, Any], count: int = 3) -> list[str]:
    times: list[str] = []
    after: datetime | None = None
    draft = dict(schedule)
    for _ in range(count):
        nxt = compute_next_run_at(draft, after=after)
        if not nxt:
            break
        times.append(nxt.isoformat())
        after = nxt
        if str(draft.get("recurrence")) == "once":
            break
    return times


def list_schedules(user_id: str, *, enabled_only: bool = False) -> list[dict[str, Any]]:
    if not db_available():
        rows = _mem_schedules.get(user_id, [])
        if enabled_only:
            rows = [r for r in rows if r.get("enabled")]
        return rows

    params: dict[str, str] = {
        "user_id": f"eq.{user_id}",
        "order": "next_run_at.asc.nullslast",
    }
    if enabled_only:
        params["enabled"] = "eq.true"
    return _rest_get("shift_schedules", select=_SCHEDULE_COLUMNS, params=params)


def count_active_schedules(user_id: str) -> int:
    return len([s for s in list_schedules(user_id, enabled_only=True)])


def get_schedule(user_id: str, schedule_id: str) -> dict[str, Any] | None:
    rows = _rest_get(
        "shift_schedules",
        select=_SCHEDULE_COLUMNS,
        params={"id": f"eq.{schedule_id}", "user_id": f"eq.{user_id}", "limit": "1"},
    )
    if rows:
        return rows[0]
    for s in _mem_schedules.get(user_id, []):
        if s.get("id") == schedule_id:
            return s
    return None


def list_watchlists(user_id: str) -> list[dict[str, Any]]:
    return _rest_get(
        "watchlists",
        select="id,label,tickers,hint,sort_order",
        params={"user_id": f"eq.{user_id}", "order": "sort_order.asc"},
    )


def resolve_schedule_tickers(schedule: dict[str, Any], user_id: str) -> list[str]:
    watchlist_id = schedule.get("watchlist_id")
    if watchlist_id:
        rows = _rest_get(
            "watchlists",
            select="tickers",
            params={"id": f"eq.{watchlist_id}", "user_id": f"eq.{user_id}", "limit": "1"},
        )
        if rows:
            raw = str(rows[0].get("tickers") or "")
            tickers = [t.strip().upper() for t in raw.replace(",", " ").split() if t.strip()]
            if tickers:
                return tickers[:MAX_SHIFT_TICKERS]
    return normalize_ticker_list(schedule.get("tickers") or [], max_count=MAX_SHIFT_TICKERS)


def check_conflicts(
    user_id: str,
    *,
    time_local: str,
    recurrence: str,
    days_of_week: list[int] | None,
    exclude_id: str | None = None,
) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    target_time = _parse_time_local(time_local)
    for sched in list_schedules(user_id, enabled_only=True):
        if exclude_id and sched.get("id") == exclude_id:
            continue
        if str(sched.get("time_local", ""))[:5] != target_time.strftime("%H:%M"):
            continue
        if recurrence == "weekly" and days_of_week:
            existing = {int(d) for d in (sched.get("days_of_week") or [])}
            overlap = existing.intersection(days_of_week)
            if overlap:
                conflicts.append({"id": sched.get("id"), "label": sched.get("label"), "days": sorted(overlap)})
        elif str(sched.get("recurrence")) in ("daily", "weekly"):
            conflicts.append({"id": sched.get("id"), "label": sched.get("label")})
    return conflicts


def create_schedule(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    prefs = get_scheduler_prefs(user_id)
    if count_active_schedules(user_id) >= prefs["max_active_schedules"] and payload.get("enabled", True):
        raise ValueError(f"Maximum {prefs['max_active_schedules']} active schedules allowed.")

    template_key = payload.get("template_key")
    if template_key and template_key in _TEMPLATE_PRESETS:
        preset = _TEMPLATE_PRESETS[template_key]
        payload = {**preset, **payload, "template_key": template_key}

    tickers = normalize_ticker_list(payload.get("tickers") or [], max_count=MAX_SHIFT_TICKERS)
    if not tickers and not payload.get("watchlist_id"):
        raise ValueError("Provide tickers or a watchlist_id.")

    recurrence = str(payload.get("recurrence") or "daily")
    if recurrence not in ("daily", "weekly", "once"):
        raise ValueError("recurrence must be daily, weekly, or once")

    row: dict[str, Any] = {
        "user_id": user_id,
        "label": payload.get("label"),
        "tickers": tickers,
        "ticker_query": payload.get("ticker_query"),
        "enabled": bool(payload.get("enabled", True)),
        "timezone": payload.get("timezone") or prefs["timezone"],
        "recurrence": recurrence,
        "time_local": payload.get("time_local") or "09:30:00",
        "days_of_week": payload.get("days_of_week"),
        "run_once_at": payload.get("run_once_at"),
        "enabled_agent_keys": payload.get("enabled_agent_keys") or [],
        "watchlist_id": payload.get("watchlist_id"),
        "source_shift_id": payload.get("source_shift_id"),
        "template_key": payload.get("template_key"),
        "auto_publish": bool(payload.get("auto_publish", False)),
        "notify_email": bool(payload.get("notify_email", False)),
        "initial_cash": float(payload.get("initial_cash") or 100_000),
        "run_risk_pipeline": bool(payload.get("run_risk_pipeline", True)),
        "model_name": payload.get("model_name"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    row["next_run_at"] = (
        compute_next_run_at(row).isoformat() if row["enabled"] else None
    )

    created = _rest_insert("shift_schedules", row)
    if created:
        return created

    import uuid

    row["id"] = str(uuid.uuid4())
    row["created_at"] = datetime.now(timezone.utc).isoformat()
    _mem_schedules.setdefault(user_id, []).append(row)
    return row


def update_schedule(user_id: str, schedule_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    existing = get_schedule(user_id, schedule_id)
    if not existing:
        return None

    merged = {**existing, **payload, "updated_at": datetime.now(timezone.utc).isoformat()}
    if "enabled" in payload or any(k in payload for k in ("recurrence", "time_local", "days_of_week", "run_once_at", "timezone")):
        merged["next_run_at"] = (
            compute_next_run_at(merged).isoformat() if merged.get("enabled", True) else None
        )

    patched = _rest_patch(
        "shift_schedules",
        {"id": f"eq.{schedule_id}", "user_id": f"eq.{user_id}"},
        {k: v for k, v in payload.items() if k != "id"},
    )
    if patched:
        if "next_run_at" in merged:
            _rest_patch(
                "shift_schedules",
                {"id": f"eq.{schedule_id}"},
                {"next_run_at": merged["next_run_at"]},
            )
        return get_schedule(user_id, schedule_id)

    for i, s in enumerate(_mem_schedules.get(user_id, [])):
        if s.get("id") == schedule_id:
            _mem_schedules[user_id][i] = merged
            return merged
    return None


def delete_schedule(user_id: str, schedule_id: str) -> bool:
    ok = _rest_delete(
        "shift_schedules",
        {"id": f"eq.{schedule_id}", "user_id": f"eq.{user_id}"},
    )
    if ok:
        return True
    before = len(_mem_schedules.get(user_id, []))
    _mem_schedules[user_id] = [s for s in _mem_schedules.get(user_id, []) if s.get("id") != schedule_id]
    return len(_mem_schedules.get(user_id, [])) < before


def get_shift_for_repeat(user_id: str, shift_id: str) -> dict[str, Any] | None:
    rows = _rest_get(
        "shifts",
        select="id,tickers,model,initial_cash,analyst_count,summary,payload",
        params={"id": f"eq.{shift_id}", "user_id": f"eq.{user_id}", "limit": "1"},
    )
    return rows[0] if rows else None


def suggest_schedules(user_id: str) -> list[dict[str, Any]]:
    """Propose schedules from recent shift history."""
    shifts = _rest_get(
        "shifts",
        select="tickers,model,initial_cash,ts_ms",
        params={"user_id": f"eq.{user_id}", "order": "ts_ms.desc", "limit": "10"},
    )
    watchlists = list_watchlists(user_id)
    suggestions: list[dict[str, Any]] = []

    if shifts:
        top = shifts[0]
        tickers = top.get("tickers") or []
        if tickers:
            suggestions.append({
                "label": "Repeat your last shift",
                "tickers": tickers[:MAX_SHIFT_TICKERS],
                "recurrence": "weekly",
                "days_of_week": [0, 1, 2, 3, 4],
                "time_local": "09:35:00",
                "template_key": "market_open",
                "reason": "Based on your most recent committee run.",
            })

    if watchlists:
        wl = watchlists[0]
        suggestions.append({
            "label": f"Weekday open — {wl.get('label')}",
            "watchlist_id": wl.get("id"),
            "recurrence": "weekly",
            "days_of_week": [0, 1, 2, 3, 4],
            "time_local": "09:30:00",
            "template_key": "market_open",
            "reason": f"Auto-sync tickers from watchlist «{wl.get('label')}».",
        })

    return suggestions[:2]


def get_due_schedules(*, limit: int = 20) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    return _rest_get(
        "shift_schedules",
        select=_SCHEDULE_COLUMNS,
        params={
            "enabled": "eq.true",
            "next_run_at": f"lte.{now}",
            "order": "next_run_at.asc",
            "limit": str(limit),
        },
    )


def insert_schedule_run(row: dict[str, Any]) -> dict[str, Any] | None:
    return _rest_insert("shift_schedule_runs", row)


def update_schedule_run(run_id: str, updates: dict[str, Any]) -> None:
    _rest_patch("shift_schedule_runs", {"id": f"eq.{run_id}"}, updates)


def get_last_completed_run(schedule_id: str) -> dict[str, Any] | None:
    rows = _rest_get(
        "shift_schedule_runs",
        select="id,shift_id,scheduled_for,metadata",
        params={
            "schedule_id": f"eq.{schedule_id}",
            "status": "eq.completed",
            "order": "scheduled_for.desc",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def insert_notification(row: dict[str, Any]) -> None:
    if not db_available():
        return
    _rest_insert("notifications", row)


def get_conversation(user_id: str, conversation_id: str | None) -> tuple[str, list[dict[str, str]]]:
    if conversation_id:
        rows = _rest_get(
            "scheduler_conversations",
            select="id,messages",
            params={"id": f"eq.{conversation_id}", "user_id": f"eq.{user_id}", "limit": "1"},
        )
        if rows:
            msgs = rows[0].get("messages") or []
            return str(rows[0]["id"]), msgs if isinstance(msgs, list) else []

    import uuid

    new_id = str(uuid.uuid4())
    _rest_insert("scheduler_conversations", {
        "id": new_id,
        "user_id": user_id,
        "messages": [],
    })
    _mem_conversations[new_id] = {"id": new_id, "user_id": user_id, "messages": []}
    return new_id, []


def save_conversation(user_id: str, conversation_id: str, messages: list[dict[str, str]]) -> None:
    trimmed = messages[-40:]
    _rest_patch(
        "scheduler_conversations",
        {"id": f"eq.{conversation_id}", "user_id": f"eq.{user_id}"},
        {"messages": trimmed, "updated_at": datetime.now(timezone.utc).isoformat()},
    )
    if conversation_id in _mem_conversations:
        _mem_conversations[conversation_id]["messages"] = trimmed


def build_ics_calendar(user_id: str) -> str:
    """Minimal ICS export for upcoming scheduled runs."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//THE FLOOR//Schedule Desk//EN",
        "CALSCALE:GREGORIAN",
    ]
    for sched in list_schedules(user_id, enabled_only=True):
        previews = preview_schedule_times(sched, count=8)
        label = sched.get("label") or "THE FLOOR shift"
        for iso in previews:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except ValueError:
                continue
            stamp = dt.strftime("%Y%m%dT%H%M%SZ")
            uid = f"{sched.get('id')}-{stamp}@thefloor"
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTART:{stamp}",
                f"SUMMARY:{label}",
                "DESCRIPTION:Scheduled shift on THE FLOOR",
                "END:VEVENT",
            ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def get_active_server_runs(user_id: str) -> list[dict[str, Any]]:
    return _rest_get(
        "shift_schedule_runs",
        select="id,schedule_id,scheduled_for,status",
        params={
            "user_id": f"eq.{user_id}",
            "status": "eq.running",
            "order": "created_at.desc",
        },
    )
