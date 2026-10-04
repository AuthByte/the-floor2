"""Lens engine: deterministic prior → cited LLM thesis → guardrails → floor.

The LLM is a writer and a skeptic, not an oracle. The desk computes a prior
from the evidence ledger; the LLM may move confidence by at most
``MAX_CONFIDENCE_SHIFT`` and may only change the call when it cites enough
ledger facts. Anything it cites that isn't in the ledger is dropped.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing_extensions import Literal

from src.desk.evidence import FACTOR_LABELS, EvidenceLedger, get_evidence
from src.desk.lenses import Lens
from src.graph.state import AgentState, show_agent_reasoning
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.thesis_verdict import finish_investor_ticker, merge_finish_outlook

Signal = Literal["bullish", "bearish", "neutral"]

BULL_THRESHOLD = 0.15
MAX_CONFIDENCE_SHIFT = 20
CITES_TO_SHIFT_ONE_STEP = 2
CITES_TO_FLIP = 3


@dataclass
class DeskPrior:
    score: float
    coverage: float
    signal: Signal
    confidence: float
    contributions: dict[str, float]
    tripped: list[str] = field(default_factory=list)
    forced_bearish: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": round(self.score, 3),
            "coverage": round(self.coverage, 2),
            "signal": self.signal,
            "confidence": round(self.confidence, 1),
            "contributions": {k: round(v, 3) for k, v in self.contributions.items()},
            "dealbreakers": self.tripped,
        }


def compute_prior(ledger: EvidenceLedger, lens: Lens) -> DeskPrior:
    total_weight = sum(abs(w) for w in lens.weights.values()) or 1.0
    contributions: dict[str, float] = {}
    covered = 0.0
    for name, weight in lens.weights.items():
        fs = ledger.factors.get(name)
        if not fs or fs.coverage == 0:
            continue
        contributions[name] = weight * fs.score * fs.coverage / total_weight
        covered += abs(weight) * fs.coverage
    score = sum(contributions.values())
    coverage = covered / total_weight

    if score >= BULL_THRESHOLD:
        signal: Signal = "bullish"
    elif score <= -BULL_THRESHOLD:
        signal = "bearish"
    else:
        signal = "neutral"

    if signal == "neutral":
        confidence = 35 + 30 * coverage * (1 - abs(score) / BULL_THRESHOLD)
    else:
        strength = min(1.0, abs(score) / 0.6)
        confidence = 40 + 55 * strength * (0.4 + 0.6 * coverage)

    tripped: list[str] = []
    forced = False
    for rule in lens.dealbreakers:
        if not rule.check(ledger):
            continue
        tripped.append(rule.reason)
        if rule.effect == "force_bearish":
            forced = True
        elif signal == "bullish":
            signal, confidence = "neutral", min(confidence, 55.0)
    if forced:
        signal, confidence = "bearish", max(confidence, 60.0)

    return DeskPrior(
        score=score,
        coverage=coverage,
        signal=signal,
        confidence=round(confidence, 1),
        contributions=contributions,
        tripped=tripped,
        forced_bearish=forced,
    )


def desk_price_target(ledger: EvidenceLedger, lens: Lens, signal: Signal) -> float | None:
    price = ledger.price
    if not price:
        return None
    drift = ledger.value("ret_12m") or 0.0
    drift = max(-0.3, min(0.5, drift)) * 0.5 * lens.horizon_months / 12
    momentum_target = price * (1 + drift)
    fv = ledger.fair_value
    if fv:
        target = fv["mid"] * lens.fair_value_trust + momentum_target * (1 - lens.fair_value_trust)
    else:
        target = momentum_target
    return round(_directional(target, price, signal), 2)


def _directional(target: float, price: float, signal: Signal) -> float:
    if signal == "bullish":
        return max(target, price * 1.03)
    if signal == "bearish":
        return min(target, price * 0.97)
    return max(price * 0.95, min(price * 1.05, target))


class LensVerdict(BaseModel):
    signal: Signal
    confidence: float = Field(description="0-100")
    headline: str = Field(description="One sentence, max 22 words, the call and the single best reason")
    thesis: str = Field(description="120-220 words, in this desk's voice, citing fact ids like [F07]")
    cited: list[str] = Field(default_factory=list, description="Fact ids relied on, e.g. ['F03','F11']")
    risk: str = Field(default="", description="The strongest counter-argument, one or two sentences")
    invalidation: str = Field(default="", description="A specific, observable condition that would change the call")
    time_horizon_months: int = Field(default=12, ge=1, le=120)
    price_target: float | None = Field(default=None, ge=0)


SYSTEM_PROMPT = (
    "You are the {name} desk on an investment committee floor.\n"
    "Creed: {creed}\n\n"
    "You receive a numbered evidence ledger and a deterministic desk prior computed from it through your creed's "
    "factor weights. Your job is to argue the call honestly, not to invent one.\n"
    "Rules:\n"
    "- Cite only fact ids from the ledger, inline like [F07]. Never use numbers that are not in the ledger.\n"
    "- Your confidence may differ from the prior by at most {shift} points.\n"
    "- To move the signal one step (e.g. bullish→neutral) cite at least {one_step} facts that justify it; "
    "to flip bullish↔bearish cite at least {flip}.\n"
    "- Dealbreakers listed under the prior are binding.\n"
    "- Speak in your desk's reasoning style but in plain English; no impersonation, catchphrases, or first-person biography.\n"
    "- The invalidation must be specific and observable (a metric crossing a level, a price, an event).\n"
    "Return JSON only."
)

HUMAN_PROMPT = (
    "Ticker: {ticker}\n"
    "Last close: {price}\n"
    "Desk fair value range: {fair_value}\n\n"
    "Evidence ledger:\n{ledger}\n\n"
    "Factor scores:\n{factors}\n\n"
    "Desk prior: {prior_signal} at {prior_conf:.0f} confidence (score {prior_score:+.2f}, coverage {coverage:.0%}).\n"
    "Biggest contributions: {contributions}\n"
    "Dealbreakers tripped: {tripped}\n"
    "Default horizon: {horizon} months.\n\n"
    "Return exactly:\n"
    "{{\n"
    '  "signal": "bullish" | "bearish" | "neutral",\n'
    '  "confidence": number,\n'
    '  "headline": "string",\n'
    '  "thesis": "string",\n'
    '  "cited": ["F01", ...],\n'
    '  "risk": "string",\n'
    '  "invalidation": "string",\n'
    '  "time_horizon_months": int,\n'
    '  "price_target": number | null\n'
    "}}"
)


def apply_guardrails(
    verdict: LensVerdict,
    prior: DeskPrior,
    ledger: EvidenceLedger,
    lens: Lens,
) -> tuple[LensVerdict, list[str]]:
    """Clamp an LLM verdict back inside the desk's rules. Returns (verdict, notes)."""
    notes: list[str] = []
    valid_ids = ledger.fact_ids()
    cited = [c.strip().upper() for c in verdict.cited if c and c.strip().upper() in valid_ids]
    dropped = [c for c in verdict.cited if c and c.strip().upper() not in valid_ids]
    if dropped:
        notes.append(f"Dropped unknown citations: {', '.join(dropped[:5])}")
    cited = list(dict.fromkeys(cited))

    signal: Signal = verdict.signal if verdict.signal in ("bullish", "bearish", "neutral") else prior.signal
    steps = _signal_distance(prior.signal, signal)
    needed = CITES_TO_FLIP if steps == 2 else CITES_TO_SHIFT_ONE_STEP if steps == 1 else 0
    if steps and len(cited) < needed:
        notes.append(f"Kept desk call {prior.signal}: moving to {signal} needs {needed} citations, got {len(cited)}")
        signal = prior.signal
    if prior.forced_bearish and signal != "bearish":
        notes.append("Dealbreaker forces bearish")
        signal = "bearish"
    if prior.tripped and signal == "bullish" and not prior.forced_bearish:
        notes.append("Dealbreaker caps call at neutral")
        signal = "neutral"

    low = max(5.0, prior.confidence - MAX_CONFIDENCE_SHIFT)
    high = min(95.0, prior.confidence + MAX_CONFIDENCE_SHIFT)
    confidence = max(low, min(high, float(verdict.confidence)))
    if confidence != verdict.confidence:
        notes.append(f"Confidence clamped to {confidence:.0f} (prior {prior.confidence:.0f} ±{MAX_CONFIDENCE_SHIFT})")

    target = verdict.price_target
    price = ledger.price
    if price:
        if target is None or target <= 0:
            target = desk_price_target(ledger, lens, signal)
        else:
            if ledger.fair_value:
                fv = ledger.fair_value
                target = max(min(fv["low"], price) * 0.8, min(max(fv["high"], price) * 1.25, target))
            target = round(_directional(target, price, signal), 2)

    return (
        verdict.model_copy(
            update={
                "signal": signal,
                "confidence": round(confidence, 1),
                "cited": cited,
                "price_target": target,
            }
        ),
        notes,
    )


