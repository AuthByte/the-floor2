"""Broad committee debate for named investors per ticker."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing_extensions import Literal

from src.graph.state import AgentState
from src.utils.analysts import ANALYST_CONFIG
from src.utils.consultation import run_consultations
from src.utils.data_feed_keys import DATA_FEED_KEYS
from src.utils.debate_interjections import wait_for_interjections
from src.utils.debate_judge import judge_debate_round
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.thesis_verdict import publish_debate_verdict

ARGUMENT_ROOM_ID = "argument_room"

MAX_CONFIDENCE_DROP = 12


class DebateOutput(BaseModel):
    rebuttal: str = Field(description="2-4 sentence in-character rebuttal")
    confidence_delta: int = Field(default=0, ge=-MAX_CONFIDENCE_DROP, le=0)
    signal: Literal["bullish", "bearish", "neutral"]


def extract_base_agent_key(unique_id: str) -> str:
    parts = unique_id.split("_")
    if len(parts) >= 2:
        last_part = parts[-1]
        if len(last_part) == 6 and re.match(r"^[a-z0-9]+$", last_part):
            return "_".join(parts[:-1])
    return unique_id


def is_named_investor(agent_id: str) -> bool:
    base = extract_base_agent_key(agent_id)
    return base in ANALYST_CONFIG and base not in DATA_FEED_KEYS


def _investor_meta(agent_id: str) -> dict[str, str]:
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    return {
        "agent_id": agent_id,
        "base_key": base,
        "name": cfg.get("display_name", base),
        "specialty": cfg.get("investing_style", ""),
    }


def pick_debate_pair(
    *,
    ticker: str,
    investor_ids: list[str],
    analyst_signals: dict[str, Any],
) -> tuple[str | None, str | None]:
    """Pick two debaters: top bull vs top bear (by confidence), else highest vs lowest."""
    entries: list[tuple[str, dict[str, Any]]] = []
    for aid in investor_ids:
        own = analyst_signals.get(aid, {}).get(ticker)
        if own and own.get("reasoning"):
            entries.append((aid, own))

    if len(entries) < 2:
        return None, None

    bulls = [(a, o) for a, o in entries if o.get("signal") == "bullish"]
    bears = [(a, o) for a, o in entries if o.get("signal") == "bearish"]

    if bulls and bears:
        left_id = max(bulls, key=lambda x: float(x[1].get("confidence", 0)))[0]
        right_id = max(bears, key=lambda x: float(x[1].get("confidence", 0)))[0]
        if left_id != right_id:
            return left_id, right_id

    ranked = sorted(entries, key=lambda x: float(x[1].get("confidence", 0)))
    return ranked[-1][0], ranked[0][0]


def _peer_entries(
    *,
    speaker_id: str,
    ticker: str,
    analyst_signals: dict[str, Any],
    investor_ids: list[str],
    limit: int = 2,
) -> list[dict[str, Any]]:
    own = analyst_signals.get(speaker_id, {}).get(ticker, {})
    own_signal = own.get("signal", "neutral")
    peers: list[tuple[int, float, str, dict[str, Any]]] = []
    for aid in investor_ids:
        if aid == speaker_id:
            continue
        entry = analyst_signals.get(aid, {}).get(ticker)
        if not entry or not entry.get("reasoning"):
            continue
        signal = entry.get("signal", "neutral")
        conflict = 1 if own_signal != "neutral" and signal != own_signal else 0
        peers.append((conflict, float(entry.get("confidence", 0)), aid, entry))

    peers.sort(key=lambda x: (x[0], x[1]), reverse=True)
    out: list[dict[str, Any]] = []
    for _, _, aid, entry in peers[:limit]:
        meta = _investor_meta(aid)
        out.append(
            {
                "agent_id": aid,
                "name": meta["name"],
                "style": meta["specialty"],
                "signal": entry.get("signal", "neutral"),
                "confidence": entry.get("confidence", 0),
                "reasoning": entry.get("reasoning", ""),
            }
        )
    return out


def _run_debate_turn(
    *,
    agent_id: str,
    ticker: str,
    own: dict[str, Any],
    peers: list[dict[str, Any]],
    turn_mode: Literal["opening", "crossfire", "one_v_two"],
    state: AgentState,
) -> DebateOutput:
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    display_name = cfg.get("display_name", base)
    investing_style = cfg.get("investing_style", "")
    original_signal = own.get("signal", "neutral")
    original_confidence = float(own.get("confidence", 50))

    if not peers:
        return DebateOutput(
            rebuttal=f"My {original_signal} thesis on {ticker} remains unchanged pending stronger counter-evidence.",
            confidence_delta=0,
            signal=original_signal,
        )

    peer_lines: list[str] = []
    for peer in peers[:2]:
        peer_lines.append(
            f"- {peer['name']} ({peer['signal']}, {peer['confidence']}%): {peer['reasoning'][:480]}"
        )
    peer_block = "\n".join(peer_lines)
    peer_names = ", ".join(p["name"] for p in peers[:2])
    mode_note = {
        "opening": "Opening committee turn: set your thesis and challenge conflicting views directly.",
        "crossfire": "Crossfire turn: rebut the strongest conflicts and defend weak points in your thesis.",
        "one_v_two": "Focused one-v-two segment: one investor against two challengers; be concrete and specific.",
    }[turn_mode]

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are {display_name} in a multi-investor investment committee debate.\n"
                "{investing_style}\n\n"
                "RULES (strict):\n"
                "- Write the rebuttal in English only (no Hindi, Hinglish, or other languages).\n"
                "- Debate directly against these investors: {peer_names}.\n"
                "- Your signal MUST remain {original_signal}.\n"
                "- confidence_delta must be 0 or negative only (max {max_drop}).\n"
                "- Write 2-3 sentences with specific points and direct counters.\n"
                "- Reference concrete metrics or evidence from the provided theses.\n"
                "- Avoid generic phrasing.\n"
                "{mode_note}\n"
                "Return JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\n\n"
                "YOUR THESIS ({original_signal}, {original_confidence}%):\n"
                "{own_reasoning}\n\n"
                "PEERS TO CHALLENGE ({peer_names}):\n{peer_block}\n\n"
                'Return: {{"rebuttal": "...", "confidence_delta": 0, "signal": "{original_signal}"}}',
            ),
        ]
    )

    prompt = template.invoke(
        {
            "display_name": display_name,
            "investing_style": investing_style,
            "peer_names": peer_names,
            "mode_note": mode_note,
            "original_signal": original_signal,
            "max_drop": MAX_CONFIDENCE_DROP,
            "ticker": ticker,
            "original_confidence": int(original_confidence),
            "own_reasoning": own.get("reasoning", ""),
            "peer_block": peer_block,
        }
    )

    def default_output() -> DebateOutput:
        return DebateOutput(
            rebuttal=f"My {original_signal} call on {ticker} stands after reviewing committee objections.",
            confidence_delta=0,
            signal=original_signal,
        )

    output = call_llm(
        prompt=prompt,
        pydantic_model=DebateOutput,
        agent_name=agent_id,
        state=state,
        default_factory=default_output,
    )

    if output.signal != original_signal:
        output = output.model_copy(
            update={"signal": original_signal, "confidence_delta": min(output.confidence_delta, 0)}
        )
    return output


def _run_chair_rebuttal(
    *,
    agent_id: str,
    ticker: str,
    own: dict[str, Any],
    chair_name: str,
    chair_text: str,
    state: AgentState,
) -> DebateOutput:
    """Short response from a principal debater to the chair's interjection."""
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    display_name = cfg.get("display_name", base)
    investing_style = cfg.get("investing_style", "")
    original_signal = own.get("signal", "neutral")
    original_confidence = float(own.get("confidence", 50))

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are {display_name} in an investment committee debate.\n"
                "{investing_style}\n\n"
                "The committee chair ({chair_name}) has interrupted with a direct challenge.\n"
                "Respond in 2 sentences: acknowledge the chair, defend your {original_signal} thesis on {ticker}.\n"
                "Your signal MUST remain {original_signal}. confidence_delta must be 0 or negative only.\n"
                "Return JSON only.",
            ),
            (
                "human",
                "CHAIR ({chair_name}):\n{chair_text}\n\n"
                "YOUR THESIS ({original_signal}, {original_confidence}%):\n"
                "{own_reasoning}\n\n"
                'Return: {{"rebuttal": "...", "confidence_delta": 0, "signal": "{original_signal}"}}',
            ),
        ]
    )

    prompt = template.invoke(
        {
            "display_name": display_name,
            "investing_style": investing_style,
            "chair_name": chair_name,
            "original_signal": original_signal,
            "ticker": ticker,
            "original_confidence": int(original_confidence),
            "chair_text": chair_text[:800],
            "own_reasoning": own.get("pre_debate_reasoning") or own.get("reasoning", ""),
        }
    )

    def default_output() -> DebateOutput:
        return DebateOutput(
            rebuttal=f"Chair, my {original_signal} view on {ticker} still holds after your point.",
            confidence_delta=0,
            signal=original_signal,
        )

    output = call_llm(
        prompt=prompt,
        pydantic_model=DebateOutput,
        agent_name=agent_id,
        state=state,
        default_factory=default_output,
    )
    if output.signal != original_signal:
        output = output.model_copy(
            update={"signal": original_signal, "confidence_delta": min(output.confidence_delta, 0)}
        )
    return output


