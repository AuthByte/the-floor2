"""Nemotron scheduling desk agent with tool loop."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.backend.services.entitlements import can_use_scheduler
from app.backend.services.schedule_service import (
    check_conflicts,
    create_schedule,
    delete_schedule,
    get_conversation,
    get_scheduler_prefs,
    get_shift_for_repeat,
    list_schedules,
    list_watchlists,
    preview_schedule_times,
    save_conversation,
    suggest_schedules,
    update_schedule,
)
from src.llm.models import ModelProvider, get_model
from src.utils.thesis_verdict import SUMMARIZER_MODEL, SUMMARIZER_PROVIDER

logger = logging.getLogger(__name__)

MAX_TURNS = 5


def get_floor_hours_info() -> dict[str, Any]:
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    from app.backend.services.schedule_service import FLOOR_CLOSE_HOUR_ET, FLOOR_OPEN_HOUR_ET, is_floor_open_et

    now = datetime.now(timezone.utc)
    et = now.astimezone(ZoneInfo("America/New_York"))
    return {
        "window_et": f"{FLOOR_OPEN_HOUR_ET}:00 – {FLOOR_CLOSE_HOUR_ET}:00 Eastern",
        "open_now": is_floor_open_et(now),
        "current_et": et.strftime("%Y-%m-%d %H:%M %Z"),
        "note": "Scheduled shifts only fire during floor hours on US market weekdays (holidays skipped).",
    }


class ToolCall(BaseModel):
    name: str = Field(description="Tool name to invoke")
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentTurn(BaseModel):
    reply: str = Field(description="Natural language reply to the user")
    tool_calls: list[ToolCall] = Field(default_factory=list)


SYSTEM_PROMPT = """You are the Desk Scheduler for THE FLOOR — a simulated trading-floor research product.

Help Pro members schedule automated committee shifts (shifts) for stock tickers at specific time blocks.

Rules:
- Scheduled shifts use THE FLOOR's platform OpenRouter key — never ask for or store user API keys.
- Floor hours: 7:00 AM – 6:00 PM US Eastern, weekdays, market holidays skipped.
- Max 8 tickers per shift. Users can link a watchlist so tickers stay fresh.
- Templates: market_open (9:30), midday_pulse (12:00), pre_close (15:45).
- When creating schedules, confirm tickers, recurrence, time, and timezone.
- Use tools to list watchlists, preview times, check conflicts, and create/update/delete schedules.
- Be concise, floor-desk tone. Paper trading simulation only — not investment advice.

Available tools: list_watchlists, list_schedules, create_schedule, update_schedule, delete_schedule,
preview_schedule, get_floor_hours, check_conflicts, repeat_shift, suggest_schedules.

