"""Deferred reconciliation of chair @mention consultations into debate + PM outcomes."""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from typing import Any

from src.agents.debate_chamber import (
    _build_cohorts,
    _build_matchups,
    _investor_meta,
    _side_payload,
    is_named_investor,
)
from src.agents.portfolio_manager import generate_trading_decision
from src.utils.debate_judge import judge_debate_round
from src.utils.live_run_registry import LiveRunSession
from src.utils.progress import progress

logger = logging.getLogger(__name__)

CHAIR_PROPAGATION_ID = "chair_propagation"
MATERIAL_CONF_DELTA = 8
MATERIAL_PT_PCT = 0.05


def is_material_revision(revision_record: dict[str, Any]) -> bool:
    before = revision_record.get("before") or {}
    after = revision_record.get("after") or {}

    b_sig = str(before.get("signal") or "").lower()
    a_sig = str(after.get("signal") or "").lower()
    if b_sig and a_sig and b_sig != a_sig:
        return True

    b_conf = before.get("confidence")
    a_conf = after.get("confidence")
    if b_conf is not None and a_conf is not None:
        try:
            if abs(float(a_conf) - float(b_conf)) >= MATERIAL_CONF_DELTA:
                return True
        except (TypeError, ValueError):
            pass

    b_pt = before.get("price_target")
    a_pt = after.get("price_target")
    if b_pt is not None and a_pt is not None:
        try:
            b_f, a_f = float(b_pt), float(a_pt)
            if b_f > 0 and abs(a_f - b_f) / b_f >= MATERIAL_PT_PCT:
                return True
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    return False


def sync_revision_to_graph(
    session: LiveRunSession,
    agent_id: str,
    ticker: str,
    bucket: dict[str, Any],
) -> None:
    if session.graph_signals is None:
        return
    session.graph_signals.setdefault(agent_id, {})[ticker.upper()] = deepcopy(bucket)


def capture_debate_baseline(session: LiveRunSession, ticker: str) -> None:
    ticker = ticker.upper()
    baseline = session.debate_baselines.setdefault(ticker, {})
    for agent_id, by_ticker in session.analyst_signals.items():
        bucket = by_ticker.get(ticker)
        if isinstance(bucket, dict) and bucket.get("reasoning"):
            baseline[agent_id] = deepcopy(bucket)


def _collect_revisions(session: LiveRunSession) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for agent_id, by_ticker in session.analyst_signals.items():
        for ticker, bucket in by_ticker.items():
            if not isinstance(bucket, dict):
                continue
            for rev in bucket.get("revision_history") or []:
                if isinstance(rev, dict):
                    out.append({**rev, "agent_id": agent_id, "ticker": str(ticker).upper()})
    return out


def _emit_propagation(stage: str, ticker: str | None, extra: dict | None = None) -> None:
    payload: dict[str, Any] = {"stage": stage}
    if extra:
        payload.update(extra)
    if ticker:
        payload.setdefault("tickers", [ticker])
    progress.update_status(
        CHAIR_PROPAGATION_ID,
        ticker,
        "Reconciling chair impact" if stage != "complete" else "Chair impact reconciled",
        analysis=json.dumps(payload, default=str),
    )


def _build_signals_by_ticker(
    session: LiveRunSession,
    graph_signals: dict[str, Any],
    tickers: list[str],
) -> dict[str, dict[str, dict]]:
    merged = deepcopy(graph_signals)
    session.merge_into(merged)
    signals_by_ticker: dict[str, dict[str, dict]] = {}
    for ticker in tickers:
        t = str(ticker).upper()
        ticker_signals: dict[str, dict] = {}
        for agent, signals in merged.items():
            if agent.startswith("risk_management_agent"):
                continue
            if not isinstance(signals, dict) or t not in signals:
                continue
            bucket = signals[t]
            if not isinstance(bucket, dict):
                continue
            sig = bucket.get("signal")
            conf = bucket.get("confidence")
            if conf is None and bucket.get("conviction") is not None:
                try:
                    conf = round(min(abs(float(bucket["conviction"])), 1.0) * 100)
                except (TypeError, ValueError):
                    conf = None
            if sig is not None and conf is not None:
                compact: dict[str, Any] = {"sig": sig, "conf": conf}
                for src, dst in (
                    ("time_horizon_months", "horizon_mo"),
                    ("price_target", "target"),
                    ("upside_pct", "upside_pct"),
                ):
                    if bucket.get(src) is not None:
                        compact[dst] = bucket[src]
                if bucket.get("user_consulted"):
                    compact["user_consulted"] = True
                ticker_signals[agent] = compact
        signals_by_ticker[t] = ticker_signals
    return signals_by_ticker