def _process_chair_interjections(
    *,
    run_id: str | None,
    ticker: str,
    round_data: dict[str, Any],
    flat_feed: list[dict[str, Any]],
    all_rounds: list[dict[str, Any]],
    left_id: str,
    right_id: str,
    left_meta: dict[str, Any],
    right_meta: dict[str, Any],
    analyst_signals: dict[str, Any],
    state: AgentState,
    wait_seconds: float,
) -> None:
    if not run_id:
        return

    progress.update_status(
        ARGUMENT_ROOM_ID,
        ticker,
        f"Floor open — chair may speak ({int(wait_seconds)}s)",
    )
    _publish_debate_ui(
        rounds=[*all_rounds, round_data],
        active_ticker=ticker,
        message="Floor open for chair",
    )

    for inj in wait_for_interjections(run_id, ticker, timeout=wait_seconds):
        chair_name = str(inj.get("chair_name") or "Chair")
        chair_text = str(inj.get("text") or "").strip()
        if not chair_text:
            continue

        chair_line = {
            "name": chair_name,
            "ticker": ticker,
            "text": chair_text,
            "side": "chair",
            "signal": "neutral",
            "mode": "crossfire",
            "matchup": "Chair interjection",
            "targets": [left_meta["name"], right_meta["name"]],
        }
        round_data["lines"].append(chair_line)
        flat_feed.append(chair_line)
        _publish_debate_ui(
            rounds=[*all_rounds, round_data],
            active_ticker=ticker,
            message=f"{chair_name} took the floor",
        )

        for speaker_id, side in ((left_id, "left"), (right_id, "right")):
            own = analyst_signals[speaker_id][ticker]
            meta = _investor_meta(speaker_id)
            progress.update_status(
                ARGUMENT_ROOM_ID,
                ticker,
                f"{meta['name']} responds to chair",
            )
            output = _run_chair_rebuttal(
                agent_id=speaker_id,
                ticker=ticker,
                own={
                    **own,
                    "reasoning": own.get("pre_debate_reasoning") or own.get("reasoning", ""),
                },
                chair_name=chair_name,
                chair_text=chair_text,
                state=state,
            )
            before = float(own.get("pre_debate_confidence", own.get("confidence", 50)))
            new_conf = max(5.0, before + output.confidence_delta)
            own["confidence"] = round(new_conf, 1)
            if speaker_id == left_id:
                round_data["left"]["confidence_after"] = round(new_conf, 1)
            elif speaker_id == right_id:
                round_data["right"]["confidence_after"] = round(new_conf, 1)

            line = {
                "name": meta["name"],
                "ticker": ticker,
                "text": output.rebuttal,
                "side": side,
                "signal": own.get("signal", "neutral"),
                "mode": "crossfire",
                "matchup": f"Reply to {chair_name}",
                "targets": [chair_name],
            }
            round_data["lines"].append(line)
            flat_feed.append(line)
            _publish_debate_ui(
                rounds=[*all_rounds, round_data],
                active_ticker=ticker,
                message=f"{meta['name']} → chair",
            )