Return tool_calls when you need to act; otherwise reply directly."""


def _platform_keys() -> dict[str, str]:
    key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    return {"OPENROUTER_API_KEY": key} if key else {}


def _execute_tool(user_id: str, name: str, args: dict[str, Any]) -> Any:
    try:
        if name == "list_watchlists":
            return list_watchlists(user_id)
        if name == "list_schedules":
            return list_schedules(user_id)
        if name == "get_floor_hours":
            return get_floor_hours_info()
        if name == "suggest_schedules":
            return suggest_schedules(user_id)
        if name == "preview_schedule":
            draft = {
                "recurrence": args.get("recurrence", "daily"),
                "time_local": args.get("time_local", "09:30:00"),
                "days_of_week": args.get("days_of_week"),
                "timezone": args.get("timezone") or get_scheduler_prefs(user_id)["timezone"],
                "enabled": True,
                "run_once_at": args.get("run_once_at"),
            }
            return preview_schedule_times(draft, count=int(args.get("count", 3)))
        if name == "check_conflicts":
            return check_conflicts(
                user_id,
                time_local=args.get("time_local", "09:30:00"),
                recurrence=args.get("recurrence", "daily"),
                days_of_week=args.get("days_of_week"),
                exclude_id=args.get("exclude_id"),
            )
        if name == "create_schedule":
            return create_schedule(user_id, args)
        if name == "update_schedule":
            sid = args.pop("schedule_id", None) or args.pop("id", None)
            if not sid:
                return {"error": "schedule_id required"}
            return update_schedule(user_id, str(sid), args)
        if name == "delete_schedule":
            sid = args.get("schedule_id") or args.get("id")
            if not sid:
                return {"error": "schedule_id required"}
            return {"deleted": delete_schedule(user_id, str(sid))}
        if name == "repeat_shift":
            shift_id = args.get("shift_id")
            if not shift_id:
                return {"error": "shift_id required"}
            shift = get_shift_for_repeat(user_id, str(shift_id))
            if not shift:
                return {"error": "shift not found"}
            payload = {
                "tickers": shift.get("tickers") or [],
                "source_shift_id": shift_id,
                "label": args.get("label") or "Repeat shift",
                "recurrence": args.get("recurrence", "weekly"),
                "time_local": args.get("time_local", "09:35:00"),
                "days_of_week": args.get("days_of_week", [0, 1, 2, 3, 4]),
                "initial_cash": float(shift.get("initial_cash") or 100_000),
                "enabled_agent_keys": args.get("enabled_agent_keys") or [],
            }
            return create_schedule(user_id, payload)
        return {"error": f"unknown tool: {name}"}
    except Exception as exc:
        return {"error": str(exc)}


def run_scheduler_chat(
    user_id: str,
    message: str,
    *,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    ok, reason = can_use_scheduler(user_id)
    if not ok:
        return {
            "reply": reason or "Schedule mode requires Pro or an active day pass.",
            "conversation_id": conversation_id,
            "schedules": list_schedules(user_id),
            "tool_trace": [],
        }

    conv_id, history = get_conversation(user_id, conversation_id)
    history = list(history)
    history.append({"role": "user", "content": message.strip()})

    keys = _platform_keys()
    if not keys.get("OPENROUTER_API_KEY"):
        return {
            "reply": "Scheduler is unavailable — platform OpenRouter key not configured.",
            "conversation_id": conv_id,
            "schedules": list_schedules(user_id),
            "tool_trace": [],
        }

    llm = get_model(SUMMARIZER_MODEL, SUMMARIZER_PROVIDER, keys)
    structured = llm.with_structured_output(AgentTurn)
    tool_trace: list[dict[str, Any]] = []
    final_reply = ""

    context = {
        "schedules": list_schedules(user_id),
        "suggestions": suggest_schedules(user_id),
        "prefs": get_scheduler_prefs(user_id),
    }

    messages_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in history[-12:]
    )

    for _ in range(MAX_TURNS):
        prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT + "\n\nContext:\n{context}"),
            ("human", "{messages}\n\nRespond with your reply and any tool_calls."),
        ])
        try:
            turn: AgentTurn = (prompt | structured).invoke({
                "context": json.dumps(context, default=str)[:3000],
                "messages": messages_text,
            })
        except Exception as exc:
            logger.exception("Scheduler agent LLM failed")
            final_reply = f"I hit a snag scheduling that: {exc}"
            break

        if turn.tool_calls:
            results: list[str] = []
            for tc in turn.tool_calls:
                result = _execute_tool(user_id, tc.name, dict(tc.arguments or {}))
                tool_trace.append({"tool": tc.name, "args": tc.arguments, "result": result})
                results.append(f"{tc.name}: {json.dumps(result, default=str)[:800]}")
            context["schedules"] = list_schedules(user_id)
            messages_text += f"\nASSISTANT: {turn.reply}\nTOOL_RESULTS:\n" + "\n".join(results)
            final_reply = turn.reply
            continue

        final_reply = turn.reply
        break

    history.append({"role": "assistant", "content": final_reply})
    save_conversation(user_id, conv_id, history)

    return {
        "reply": final_reply,
        "conversation_id": conv_id,
        "schedules": list_schedules(user_id),
        "suggestions": suggest_schedules(user_id),
        "tool_trace": tool_trace,
    }
