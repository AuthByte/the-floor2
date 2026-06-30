"""User-initiated @mention consultations that revise agent theses mid-shift."""

from __future__ import annotations

import json
import re
import threading
import uuid
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.llm.models import ModelProvider, get_model
from src.utils.analysts import ANALYST_CONFIG
from src.utils.consultation import CONSULTATION_ID, _meta, extract_base_agent_key
from src.utils.consultation_propagation import (
    CHAIR_PROPAGATION_ID,
    is_material_revision,
    sync_revision_to_graph,
)
from src.utils.live_run_registry import LiveRunSession, get_session
from src.utils.progress import progress
from src.utils.thesis_outlook import enrich_outlook
from src.utils.thesis_verdict import summarize_investor_thesis

MENTIONABLE = {
    k for k in ANALYST_CONFIG if k not in {"portfolio_manager", "risk_management_agent", "debate_chamber"}
}

_consult_locks: dict[tuple[str, str, str], threading.Lock] = {}
_consult_locks_guard = threading.Lock()


def _consult_lock(run_id: str, agent_id: str, ticker: str) -> threading.Lock:
    key = (run_id, agent_id, ticker.upper())
    with _consult_locks_guard:
        if key not in _consult_locks:
            _consult_locks[key] = threading.Lock()
        return _consult_locks[key]


class RevisionResult(BaseModel):
    signal: str = Field(description="bullish, bearish, or neutral")
    confidence: int = Field(ge=0, le=100)
    reasoning: str = Field(description="Revised thesis incorporating the user's question")
    price_target: float | None = Field(default=None, description="12-month USD price target if applicable")
    reply_to_user: str = Field(description="1-2 sentence in-character reply to the chair")