def _side_payload(agent_id: str, own: dict[str, Any]) -> dict[str, Any]:
    meta = _investor_meta(agent_id)
    conf = float(own.get("confidence", 50))
    return {
        "agent_id": agent_id,
        "name": meta["name"],
        "specialty": meta["specialty"],
        "signal": own.get("signal", "neutral"),
        "confidence_before": conf,
        "confidence_after": conf,
    }


def _publish_debate_ui(
    *,
    rounds: list[dict[str, Any]],
    active_ticker: str | None,
    message: str,
) -> None:
    progress.update_status(
        ARGUMENT_ROOM_ID,
        active_ticker,
        message,
        analysis=json.dumps({"rounds": rounds, "active_ticker": active_ticker}, default=str),
    )


def _thesis_statement(own: dict[str, Any], ticker: str, display_name: str) -> str:
    """Fast floor line from the pre-debate thesis (no LLM)."""
    signal = own.get("signal", "neutral")
    summary = own.get("thesis_summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()

    reasoning = own.get("pre_debate_reasoning") or own.get("reasoning") or ""
    if isinstance(reasoning, str):
        text = reasoning.strip()
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict) and isinstance(parsed.get("reasoning"), str):
                    text = parsed["reasoning"]
            except json.JSONDecodeError:
                pass
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            sentences = re.split(r"(?<=[.!?])\s+", text)
            snippet = " ".join(sentences[:2]).strip()
            if len(snippet) > 340:
                snippet = snippet[:337] + "..."
            if snippet:
                return snippet

    return f"{display_name} holds a {signal} view on {ticker}."