def _signal_distance(a: Signal, b: Signal) -> int:
    order = {"bearish": 0, "neutral": 1, "bullish": 2}
    return abs(order.get(a, 1) - order.get(b, 1))


def fallback_verdict(ticker: str, prior: DeskPrior, ledger: EvidenceLedger, lens: Lens) -> LensVerdict:
    """Used when the LLM fails — the desk still reports its numbers."""
    top = sorted(prior.contributions.items(), key=lambda kv: -abs(kv[1]))[:3]
    drivers = ", ".join(f"{FACTOR_LABELS[k].lower()} {v:+.2f}" for k, v in top) or "thin data"
    cited: list[str] = []
    for name, _ in top:
        fs = ledger.factors.get(name)
        if fs:
            cited.extend(fs.drivers[:1])
    return LensVerdict(
        signal=prior.signal,
        confidence=prior.confidence,
        headline=f"{prior.signal.capitalize()} on {ticker} from the desk model: {drivers}.",
        thesis=f"Desk model only (no narrative). Weighted factor score {prior.score:+.2f} at {prior.coverage:.0%} coverage; drivers: {drivers}.",
        cited=cited,
        risk="; ".join(prior.tripped) or "Model-only view; no qualitative check.",
        invalidation="Factor score crossing back through ±0.15.",
        time_horizon_months=lens.horizon_months,
        price_target=None,
    )


