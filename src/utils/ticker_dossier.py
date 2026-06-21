"""Per-ticker knowledge dossier: facts, agent claims, and auto-detected disputes."""

from __future__ import annotations

from typing import Any

from src.graph.state import AgentState
from src.utils.data_feed_keys import DATA_FEED_KEYS, TIER0_DESK_NAMES
from src.utils.tier0_briefing import extract_base_agent_key

_BEARISH = frozenset({"bearish"})
_BULLISH = frozenset({"bullish"})
_SIGNALS = _BULLISH | _BEARISH | frozenset({"neutral"})

_DISPUTE_MIN_CONFIDENCE = 45.0


def _empty_dossier() -> dict[str, list[dict[str, Any]]]:
    return {"facts": [], "claims": [], "disputes": []}


def _norm_ticker(ticker: str) -> str:
    return (ticker or "").strip().upper()


def _norm_signal(signal: str | None) -> str:
    sig = str(signal or "neutral").lower()
    return sig if sig in _SIGNALS else "neutral"


def ensure_dossier(state: AgentState | dict[str, Any], ticker: str) -> dict[str, list[dict[str, Any]]]:
    data = state.get("data") if isinstance(state, dict) else state["data"]
    dossiers = data.setdefault("ticker_dossiers", {})
    key = _norm_ticker(ticker)
    if key not in dossiers:
        dossiers[key] = _empty_dossier()
    return dossiers[key]


def get_dossier(state: AgentState | dict[str, Any] | None, ticker: str) -> dict[str, list[dict[str, Any]]]:
    if not state:
        return _empty_dossier()
    data = state.get("data") if isinstance(state, dict) else state["data"]
    dossiers = data.get("ticker_dossiers") or {}
    return dossiers.get(_norm_ticker(ticker)) or _empty_dossier()


def _next_id(prefix: str, items: list[dict[str, Any]]) -> str:
    return f"{prefix}_{len(items)}"


def add_fact(
    dossier: dict[str, list[dict[str, Any]]],
    *,
    kind: str,
    label: str,
    value: Any,
    source: str,
    detail: str | None = None,
) -> str:
    fact_id = _next_id("fact", dossier["facts"])
    dossier["facts"].append(
        {
            "id": fact_id,
            "kind": kind,
            "label": label,
            "value": value,
            "source": extract_base_agent_key(source),
            "detail": (detail or "")[:500] or None,
        }
    )
    return fact_id


def _facts_from_reasoning(
    dossier: dict[str, list[dict[str, Any]]],
    *,
    source: str,
    reasoning: Any,
) -> list[str]:
    if not isinstance(reasoning, dict):
        return []

    ids: list[str] = []
    for pillar, block in reasoning.items():
        if pillar == "sec_earnings" and isinstance(block, dict):
            for key, label in (
                ("eps", "SEC EPS"),
                ("revenue", "SEC revenue"),
                ("revenue_yoy_pct", "SEC revenue YoY %"),
                ("eps_yoy_pct", "SEC EPS YoY %"),
                ("management_tone", "Management tone"),
            ):
                val = block.get(key)
                if val is not None and val != "":
                    ids.append(
                        add_fact(
                            dossier,
                            kind="sec_metric",
                            label=label,
                            value=val,
                            source=source,
                        )
                    )
            continue

        if not isinstance(block, dict):
            continue
        sig = block.get("signal")
        details = block.get("details") or block.get("detail")
        if sig is None and details is None:
            continue
        ids.append(
            add_fact(
                dossier,
                kind="pillar",
                label=str(pillar).replace("_", " "),
                value=_norm_signal(str(sig) if sig is not None else "neutral"),
                source=source,
                detail=str(details) if details is not None else None,
            )
        )
    return ids