def _suffix_for(agent_key: str) -> str:
    h = 0
    for ch in agent_key:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    s = ""
    for _ in range(6):
        s += alphabet[h % len(alphabet)]
        h = (h // 7) + 13
    return s


def room_id_for(agent_key: str) -> str:
    return f"{agent_key}_{_suffix_for(agent_key)}"


def parse_mention(text: str) -> tuple[str | None, str]:
    """Return (agent_key, message_without_mention)."""
    raw = (text or "").strip()
    if not raw:
        return None, ""

    m = re.match(
        r"^@([A-Za-z][\w\s.'-]{0,48})\s*[,:]?\s*(.*)$",
        raw,
        re.DOTALL,
    )
    if not m:
        return None, raw

    handle = m.group(1).strip().lower().replace(" ", "_").replace(".", "")
    body = (m.group(2) or "").strip()
    if not body:
        body = raw

    # direct key
    if handle in MENTIONABLE:
        return handle, body

    # fuzzy: name, callsign, partial
    for key, cfg in ANALYST_CONFIG.items():
        if key not in MENTIONABLE:
            continue
        name = str(cfg.get("display_name", "")).lower().replace(" ", "_")
        if handle == name or handle in name or name in handle:
            return key, body
        callsign = str(cfg.get("callsign", "")).lower()
        if callsign and handle == callsign.lower():
            return key, body

    return None, raw


def _resolve_agent_id(session: LiveRunSession, agent_key: str) -> str:
    for aid in session.analyst_signals:
        if extract_base_agent_key(aid) == agent_key:
            return aid
    return room_id_for(agent_key)


def _api_keys(session: LiveRunSession) -> dict | None:
    req = session.request
    if req and hasattr(req, "api_keys"):
        return req.api_keys
    return None


def _model(session: LiveRunSession) -> tuple[str, str]:
    req = session.request
    name = getattr(req, "model_name", None) or "gpt-4.1"
    provider = getattr(req, "model_provider", None) or ModelProvider.OPENAI
    if hasattr(provider, "value"):
        provider = provider.value
    return str(name), str(provider)


def _publish_consultation(session: LiveRunSession, msg: dict[str, Any], *, status: str) -> None:
    session.consultation_messages.append(msg)
    progress.update_status(
        CONSULTATION_ID,
        msg.get("ticker"),
        status,
        analysis=json.dumps({"messages": session.consultation_messages}, default=str),
    )


def apply_user_consultation(
    *,
    run_id: str,
    ticker: str,
    message: str,
    chair_name: str = "Chair",
) -> dict[str, Any]:
    """Process @mention consultation: revise agent thesis and stream updates."""
    session = get_session(run_id)
    if not session:
        raise ValueError("no_active_run")

    ticker = str(ticker).strip().upper()
    if ticker not in session.tickers:
        raise ValueError("ticker_not_in_shift")

    agent_key, user_question = parse_mention(message)
    if not agent_key:
        raise ValueError("mention_required")

    agent_id = _resolve_agent_id(session, agent_key)

    with _consult_lock(run_id, agent_id, ticker):
        return _apply_user_consultation_locked(
            session=session,
            run_id=run_id,
            ticker=ticker,
            agent_key=agent_key,
            agent_id=agent_id,
            user_question=user_question,
            chair_name=chair_name,
        )


def _apply_user_consultation_locked(
    *,
    session: LiveRunSession,
    run_id: str,
    ticker: str,
    agent_key: str,
    agent_id: str,
    user_question: str,
    chair_name: str,
) -> dict[str, Any]:
    prior = session.get_bucket(agent_id, ticker)
    if not prior or not str(prior.get("reasoning", "")).strip():
        raise ValueError("agent_not_ready")

    _, agent_name, agent_style = _meta(agent_id)
    model_name, model_provider = _model(session)

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are {agent_name}, a legendary investor revising your published thesis.\n"
                "{agent_style}\n\n"
                "The Chair ({chair_name}) has a direct question about {ticker}. "
                "Update your thesis to address it while staying in character.\n"
                "Return JSON with signal, confidence (0-100), reasoning (180-280 words), "
                "optional price_target (12-month USD per share), and reply_to_user (1-2 sentences).\n"
                "If you change your price view, set price_target explicitly.",
            ),
            (
                "human",
                "Prior signal: {signal}\n"
                "Prior confidence: {confidence}\n"
                "Prior thesis:\n{prior_reasoning}\n\n"
                "Chair question:\n{question}\n\n"
                "Return revised JSON.",
            ),
        ]
    )

    prompt = template.invoke(
        {
            "agent_name": agent_name,
            "agent_style": agent_style or "Disciplined investor.",
            "chair_name": chair_name,
            "ticker": ticker,
            "signal": prior.get("signal", "neutral"),
            "confidence": int(float(prior.get("confidence", 50))),
            "prior_reasoning": str(prior.get("reasoning", ""))[:2400],
            "question": user_question[:1200],
        }
    )

    llm = get_model(model_name, model_provider, _api_keys(session))
    structured = llm.with_structured_output(RevisionResult, method="json_mode")
    revision: RevisionResult = structured.invoke(prompt)

    signal = str(revision.signal).lower()
    if signal not in {"bullish", "bearish", "neutral"}:
        signal = str(prior.get("signal", "neutral"))

    conf = float(revision.confidence)
    reasoning = str(revision.reasoning).strip()
    ref_price = prior.get("reference_price")
    if ref_price is None:
        ref_price = prior.get("current_price")

    outlook = enrich_outlook(
        {
            "time_horizon_months": prior.get("time_horizon_months", 12),
            "price_target": revision.price_target if revision.price_target else prior.get("price_target"),
        },
        current_price=ref_price,
    )

    summary = summarize_investor_thesis(
        ticker=ticker,
        signal=signal,
        confidence=conf,
        reasoning=reasoning,
        state=None,
    )

    revision_record = {
        "id": uuid.uuid4().hex,
        "ts": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "prompt": user_question,
        "chair_name": chair_name,
        "before": {
            "signal": prior.get("signal"),
            "confidence": prior.get("confidence"),
            "thesis_summary": prior.get("thesis_summary"),
            "price_target": prior.get("price_target"),
            "reasoning_excerpt": str(prior.get("reasoning", ""))[:400],
        },
        "after": {
            "signal": signal,
            "confidence": conf,
            "thesis_summary": summary,
            "price_target": outlook.get("price_target"),
            "reasoning_excerpt": reasoning[:400],
        },
        "reply_to_user": revision.reply_to_user.strip(),
    }

    updated = dict(prior)
    updated["signal"] = signal
    updated["confidence"] = conf
    updated["reasoning"] = reasoning
    updated["thesis_summary"] = summary
    for key in ("time_horizon_months", "price_target", "upside_pct", "reference_price"):
        if key in outlook:
            updated[key] = outlook[key]
    history = list(updated.get("revision_history") or [])
    history.append(revision_record)
    updated["revision_history"] = history
    updated["user_consulted"] = True

    session.apply_bucket(agent_id, ticker, updated)
    sync_revision_to_graph(session, agent_id, ticker, updated)

    material = is_material_revision(revision_record)
    session.propagation_queue.append(
        {
            "run_id": run_id,
            "agent_id": agent_id,
            "agent_key": agent_key,
            "ticker": ticker,
            "revision_id": revision_record["id"],
            "material": material,
            "phase": session.phase,
        }
    )
    if material:
        progress.update_status(
            CHAIR_PROPAGATION_ID,
            ticker,
            "Queued for reconcile",
            analysis=json.dumps(
                {"stage": "queued", "material_count": 1, "tickers": [ticker]},
                default=str,
            ),
        )

    payload = {
        "signal": signal,
        "confidence": conf,
        "reasoning": reasoning,
        "thesis_summary": summary,
        **{k: updated[k] for k in ("time_horizon_months", "price_target", "upside_pct", "reference_price") if k in updated},
        "revision_history": history,
    }
    progress.update_status(
        agent_id,
        ticker,
        "Revised (chair consult)",
        analysis=json.dumps(payload, default=str),
        signal=signal,
        confidence=conf,
        thesis_summary=summary,
    )

    seq = len(session.consultation_messages)
    req_env = {
        "id": uuid.uuid4().hex,
        "seq": seq,
        "ticker": ticker,
        "from": "chair",
        "to": agent_id,
        "fromKey": "chair",
        "toKey": agent_key,
        "fromName": chair_name,
        "toName": agent_name,
        "phase": "user_request",
        "note": user_question,
    }
    _publish_consultation(session, req_env, status=f"{chair_name} → {agent_name}: consult")

    reply_env = {
        "id": uuid.uuid4().hex,
        "seq": seq + 1,
        "ticker": ticker,
        "from": agent_id,
        "to": "chair",
        "fromKey": agent_key,
        "toKey": "chair",
        "fromName": agent_name,
        "toName": chair_name,
        "phase": "user_reply",
        "note": revision.reply_to_user.strip(),
    }
    _publish_consultation(
        session,
        reply_env,
        status=f"{agent_name} revised thesis for {ticker}",
    )

    return {
        "agent_key": agent_key,
        "agent_id": agent_id,
        "ticker": ticker,
        "revision": revision_record,
        "bucket": updated,
        "material": material,
        "propagation_queued": material,
        "phase": session.phase,
    }


def mirror_progress_to_session(
    session: LiveRunSession,
    agent_name: str,
    ticker: str | None,
    analysis: str | None,
) -> None:
    """Keep session analyst_signals in sync as agents complete."""
    if not ticker or not analysis:
        return
    base = extract_base_agent_key(agent_name)
    if base in {"portfolio_manager", "risk_management_agent", "debate_chamber", "consultation"}:
        return
    try:
        parsed = json.loads(analysis)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(parsed, dict):
        return
    bucket: dict[str, Any] = {
        "signal": parsed.get("signal"),
        "confidence": parsed.get("confidence"),
        "reasoning": parsed.get("reasoning"),
        "thesis_summary": parsed.get("thesis_summary"),
    }
    for key in (
        "time_horizon_months",
        "price_target",
        "upside_pct",
        "reference_price",
        "artifacts",
        "revision_history",
        "user_consulted",
    ):
        if key in parsed:
            bucket[key] = parsed[key]
    session.mirror_agent_bucket(agent_name, ticker, bucket)