def _risk_limits_from_graph(
    graph_signals: dict[str, Any],
    tickers: list[str],
    agent_id: str = "portfolio_manager",
) -> tuple[dict[str, float], dict[str, int]]:
    current_prices: dict[str, float] = {}
    max_shares: dict[str, int] = {}
    for ticker in tickers:
        risk_manager_id = "risk_management_agent"
        if agent_id.startswith("portfolio_manager_"):
            suffix = agent_id.split("_")[-1]
            risk_manager_id = f"risk_management_agent_{suffix}"
        risk_data = graph_signals.get(risk_manager_id, {}).get(ticker, {})
        if not isinstance(risk_data, dict):
            risk_data = graph_signals.get(risk_manager_id, {}).get(str(ticker).upper(), {})
        if not isinstance(risk_data, dict):
            risk_data = {}
        price = float(risk_data.get("current_price", 0.0))
        limit = float(risk_data.get("remaining_position_limit", 0.0))
        current_prices[ticker] = price
        max_shares[ticker] = int(limit // price) if price > 0 else 0
    return current_prices, max_shares


def _portfolio_manager_id(graph_result: dict[str, Any]) -> str:
    for msg in reversed(graph_result.get("messages") or []):
        name = getattr(msg, "name", None)
        if name is None and isinstance(msg, dict):
            name = msg.get("name")
        if name and str(name).startswith("portfolio_manager"):
            return str(name)
    return "portfolio_manager"


def _minimal_state(graph_result: dict[str, Any], request: Any) -> dict[str, Any]:
    data = graph_result.get("data") or {}
    provider = getattr(request, "model_provider", None) or "openai"
    if hasattr(provider, "value"):
        provider = provider.value
    return {
        "messages": graph_result.get("messages", []),
        "data": data,
        "metadata": {
            "show_reasoning": False,
            "model_name": getattr(request, "model_name", None) or "gpt-4.1",
            "model_provider": str(provider),
            "request": request,
        },
    }


def revise_pm_decisions(
    session: LiveRunSession,
    graph_result: dict[str, Any],
    *,
    initial_decisions: dict[str, Any],
    affected_tickers: list[str],
    request: Any = None,
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    data = graph_result.get("data") or {}
    graph_signals = data.get("analyst_signals") or {}
    tickers = [str(t).upper() for t in (data.get("tickers") or affected_tickers)]
    portfolio = data.get("portfolio") or {}
    state = _minimal_state(graph_result, request or session.request)
    agent_id = _portfolio_manager_id(graph_result)

    signals_by_ticker = _build_signals_by_ticker(session, graph_signals, tickers)
    current_prices, max_shares = _risk_limits_from_graph(graph_signals, tickers, agent_id)

    updated = dict(initial_decisions or {})
    for ticker in affected_tickers:
        t = str(ticker).upper()
        try:
            result = generate_trading_decision(
                tickers=[t],
                signals_by_ticker={t: signals_by_ticker.get(t, {})},
                current_prices={t: current_prices.get(t, 0.0)},
                max_shares={t: max_shares.get(t, 0)},
                portfolio=portfolio,
                agent_id=agent_id,
                state=state,
                chair_context=True,
            )
            dec = result.decisions.get(t)
            if dec:
                updated[t] = dec.model_dump()
        except Exception as exc:
            logger.exception("PM re-synth failed for %s", t)
            errors.append(f"{t}: {exc}")

    return updated, errors


def reweight_debate_for_ticker(
    session: LiveRunSession,
    ticker: str,
    debate_rounds: list[dict[str, Any]],
    graph_result: dict[str, Any],
    material_revisions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    ticker = ticker.upper()
    merged_signals: dict[str, Any] = deepcopy((graph_result.get("data") or {}).get("analyst_signals") or {})
    session.merge_into(merged_signals)

    round_idx = next((i for i, r in enumerate(debate_rounds) if r.get("ticker") == ticker), None)
    if round_idx is None:
        return debate_rounds, None

    round_data = deepcopy(debate_rounds[round_idx])
    investor_ids = sorted(aid for aid in merged_signals if is_named_investor(aid))
    entries_for_ticker = [
        aid
        for aid in investor_ids
        if merged_signals.get(aid, {}).get(ticker, {}).get("reasoning")
    ]
    old_cohorts = round_data.get("cohorts") or {}
    participant_payload = [
        _side_payload(aid, merged_signals[aid][ticker]) for aid in entries_for_ticker
    ]
    new_cohorts = _build_cohorts(participant_payload)

    cohort_changes: list[dict[str, str]] = []
    old_bull = {p.get("agent_id") for p in old_cohorts.get("bull", [])}
    old_bear = {p.get("agent_id") for p in old_cohorts.get("bear", [])}
    for p in participant_payload:
        aid = p["agent_id"]
        new_sig = p.get("signal")
        if aid in old_bull and new_sig != "bullish":
            cohort_changes.append(
                {"agent": aid, "from_cohort": "bull", "to_cohort": new_sig or "neutral"}
            )
        elif aid in old_bear and new_sig != "bearish":
            cohort_changes.append(
                {"agent": aid, "from_cohort": "bear", "to_cohort": new_sig or "neutral"}
            )

    confidence_deltas: list[dict[str, float | str]] = []
    lines = list(round_data.get("lines") or [])
    principal_flipped = False
    left_id = (round_data.get("left") or {}).get("agent_id")
    right_id = (round_data.get("right") or {}).get("agent_id")

    for rev in material_revisions:
        if rev.get("ticker") != ticker:
            continue
        agent_id = rev.get("agent_id")
        if not agent_id:
            continue
        before = rev.get("before") or {}
        after = rev.get("after") or {}
        try:
            b_conf = float(before.get("confidence") or 0)
            a_conf = float(after.get("confidence") or 0)
        except (TypeError, ValueError):
            b_conf = a_conf = 0.0
        confidence_deltas.append({"agent": agent_id, "before": b_conf, "after": a_conf})

        meta = _investor_meta(agent_id)
        prompt = rev.get("prompt") or ""
        line = {
            "name": meta["name"],
            "ticker": ticker,
            "text": rev.get("reply_to_user") or f"Chair consult: {prompt[:120]}",
            "side": "panel",
            "mode": "chair_consult",
            "signal": after.get("signal"),
            "matchup": None,
            "targets": [],
        }
        lines.append(line)

        b_sig = str(before.get("signal") or "").lower()
        a_sig = str(after.get("signal") or "").lower()
        if b_sig != a_sig and agent_id in (left_id, right_id):
            principal_flipped = True

        delta = int(min(6, abs(int(a_conf - b_conf)) // 2))
        if delta > 0:
            for p in participant_payload:
                if p["agent_id"] == agent_id:
                    direction = 1 if a_conf > b_conf else -1
                    p["confidence_after"] = max(
                        0, min(100, float(p["confidence_after"]) + direction * delta)
                    )

    bull_ids = [
        aid for aid in entries_for_ticker if merged_signals[aid][ticker].get("signal") == "bullish"
    ]
    bear_ids = [
        aid for aid in entries_for_ticker if merged_signals[aid][ticker].get("signal") == "bearish"
    ]
    matchups = _build_matchups(
        bull_ids=bull_ids,
        bear_ids=bear_ids,
        analyst_signals=merged_signals,
        ticker=ticker,
    )

    round_data["cohorts"] = new_cohorts
    round_data["matchups"] = matchups
    round_data["lines"] = lines
    round_data["participants"] = participant_payload
    round_data["participant_count"] = len(participant_payload)

    if left_id and left_id in merged_signals and ticker in merged_signals[left_id]:
        round_data["left"] = _side_payload(left_id, merged_signals[left_id][ticker])
        for p in participant_payload:
            if p["agent_id"] == left_id:
                round_data["left"]["confidence_after"] = p["confidence_after"]
    if right_id and right_id in merged_signals and ticker in merged_signals[right_id]:
        round_data["right"] = _side_payload(right_id, merged_signals[right_id][ticker])
        for p in participant_payload:
            if p["agent_id"] == right_id:
                round_data["right"]["confidence_after"] = p["confidence_after"]

    if principal_flipped and left_id and right_id:
        state = _minimal_state(graph_result, session.request)
        left_meta = _investor_meta(left_id)
        right_meta = _investor_meta(right_id)
        left_lines = "\n".join(ln["text"] for ln in lines if ln.get("side") == "left")
        right_lines = "\n".join(ln["text"] for ln in lines if ln.get("side") == "right")
        try:
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
            round_data["winner"] = verdict.winner
            round_data["winner_name"] = (
                round_data["left"]["name"]
                if verdict.winner == "left"
                else round_data["right"]["name"]
                if verdict.winner == "right"
                else None
            )
            round_data["summary"] = verdict.summary
            round_data["recap"] = verdict.recap
        except Exception as exc:
            logger.warning("Debate judge refresh failed: %s", exc)

    new_rounds = list(debate_rounds)
    new_rounds[round_idx] = round_data

    adjustment = {
        "ticker": ticker,
        "cohort_changes": cohort_changes,
        "confidence_deltas": confidence_deltas,
        "synthetic_lines_added": len([ln for ln in lines if ln.get("mode") == "chair_consult"]),
    }
    return new_rounds, adjustment


def _decisions_differ(before: dict[str, Any], after: dict[str, Any]) -> bool:
    if not before and not after:
        return False
    for key in ("action", "quantity", "confidence"):
        if str((before or {}).get(key)) != str((after or {}).get(key)):
            return True
    return False


def build_chair_impact(
    session: LiveRunSession,
    revisions: list[dict[str, Any]],
    *,
    initial_decisions: dict[str, Any],
    final_decisions: dict[str, Any],
    debate_adjustments: list[dict[str, Any]],
    propagation_errors: list[str],
) -> dict[str, Any]:
    material = [r for r in revisions if is_material_revision(r)]
    decision_revisions: dict[str, Any] = {}
    all_tickers = {str(t).upper() for t in session.tickers}
    consulted_tickers = {str(r.get("ticker", "")).upper() for r in revisions if r.get("ticker")}
    for ticker in all_tickers | consulted_tickers:
        if not ticker:
            continue
        before = (initial_decisions or {}).get(ticker) or {}
        after = (final_decisions or {}).get(ticker) or before
        changed = _decisions_differ(before, after)
        reason = after.get("reasoning") if changed and isinstance(after, dict) else None
        decision_revisions[ticker] = {
            "before": before,
            "after": after,
            "changed": changed,
            "reason": reason,
        }

    flat_revisions: list[dict[str, Any]] = []
    for r in revisions:
        rec = {k: v for k, v in r.items() if k not in ("agent_id", "ticker")}
        mat = is_material_revision(rec)
        rec = dict(rec)
        rec["propagation"] = {
            "material": mat,
            "applied_at_phase": session.phase,
            "debate_adjusted": any(
                adj.get("ticker") == r.get("ticker") for adj in debate_adjustments
            ),
            "pm_changed": decision_revisions.get(str(r.get("ticker", "")).upper(), {}).get(
                "changed", False
            ),
        }
        flat_revisions.append(rec)

    return {
        "consult_count": len(revisions),
        "material_count": len(material),
        "revisions": flat_revisions,
        "debate_adjustments": debate_adjustments,
        "decisions": decision_revisions,
        "propagation_errors": propagation_errors,
    }


def reconcile_chair_impact(
    session: LiveRunSession,
    graph_result: dict[str, Any],
    *,
    initial_decisions: dict[str, Any] | None,
    request: Any = None,
) -> dict[str, Any] | None:
    revisions = _collect_revisions(session)
    if not revisions:
        return None

    material_revisions = [r for r in revisions if is_material_revision(r)]
    material_tickers = sorted({str(r["ticker"]).upper() for r in material_revisions if r.get("ticker")})

    _emit_propagation(
        "queued",
        None,
        {"material_count": len(material_revisions), "tickers": material_tickers},
    )

    debate_rounds = list((graph_result.get("data") or {}).get("debate_rounds") or [])
    debate_adjustments: list[dict[str, Any]] = []
    propagation_errors: list[str] = []

    if material_tickers:
        _emit_propagation("debate_reweight", None, {"tickers": material_tickers})
        for ticker in material_tickers:
            ticker_revs = [r for r in material_revisions if r.get("ticker") == ticker]
            try:
                debate_rounds, adj = reweight_debate_for_ticker(
                    session, ticker, debate_rounds, graph_result, ticker_revs
                )
                if adj:
                    debate_adjustments.append(adj)
            except Exception as exc:
                logger.exception("Debate reweight failed for %s", ticker)
                propagation_errors.append(f"debate:{ticker}: {exc}")

    final_decisions = dict(initial_decisions or {})
    if material_tickers:
        _emit_propagation("pm_resynth", None, {"tickers": material_tickers})
        final_decisions, pm_errors = revise_pm_decisions(
            session,
            graph_result,
            initial_decisions=final_decisions,
            affected_tickers=material_tickers,
            request=request,
        )
        propagation_errors.extend(pm_errors)

    chair_impact = build_chair_impact(
        session,
        revisions,
        initial_decisions=initial_decisions or {},
        final_decisions=final_decisions,
        debate_adjustments=debate_adjustments,
        propagation_errors=propagation_errors,
    )
    session.chair_impact = chair_impact

    data = graph_result.get("data")
    if isinstance(data, dict):
        data["debate_rounds"] = debate_rounds

    _emit_propagation("complete", None, {"material_count": chair_impact["material_count"]})

    return {
        "chair_impact": chair_impact,
        "decisions": final_decisions,
        "debate_rounds": debate_rounds,
    }