def compose_reasoning(verdict: LensVerdict, prior: DeskPrior, ledger: EvidenceLedger, notes: list[str]) -> str:
    facts = {f.id: f for f in ledger.facts}
    evidence = "; ".join(f"{fid} {facts[fid].label} {facts[fid].display()}" for fid in verdict.cited if fid in facts)
    parts = [verdict.thesis.strip()]
    if evidence:
        parts.append(f"Evidence: {evidence}.")
    if verdict.risk:
        parts.append(f"Risk: {verdict.risk.strip()}")
    if verdict.invalidation:
        parts.append(f"Would change my mind: {verdict.invalidation.strip()}")
    parts.append(
        f"Desk prior: {prior.signal} {prior.confidence:.0f} (score {prior.score:+.2f}, coverage {prior.coverage:.0%})."
    )
    if prior.tripped:
        parts.append("Dealbreakers: " + "; ".join(prior.tripped) + ".")
    if notes:
        parts.append("Guardrails: " + "; ".join(notes) + ".")
    return "\n\n".join(parts)


def run_lens_agent(
    state: AgentState,
    agent_id: str,
    lens: Lens,
    display_name: str,
    *,
    with_artifacts: bool = True,
    with_sub_agents: bool = True,
) -> dict[str, Any]:
    data = state["data"]
    tickers = data["tickers"]
    signals: dict[str, dict[str, Any]] = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Reading evidence ledger")
        ledger = get_evidence(state, ticker)
        prior = compute_prior(ledger, lens)
        progress.update_status(
            agent_id,
            ticker,
            f"Desk prior {prior.signal} {prior.confidence:.0f} — writing thesis",
        )

        analysis = {
            "ticker": ticker,
            "lens": lens.key,
            "prior": prior.to_dict(),
            "factors": {k: v.to_dict() for k, v in ledger.factors.items()},
            "fair_value": ledger.fair_value,
            "score": round((prior.score + 1) * 5, 2),
            "max_score": 10,
        }
        chart_ctx = {
            "ticker": ticker,
            "end_date": data.get("end_date"),
            "metrics": ledger.raw.get("metrics") or [],
            "line_items": ledger.raw.get("line_items") or [],
            "market_cap": ledger.raw.get("market_cap"),
            "prices": ledger.raw.get("prices") or [],
            "news": ledger.raw.get("news") or [],
            "insider_trades": ledger.raw.get("insider_trades") or [],
            "macro": data.get("macro_context") or {},
        }

        subagent_bundle = None
        if with_sub_agents:
            try:
                from src.utils.sub_agents import delegate_sub_agents

                subagent_bundle = delegate_sub_agents(
                    parent_agent_id=agent_id,
                    parent_name=display_name,
                    ticker=ticker,
                    parent_analysis=analysis,
                    chart_ctx=chart_ctx,
                    state=state,
                )
            except Exception as exc:
                progress.update_status(agent_id, ticker, f"Sub-agents skipped: {exc}")

        verdict = _ask_llm(state, agent_id, ticker, lens, display_name, ledger, prior, subagent_bundle)
        verdict, notes = apply_guardrails(verdict, prior, ledger, lens)
        reasoning = compose_reasoning(verdict, prior, ledger, notes)

        artifacts: list[dict[str, Any]] = []
        if with_artifacts:
            try:
                from src.utils.agent_artifacts import attach_artifacts

                artifacts = attach_artifacts(
                    agent_id=agent_id,
                    investor_name=display_name,
                    ticker=ticker,
                    state=state,
                    metrics_ctx=chart_ctx,
                    reasoning_payload=analysis,
                )
            except Exception as exc:
                progress.update_status(agent_id, ticker, f"Chart render skipped: {exc}")

        subagent_progress = subagent_bundle["progress"] if subagent_bundle else None
        headline = verdict.headline.strip() or f"{verdict.signal.upper()} on {ticker}."
        summary = finish_investor_ticker(
            agent_id,
            ticker,
            verdict.signal,
            verdict.confidence,
            reasoning,
            state,
            artifacts=artifacts,
            time_horizon_months=verdict.time_horizon_months or lens.horizon_months,
            price_target=verdict.price_target,
            current_price=ledger.price,
            subagent_progress=subagent_progress,
            thesis_summary=headline,
        )

        entry = {
            "signal": verdict.signal,
            "confidence": verdict.confidence,
            "reasoning": reasoning,
            "thesis_summary": summary,
            "cited": verdict.cited,
            "desk_prior": prior.to_dict(),
            "guardrails": notes,
        }
        if subagent_progress:
            entry["subagents"] = subagent_progress["subagents"]
            entry["subagent_results"] = subagent_progress["subagent_results"]
        merge_finish_outlook(entry, state, agent_id, ticker, thesis_summary=summary)
        if artifacts:
            entry["artifacts"] = artifacts
        signals[ticker] = entry

        # Keep the extra lens fields on the shared signal bucket too.
        bucket = state["data"].setdefault("analyst_signals", {}).setdefault(agent_id, {})
        if isinstance(bucket.get(ticker), dict):
            bucket[ticker].update({"cited": verdict.cited, "desk_prior": prior.to_dict(), "guardrails": notes})

    message = HumanMessage(content=json.dumps(signals, default=str), name=agent_id)
    if state["metadata"].get("show_reasoning"):
        show_agent_reasoning(signals, display_name)
    state["data"]["analyst_signals"][agent_id] = signals
    progress.update_status(agent_id, None, "Done")
    return {"messages": [message], "data": state["data"]}