def _build_cohorts(participant_payload: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return {
        "bull": [p for p in participant_payload if p.get("signal") == "bullish"],
        "bear": [p for p in participant_payload if p.get("signal") == "bearish"],
        "neutral": [p for p in participant_payload if p.get("signal") == "neutral"],
    }


def _build_matchups(
    *,
    bull_ids: list[str],
    bear_ids: list[str],
    analyst_signals: dict[str, Any],
    ticker: str,
) -> list[dict[str, Any]]:
    """Pair bulls vs bears for simultaneous committee duels."""
    matchups: list[dict[str, Any]] = []
    bears = list(bear_ids)
    for bull_id in bull_ids:
        if not bears:
            break
        bear_id = bears.pop(0)
        matchups.append(
            {
                "bull": _side_payload(bull_id, analyst_signals[bull_id][ticker]),
                "bear": _side_payload(bear_id, analyst_signals[bear_id][ticker]),
            }
        )
    return matchups


def _preserve_pre_debate(own: dict[str, Any]) -> None:
    if "pre_debate_reasoning" not in own and own.get("reasoning"):
        own["pre_debate_reasoning"] = own["reasoning"]
    if "pre_debate_confidence" not in own and own.get("confidence") is not None:
        own["pre_debate_confidence"] = own["confidence"]


def debate_chamber_node(state: AgentState) -> dict[str, Any]:
    data = state["data"]
    analyst_signals: dict[str, Any] = data.get("analyst_signals", {})
    tickers: list[str] = data.get("tickers", [])
    run_id: str | None = data.get("run_id")

    investor_ids = sorted(aid for aid in analyst_signals if is_named_investor(aid))

    if not investor_ids:
        progress.update_status(ARGUMENT_ROOM_ID, None, "Empty chamber — no investors to debate")
        return {"data": data}

    # Pre-debate: admirers consult the legends they look up to, enriching their
    # theses (and animating envelopes between rooms) before the floor opens.
    consultation_messages: list[dict[str, Any]] = []
    try:
        consultation_messages = run_consultations(
            state,
            tickers=tickers,
            analyst_signals=analyst_signals,
            investor_ids=investor_ids,
        )
    except Exception as exc:  # consultations are best-effort; never block the debate
        progress.update_status("consultation", None, f"Consultations skipped — {exc}")

    progress.update_status(
        ARGUMENT_ROOM_ID, None, "Chamber open — all investors entering committee"
    )
    all_rounds: list[dict[str, Any]] = []
    flat_feed: list[dict[str, Any]] = []

    for ticker in tickers:
        left_id, right_id = pick_debate_pair(
            ticker=ticker,
            investor_ids=investor_ids,
            analyst_signals=analyst_signals,
        )
        if not left_id or not right_id:
            continue

        left_own = analyst_signals[left_id][ticker]
        right_own = analyst_signals[right_id][ticker]
        left_meta = _investor_meta(left_id)
        right_meta = _investor_meta(right_id)

        entries_for_ticker = [
            aid
            for aid in investor_ids
            if analyst_signals.get(aid, {}).get(ticker, {}).get("reasoning")
        ]
        participant_payload = [
            _side_payload(aid, analyst_signals[aid][ticker]) for aid in entries_for_ticker
        ]

        round_data: dict[str, Any] = {
            "ticker": ticker,
            "left": _side_payload(left_id, left_own),
            "right": _side_payload(right_id, right_own),
            "participants": participant_payload,
            "participant_count": len(participant_payload),
            "mode": "paired_committee",
            "lines": [],
            "winner": None,
            "winner_name": None,
            "summary": None,
            "recap": None,
            "cohorts": _build_cohorts(participant_payload),
            "matchups": [],
        }

        bull_ids = [
            aid
            for aid in entries_for_ticker
            if analyst_signals[aid][ticker].get("signal") == "bullish"
        ]
        bear_ids = [
            aid
            for aid in entries_for_ticker
            if analyst_signals[aid][ticker].get("signal") == "bearish"
        ]
        matchups = _build_matchups(
            bull_ids=bull_ids,
            bear_ids=bear_ids,
            analyst_signals=analyst_signals,
            ticker=ticker,
        )
        round_data["matchups"] = matchups

        _publish_debate_ui(
            rounds=[*all_rounds, round_data],
            active_ticker=ticker,
            message=f"Debating {ticker}: {len(participant_payload)} voices · {len(matchups)} duels",
        )

        participants_map = {p["agent_id"]: p for p in participant_payload}
        for aid in entries_for_ticker:
            _preserve_pre_debate(analyst_signals[aid][ticker])

        # Fast panel: every matchup speaks from thesis (no LLM).
        for duel_idx, duel in enumerate(matchups):
            bull_id = duel["bull"]["agent_id"]
            bear_id = duel["bear"]["agent_id"]
            bull_meta = _investor_meta(bull_id)
            bear_meta = _investor_meta(bear_id)
            bull_own = analyst_signals[bull_id][ticker]
            bear_own = analyst_signals[bear_id][ticker]
            duel_label = f"{bull_meta['name']} vs {bear_meta['name']}"

            progress.update_status(
                ARGUMENT_ROOM_ID,
                ticker,
                f"Duel {duel_idx + 1}/{len(matchups)}: {duel_label}",
            )

            for speaker_id, side_key, own, meta in (
                (bull_id, "left", bull_own, bull_meta),
                (bear_id, "right", bear_own, bear_meta),
            ):
                text = _thesis_statement(own, ticker, meta["name"])
                if speaker_id == left_id:
                    side = "left"
                elif speaker_id == right_id:
                    side = "right"
                else:
                    side = "panel"
                line = {
                    "name": meta["name"],
                    "ticker": ticker,
                    "text": text,
                    "side": side,
                    "signal": own.get("signal", "neutral"),
                    "mode": "opening",
                    "matchup": duel_label,
                    "targets": [bear_meta["name"] if speaker_id == bull_id else bull_meta["name"]],
                }
                round_data["lines"].append(line)
                flat_feed.append(line)

            _publish_debate_ui(
                rounds=[*all_rounds, round_data],
                active_ticker=ticker,
                message=f"Panel: {duel_label}",
            )

        paired_ids = {
            aid
            for duel in matchups
            for aid in (duel["bull"]["agent_id"], duel["bear"]["agent_id"])
        }
        for aid in entries_for_ticker:
            own = analyst_signals[aid][ticker]
            if aid in paired_ids or own.get("signal") != "neutral":
                continue
            meta = _investor_meta(aid)
            text = _thesis_statement(own, ticker, meta["name"])
            line = {
                "name": meta["name"],
                "ticker": ticker,
                "text": text,
                "side": "panel",
                "signal": "neutral",
                "mode": "opening",
                "matchup": "Neutral bench",
                "targets": [],
            }
            round_data["lines"].append(line)
            flat_feed.append(line)

        _process_chair_interjections(
            run_id=run_id,
            ticker=ticker,
            round_data=round_data,
            flat_feed=flat_feed,
            all_rounds=all_rounds,
            left_id=left_id,
            right_id=right_id,
            left_meta=left_meta,
            right_meta=right_meta,
            analyst_signals=analyst_signals,
            state=state,
            wait_seconds=12.0,
        )

        # Headline crossfire: only the principal bull/bear get LLM rebuttals (2 calls).
        for speaker_id, peers_for in (
            (left_id, [right_id]),
            (right_id, [left_id]),
        ):
            own = analyst_signals[speaker_id][ticker]
            peers = []
            for pid in peers_for:
                entry = analyst_signals.get(pid, {}).get(ticker)
                if not entry:
                    continue
                meta = _investor_meta(pid)
                peers.append(
                    {
                        "agent_id": pid,
                        "name": meta["name"],
                        "style": meta["specialty"],
                        "signal": entry.get("signal", "neutral"),
                        "confidence": entry.get("confidence", 0),
                        "reasoning": entry.get("pre_debate_reasoning") or entry.get("reasoning", ""),
                    }
                )
            if not peers:
                continue

            progress.update_status(
                speaker_id,
                ticker,
                "Debating in chamber",
                clear_analysis=True,
            )
            progress.update_status(
                ARGUMENT_ROOM_ID,
                ticker,
                f"Crossfire: {_investor_meta(speaker_id)['name']}",
            )

            output = _run_debate_turn(
                agent_id=speaker_id,
                ticker=ticker,
                own={
                    **own,
                    "reasoning": own.get("pre_debate_reasoning") or own.get("reasoning", ""),
                },
                peers=peers,
                turn_mode="crossfire",
                state=state,
            )

            before = float(own.get("pre_debate_confidence", own.get("confidence", 50)))
            new_conf = max(5.0, before + output.confidence_delta)
            own["debate_rebuttal"] = output.rebuttal
            own["confidence"] = round(new_conf, 1)

            if speaker_id == left_id:
                round_data["left"]["confidence_after"] = round(new_conf, 1)
                side = "left"
            elif speaker_id == right_id:
                round_data["right"]["confidence_after"] = round(new_conf, 1)
                side = "right"
            else:
                side = "panel"
            if speaker_id in participants_map:
                participants_map[speaker_id]["confidence_after"] = round(new_conf, 1)

            focal = _investor_meta(speaker_id)["name"]
            opponent = peers[0]["name"] if peers else ""
            line = {
                "name": focal,
                "ticker": ticker,
                "text": output.rebuttal,
                "side": side,
                "signal": own.get("signal", "neutral"),
                "mode": "crossfire",
                "matchup": f"{left_meta['name']} vs {right_meta['name']}",
                "targets": [opponent] if opponent else [],
            }
            round_data["lines"].append(line)
            flat_feed.append(line)

            publish_debate_verdict(
                speaker_id,
                ticker,
                confidence=new_conf,
                rebuttal=output.rebuttal,
                state=state,
            )

            _publish_debate_ui(
                rounds=[*all_rounds, round_data],
                active_ticker=ticker,
                message=f"{focal} crossfire",
            )

        _process_chair_interjections(
            run_id=run_id,
            ticker=ticker,
            round_data=round_data,
            flat_feed=flat_feed,
            all_rounds=all_rounds,
            left_id=left_id,
            right_id=right_id,
            left_meta=left_meta,
            right_meta=right_meta,
            analyst_signals=analyst_signals,
            state=state,
            wait_seconds=6.0,
        )

        left_lines = "\n".join(
            ln["text"] for ln in round_data["lines"] if ln.get("side") == "left"
        )
        right_lines = "\n".join(
            ln["text"] for ln in round_data["lines"] if ln.get("side") == "right"
        )

        verdict = judge_debate_round(
            ticker=ticker,
            left_name=left_meta["name"],
            left_signal=round_data["left"]["signal"],
            left_conf_before=round_data["left"]["confidence_before"],
            left_conf_after=round_data["left"]["confidence_after"],
            left_lines=left_lines or "(no lines)",
            right_name=right_meta["name"],
            right_signal=round_data["right"]["signal"],
            right_conf_before=round_data["right"]["confidence_before"],
            right_conf_after=round_data["right"]["confidence_after"],
            right_lines=right_lines or "(no lines)",
            state=state,
        )

        winner_side = verdict.winner
        round_data["winner"] = winner_side
        round_data["winner_name"] = (
            round_data["left"]["name"]
            if winner_side == "left"
            else round_data["right"]["name"]
            if winner_side == "right"
            else None
        )
        round_data["summary"] = verdict.summary
        round_data["recap"] = verdict.recap
        round_data["participants"] = list(participants_map.values())
        round_data["participant_count"] = len(participants_map)

        all_rounds.append(round_data)
        _publish_debate_ui(
            rounds=all_rounds,
            active_ticker=ticker,
            message=f"Round closed — {verdict.summary}",
        )

    data["debate_feed"] = flat_feed
    data["debate_rounds"] = all_rounds
    data["consultation_messages"] = consultation_messages

    from src.utils.interactive_artifacts import build_shift_artifacts
    from src.utils.ticker_dossier import get_dossier

    shift_artifacts: dict[str, list[dict[str, Any]]] = {}
    analyst_signals = data.get("analyst_signals") or {}
    current_prices = data.get("current_prices") or {}
    for ticker in tickers:
        key = str(ticker).strip().upper()
        dossier = get_dossier(state, key)
        ref = current_prices.get(key)
        try:
            ref_f = float(ref) if ref is not None else None
        except (TypeError, ValueError):
            ref_f = None
        arts = build_shift_artifacts(
            ticker=key,
            analyst_signals=analyst_signals,
            dossier=dossier,
            reference_price=ref_f,
        )
        if arts:
            shift_artifacts[key] = arts
    if shift_artifacts:
        data["shift_artifacts"] = shift_artifacts

    progress.update_status(ARGUMENT_ROOM_ID, None, "Debate closed — sending to risk gate")
    _publish_debate_ui(rounds=all_rounds, active_ticker=None, message="Debate closed")
    return {"data": data}
