"""Pre-debate consultations.

Before the committee debate, investors quietly reach out to the legends they
admire and ask them to build on their thesis. The mentor adds a short,
in-character note that is appended to the admirer's reasoning, so the enriched
thesis flows into the debate that follows.

Each leg of a consultation is published as a cumulative list of "envelope"
messages on the synthetic ``consultation`` agent channel. The frontend animates
an envelope travelling along the signal lines between the two rooms for every
new message id it sees.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.utils.analysts import ANALYST_CONFIG
from src.utils.llm import call_llm
from src.utils.progress import progress

CONSULTATION_ID = "consultation"

# Keep the phase snappy and cheap — it runs before the (already long) debate.
MAX_PER_TICKER = 4
MAX_TOTAL = 10

# Who each investor looks up to (admirer base key -> ordered mentor base keys).
# Drawn from real-world mentorships, partnerships, and stated influences.
ADMIRES: dict[str, list[str]] = {
    "charlie_munger": ["warren_buffett"],
    "warren_buffett": ["ben_graham", "charlie_munger", "phil_fisher"],
    "li_lu": ["charlie_munger", "warren_buffett"],
    "mohnish_pabrai": ["warren_buffett", "charlie_munger"],
    "bill_ackman": ["warren_buffett"],
    "seth_klarman": ["ben_graham", "warren_buffett"],
    "joel_greenblatt": ["ben_graham", "warren_buffett"],
    "peter_lynch": ["phil_fisher", "warren_buffett"],
    "phil_fisher": ["ben_graham"],
    "aswath_damodaran": ["ben_graham", "warren_buffett"],
    "john_templeton": ["ben_graham"],
    "rakesh_jhunjhunwala": ["warren_buffett", "george_soros"],
    "michael_burry": ["warren_buffett", "ben_graham"],
    "david_einhorn": ["warren_buffett"],
    "howard_marks": ["warren_buffett"],
    "stanley_druckenmiller": ["george_soros"],
    "cathie_wood": ["masayoshi_son"],
    "masayoshi_son": ["warren_buffett"],
}


class MentorNote(BaseModel):
    note: str = Field(
        description="One concrete, in-character insight (1-2 sentences) that "
        "strengthens or sharpens the admirer's thesis."
    )


def extract_base_agent_key(unique_id: str) -> str:
    parts = unique_id.split("_")
    if len(parts) >= 2:
        last_part = parts[-1]
        if len(last_part) == 6 and re.match(r"^[a-z0-9]+$", last_part):
            return "_".join(parts[:-1])
    return unique_id


def _meta(agent_id: str) -> tuple[str, str, str]:
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    return base, cfg.get("display_name", base), cfg.get("investing_style", "")


def _wire_status(msg: dict[str, Any]) -> str:
    """One-line desk headline for live wire (notes are already short)."""
    from_name = msg.get("fromName", "")
    to_name = msg.get("toName", "")
    if msg.get("phase") == "request":
        return f"{from_name} → {to_name}: thesis consult"
    note = str(msg.get("note") or "").strip()
    if note:
        if len(note) > 160:
            note = note[:157] + "…"
        return f'{from_name} → {to_name}: "{note}"'
    return f"{from_name} → {to_name}: reply landed"


def _publish(messages: list[dict[str, Any]], *, ticker: str | None, status: str) -> None:
    progress.update_status(
        CONSULTATION_ID,
        ticker,
        status,
        analysis=json.dumps({"messages": messages}, default=str),
    )


def _envelope(
    *,
    seq: int,
    ticker: str,
    from_id: str,
    to_id: str,
    phase: str,
    note: str | None = None,
) -> dict[str, Any]:
    from_base, from_name, _ = _meta(from_id)
    to_base, to_name, _ = _meta(to_id)
    return {
        "id": uuid.uuid4().hex,
        "seq": seq,
        "ticker": ticker,
        "from": from_id,
        "to": to_id,
        "fromKey": from_base,
        "toKey": to_base,
        "fromName": from_name,
        "toName": to_name,
        "phase": phase,
        "note": note,
    }


def _request_note(
    *,
    mentor_id: str,
    admirer_id: str,
    ticker: str,
    admirer_entry: dict[str, Any],
    state: AgentState,
) -> str:
    _, mentor_name, mentor_style = _meta(mentor_id)
    _, admirer_name, _ = _meta(admirer_id)
    signal = admirer_entry.get("signal", "neutral")
    confidence = int(float(admirer_entry.get("confidence", 50)))
    reasoning = str(admirer_entry.get("reasoning", ""))[:1600]

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are {mentor_name}, a legendary investor.\n"
                "{mentor_style}\n\n"
                "{admirer_name}, an investor who admires you, has quietly asked you "
                "to build on their thesis for {ticker}. Add ONE specific, "
                "in-character insight that strengthens or sharpens their case — a "
                "principle, a risk to watch, or a concrete angle they missed.\n"
                "RULES (strict):\n"
                "- Write in English only.\n"
                "- 1-2 sentences, concrete and specific, no generic platitudes.\n"
                "- Speak in your own voice; do not restate their thesis.\n"
                "Return JSON only.",
            ),
            (
                "human",
                "{admirer_name}'s thesis on {ticker} ({signal}, {confidence}%):\n"
                "{reasoning}\n\n"
                'Return: {{"note": "..."}}',
            ),
        ]
    )

    prompt = template.invoke(
        {
            "mentor_name": mentor_name,
            "mentor_style": mentor_style,
            "admirer_name": admirer_name,
            "ticker": ticker,
            "signal": signal,
            "confidence": confidence,
            "reasoning": reasoning,
        }
    )

    def default() -> MentorNote:
        return MentorNote(
            note=f"Stay within your circle of competence on {ticker} and demand a "
            f"margin of safety before sizing up."
        )

    out = call_llm(
        prompt=prompt,
        pydantic_model=MentorNote,
        agent_name=mentor_id,
        state=state,
        default_factory=default,
    )
    return out.note.strip()


def run_consultations(
    state: AgentState,
    *,
    tickers: list[str],
    analyst_signals: dict[str, Any],
    investor_ids: list[str],
) -> list[dict[str, Any]]:
    """Run the admirer→mentor consultation phase, mutating theses in place.

    Returns the flat list of envelope messages (also streamed live).
    """
    messages: list[dict[str, Any]] = []
    seq = 0
    total = 0

    _publish(messages, ticker=None, status="Floor consultations opening")

    for ticker in tickers:
        if total >= MAX_TOTAL:
            break

        # Active investors that produced a thesis on this ticker (base -> agent_id).
        active: dict[str, str] = {}
        for aid in investor_ids:
            entry = analyst_signals.get(aid, {}).get(ticker)
            if entry and entry.get("reasoning"):
                active.setdefault(extract_base_agent_key(aid), aid)

        if len(active) < 2:
            continue

        per_ticker = 0
        for admirer_base, mentors in ADMIRES.items():
            if per_ticker >= MAX_PER_TICKER or total >= MAX_TOTAL:
                break
            if admirer_base not in active:
                continue
            mentor_base = next(
                (m for m in mentors if m in active and m != admirer_base), None
            )
            if not mentor_base:
                continue

            admirer_id = active[admirer_base]
            mentor_id = active[mentor_base]
            _, admirer_name, _ = _meta(admirer_id)
            _, mentor_name, _ = _meta(mentor_id)

            # Leg 1: the admirer walks an envelope over to the mentor.
            seq += 1
            messages.append(
                _envelope(
                    seq=seq,
                    ticker=ticker,
                    from_id=admirer_id,
                    to_id=mentor_id,
                    phase="request",
                )
            )
            _publish(
                messages,
                ticker=ticker,
                status=_wire_status(messages[-1]),
            )

            # Mentor composes an addition to the admirer's thesis.
            admirer_entry = analyst_signals[admirer_id][ticker]
            note = _request_note(
                mentor_id=mentor_id,
                admirer_id=admirer_id,
                ticker=ticker,
                admirer_entry=admirer_entry,
                state=state,
            )

            # Enrich the admirer's thesis so the debate inherits the addition.
            addition = f"\n\n[At {admirer_name}'s request, {mentor_name} adds: {note}]"
            admirer_entry["reasoning"] = str(admirer_entry.get("reasoning", "")) + addition
            notes = admirer_entry.setdefault("consultation_notes", [])
            notes.append({"from": mentor_name, "note": note})

            # Leg 2: the mentor's note travels back to the admirer's desk.
            seq += 1
            messages.append(
                _envelope(
                    seq=seq,
                    ticker=ticker,
                    from_id=mentor_id,
                    to_id=admirer_id,
                    phase="reply",
                    note=note,
                )
            )
            _publish(
                messages,
                ticker=ticker,
                status=_wire_status(messages[-1]),
            )

            per_ticker += 1
            total += 1

    status = (
        f"Consultations closed — {total} note(s) exchanged"
        if total
        else "No consultations this shift"
    )
    _publish(messages, ticker=None, status=status)
    return messages