def _ask_llm(
    state: AgentState,
    agent_id: str,
    ticker: str,
    lens: Lens,
    display_name: str,
    ledger: EvidenceLedger,
    prior: DeskPrior,
    subagent_bundle: dict[str, Any] | None,
) -> LensVerdict:
    contributions = ", ".join(
        f"{FACTOR_LABELS[k]} {v:+.2f}" for k, v in sorted(prior.contributions.items(), key=lambda kv: -abs(kv[1]))[:4]
    ) or "none"
    fv = ledger.fair_value
    human = HUMAN_PROMPT
    if subagent_bundle and subagent_bundle.get("briefs"):
        human = "Delegated specialist briefs:\n{briefs}\n\n" + human
    template = ChatPromptTemplate.from_messages([("system", SYSTEM_PROMPT), ("human", human)])
    prompt = template.invoke(
        {
            "name": display_name,
            "creed": lens.creed,
            "shift": MAX_CONFIDENCE_SHIFT,
            "one_step": CITES_TO_SHIFT_ONE_STEP,
            "flip": CITES_TO_FLIP,
            "ticker": ticker,
            "price": f"${ledger.price:,.2f}" if ledger.price else "unknown",
            "fair_value": f"${fv['low']:,.2f} – ${fv['high']:,.2f} (mid ${fv['mid']:,.2f})" if fv else "unavailable",
            "ledger": ledger.as_table(),
            "factors": ledger.factor_table(),
            "prior_signal": prior.signal,
            "prior_conf": prior.confidence,
            "prior_score": prior.score,
            "coverage": prior.coverage,
            "contributions": contributions,
            "tripped": "; ".join(prior.tripped) or "none",
            "horizon": lens.horizon_months,
            "briefs": json.dumps((subagent_bundle or {}).get("briefs"), default=str)[:3000],
        }
    )
    return call_llm(
        prompt=prompt,
        pydantic_model=LensVerdict,
        agent_name=agent_id,
        state=state,
        default_factory=lambda: fallback_verdict(ticker, prior, ledger, lens),
    )