def ingest_tier0_into_dossiers(
    state: AgentState | dict[str, Any],
    tickers: list[str],
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    """Seed dossiers from completed Tier-0 desk signals (idempotent per run)."""
    data = state.get("data") if isinstance(state, dict) else state["data"]
    signals = data.get("analyst_signals") or {}
    out: dict[str, dict[str, list[dict[str, Any]]]] = {}

    for ticker in tickers:
        key = _norm_ticker(ticker)
        dossier = ensure_dossier(state, key)
        # Replace tier-0 facts on each gate pass; keep investor claims/disputes.
        dossier["facts"] = [
            f for f in dossier["facts"] if f.get("kind") not in {"desk_signal", "pillar", "sec_metric"}
        ]
        fact_ids: list[str] = []

        for agent_id, per_ticker in signals.items():
            base = extract_base_agent_key(agent_id)
            if base not in DATA_FEED_KEYS or not isinstance(per_ticker, dict):
                continue
            payload = per_ticker.get(key) or per_ticker.get(ticker)
            if not isinstance(payload, dict):
                continue

            desk = TIER0_DESK_NAMES.get(base, base.replace("_", " ").title())
            summary = payload.get("thesis_summary") or payload.get("reasoning") or ""
            if isinstance(summary, dict):
                summary = str(summary)
            summary = str(summary).strip()
            if len(summary) > 400:
                summary = summary[:397] + "..."

            fact_ids.append(
                add_fact(
                    dossier,
                    kind="desk_signal",
                    label=desk,
                    value=_norm_signal(payload.get("signal")),
                    source=agent_id,
                    detail=summary or None,
                )
            )
            fact_ids.extend(
                _facts_from_reasoning(dossier, source=agent_id, reasoning=payload.get("reasoning"))
            )

        out[key] = dossier
    return out


def record_ticker_claim(
    state: AgentState,
    *,
    agent_id: str,
    ticker: str,
    signal: str,
    confidence: float | int,
    text: str,
    supports: list[str] | None = None,
    contradicts: list[str] | None = None,
) -> str:
    """Register an agent thesis claim and refresh dispute edges."""
    dossier = ensure_dossier(state, ticker)
    conf = float(confidence)
    base = extract_base_agent_key(agent_id)

    if supports is None:
        supports = [f["id"] for f in dossier["facts"] if f.get("kind") == "desk_signal"]

    claim_id = _next_id("claim", dossier["claims"])
    dossier["claims"].append(
        {
            "id": claim_id,
            "agent": base,
            "signal": _norm_signal(signal),
            "confidence": conf,
            "text": (text or "").strip()[:1200],
            "supports": list(supports),
            "contradicts": list(contradicts or []),
        }
    )
    recompute_disputes(dossier)
    return claim_id


def claim_ids_for_signal(
    state: AgentState | dict[str, Any],
    ticker: str,
    signal: str,
    *,
    min_confidence: float = _DISPUTE_MIN_CONFIDENCE,
    exclude_agent: str | None = None,
) -> list[str]:
    dossier = get_dossier(state, ticker)
    exclude = extract_base_agent_key(exclude_agent) if exclude_agent else None
    target = _norm_signal(signal)
    ids: list[str] = []
    for claim in dossier["claims"]:
        if exclude and claim.get("agent") == exclude:
            continue
        if _norm_signal(claim.get("signal")) != target:
            continue
        if float(claim.get("confidence") or 0) < min_confidence:
            continue
        cid = claim.get("id")
        if isinstance(cid, str):
            ids.append(cid)
    return ids


def recompute_disputes(dossier: dict[str, list[dict[str, Any]]]) -> None:
    """Detect signal conflicts and explicit contradict edges."""
    disputes: list[dict[str, Any]] = []
    claims = dossier.get("claims") or []

    bullish: list[str] = []
    bearish: list[str] = []
    for claim in claims:
        if float(claim.get("confidence") or 0) < _DISPUTE_MIN_CONFIDENCE:
            continue
        agent = str(claim.get("agent") or "")
        cid = claim.get("id")
        if not isinstance(cid, str):
            continue
        sig = _norm_signal(claim.get("signal"))
        if sig == "bullish":
            bullish.append(agent)
        elif sig == "bearish":
            bearish.append(agent)

    if bullish and bearish:
        disputes.append(
            {
                "id": _next_id("dispute", disputes),
                "kind": "signal_conflict",
                "bullish": sorted(set(bullish)),
                "bearish": sorted(set(bearish)),
                "summary": (
                    f"Bull/bear split: {', '.join(sorted(set(bullish)))} vs "
                    f"{', '.join(sorted(set(bearish)))}"
                ),
            }
        )

    for claim in claims:
        targets = claim.get("contradicts") or []
        if not targets:
            continue
        agent = str(claim.get("agent") or "")
        opposed = [
            c.get("agent")
            for c in claims
            if c.get("id") in targets and c.get("agent") != agent
        ]
        if opposed:
            disputes.append(
                {
                    "id": _next_id("dispute", disputes),
                    "kind": "explicit_contradiction",
                    "from_agent": agent,
                    "targets": sorted({str(a) for a in opposed if a}),
                    "summary": f"{agent} explicitly challenges {', '.join(sorted({str(a) for a in opposed if a}))}",
                }
            )

    for claim in claims:
        base = str(claim.get("agent") or "")
        if base in DATA_FEED_KEYS:
            continue
        if claim.get("supports"):
            continue
        if float(claim.get("confidence") or 0) < _DISPUTE_MIN_CONFIDENCE:
            continue
        disputes.append(
            {
                "id": _next_id("dispute", disputes),
                "kind": "ungrounded_claim",
                "agent": base,
                "summary": f"{base} thesis cites no Tier-0 desk facts",
            }
        )

    dossier["disputes"] = disputes


def dossier_prompt_block(state: AgentState | dict[str, Any] | None, ticker: str) -> str:
    """Compact markdown for Tier-1 LLM context."""
    dossier = get_dossier(state, ticker)
    facts = dossier.get("facts") or []
    claims = dossier.get("claims") or []
    disputes = dossier.get("disputes") or []
    if not facts and not claims:
        return ""

    lines = [f"### { _norm_ticker(ticker) } — ticker dossier"]
    if facts:
        lines.append("**Verified desk facts**")
        for f in facts[:14]:
            detail = f" — {f['detail']}" if f.get("detail") else ""
            lines.append(f"- [{f['id']}] {f['label']}: {f['value']}{detail}")
    if claims:
        lines.append("**Peer claims on record**")
        for c in claims[-10:]:
            lines.append(
                f"- {c.get('agent')} ({c.get('signal')}, {c.get('confidence'):.0f}%): "
                f"{(c.get('text') or '')[:180]}"
            )
    if disputes:
        lines.append("**Open disputes**")
        for d in disputes[:6]:
            lines.append(f"- {d.get('summary')}")
    return "\n".join(lines)


def compact_dossier(dossier: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """UI-friendly slice (counts + dispute headlines)."""
    return {
        "fact_count": len(dossier.get("facts") or []),
        "claim_count": len(dossier.get("claims") or []),
        "dispute_count": len(dossier.get("disputes") or []),
        "facts": dossier.get("facts") or [],
        "claims": dossier.get("claims") or [],
        "disputes": dossier.get("disputes") or [],
    }
