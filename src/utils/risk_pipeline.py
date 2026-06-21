"""Risk discovery pipeline — state helpers, routing, and briefings."""

from __future__ import annotations

import os
import re
from typing import Any

from src.graph.state import AgentState
from src.utils.tier0_briefing import extract_base_agent_key, tier0_briefing_for_ticker

RISK_FORGE_ID = "risk_forge"
RISK_RESEARCH_HUB_ID = "risk_research_hub"
SCENARIO_LAB_ID = "scenario_lab"
RISK_WATCHTOWER_ID = "risk_watchtower"

MAX_RISKS_PER_TICKER = 12
MAX_RESEARCH_RISKS = 8
MAX_SCENARIOS = 5

RISK_CATEGORIES = frozenset(
    {
        "geopolitical",
        "macro",
        "supply_chain",
        "competition",
        "technology",
        "regulatory",
        "financial",
        "demand",
    }
)

CATEGORY_TO_SPECIALISTS: dict[str, list[str]] = {
    "geopolitical": ["china_geopolitical", "macro_cycle"],
    "macro": ["macro_cycle"],
    "supply_chain": ["supply_chain", "china_geopolitical"],
    "competition": ["competition"],
    "technology": ["technology", "competition"],
    "regulatory": ["regulatory", "macro_cycle"],
    "financial": ["macro_cycle", "regulatory"],
    "demand": ["macro_cycle", "competition"],
}

SPECIALIST_LABELS: dict[str, str] = {
    "china_geopolitical": "China & Geopolitical",
    "macro_cycle": "Macro Cycle",
    "supply_chain": "Supply Chain",
    "competition": "Competition",
    "technology": "Technology Disruption",
    "regulatory": "Regulatory",
}


def risk_pipeline_enabled(state: AgentState | None = None) -> bool:
    flag = os.environ.get("RISK_PIPELINE", "1").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if state:
        request = state.get("metadata", {}).get("request")
        if request is not None and getattr(request, "run_risk_pipeline", True) is False:
            return False
    return True


def empty_ticker_risk() -> dict[str, Any]:
    return {
        "inventory": [],
        "research": {},
        "scenarios": [],
        "monitoring": {},
    }


def ensure_risk_bucket(state: AgentState, ticker: str) -> dict[str, Any]:
    data = state["data"]
    pipeline = data.setdefault("risk_pipeline", {})
    key = ticker.strip().upper()
    if key not in pipeline:
        pipeline[key] = empty_ticker_risk()
    return pipeline[key]


def get_risk_pipeline(state: AgentState | dict[str, Any] | None) -> dict[str, Any]:
    if not state:
        return {}
    data = state.get("data") if isinstance(state, dict) else state["data"]
    return data.get("risk_pipeline") or {}


def slug_risk_id(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:40]
    return f"risk_{base or 'item'}"


def tier0_context_snippet(state: AgentState, ticker: str) -> str:
    signals = state.get("data", {}).get("analyst_signals") or {}
    lines: list[str] = []
    for agent_id, bucket in signals.items():
        if not isinstance(bucket, dict):
            continue
        row = bucket.get(ticker.upper()) or bucket.get(ticker)
        if not isinstance(row, dict):
            continue
        base = extract_base_agent_key(agent_id)
        sig = row.get("signal", "neutral")
        conf = row.get("confidence")
        summary = row.get("thesis_summary") or row.get("reasoning") or ""
        if isinstance(summary, dict):
            summary = str(summary)
        summary = str(summary).strip()[:280]
        conf_s = f" ({conf}%)" if conf is not None else ""
        lines.append(f"- {base}: {sig}{conf_s} — {summary}")
    return "\n".join(lines[:10])


def assign_specialists(category: str) -> list[str]:
    cat = category if category in RISK_CATEGORIES else "macro"
    return list(dict.fromkeys(CATEGORY_TO_SPECIALISTS.get(cat, ["macro_cycle"])))


def blended_scores(reports: dict[str, Any]) -> tuple[float, float]:
    probs: list[float] = []
    severities: list[float] = []
    for report in reports.values():
        if not isinstance(report, dict):
            continue
        p = report.get("probability_pct")
        s = report.get("severity_score")
        if p is not None:
            probs.append(float(p))
        if s is not None:
            severities.append(float(s))
    prob = sum(probs) / len(probs) if probs else 0.0
    sev = sum(severities) / len(severities) if severities else 0.0
    return round(prob, 1), round(sev, 2)


def risk_briefing_for_ticker(state: AgentState | dict[str, Any] | None, ticker: str) -> str:
    if not state:
        return ""
    key = ticker.strip().upper()
    bucket = get_risk_pipeline(state).get(key) or {}
    inventory = bucket.get("inventory") or []
    scenarios = bucket.get("scenarios") or []
    if not inventory and not scenarios:
        return ""

    lines = [f"### {key} — risk discovery register"]
    if inventory:
        lines.append("**Top risks identified**")
        for risk in inventory[:8]:
            title = risk.get("title", "")
            cat = risk.get("category", "")
            lines.append(f"- {title} ({cat})")

    research = bucket.get("research") or {}
    if research:
        lines.append("**Researched scores**")
        for risk_id, block in list(research.items())[:6]:
            if not isinstance(block, dict):
                continue
            prob = block.get("blended_probability_pct")
            sev = block.get("blended_severity_score")
            title = next(
                (r.get("title") for r in inventory if r.get("id") == risk_id),
                risk_id,
            )
            lines.append(f"- {title}: P≈{prob}%, severity {sev}/10")

    if scenarios:
        lines.append("**Scenario impacts**")
        for sc in scenarios[:5]:
            impacts = sc.get("impacts") or {}
            lines.append(
                f"- {sc.get('title')}: P={sc.get('probability_pct')}% — "
                f"rev {impacts.get('revenue_pct')}%, EPS {impacts.get('eps_pct')}%, "
                f"DCF {impacts.get('dcf_pct')}%"
            )

    monitoring = bucket.get("monitoring") or {}
    if monitoring:
        lines.append("**Watchtower status**")
        for risk_id, mon in list(monitoring.items())[:5]:
            if not isinstance(mon, dict):
                continue
            title = next(
                (r.get("title") for r in inventory if r.get("id") == risk_id),
                risk_id,
            )
            lines.append(f"- {title}: {mon.get('status', 'unknown').upper()}")

    return "\n".join(lines)


def ingest_risk_into_dossiers(state: AgentState, tickers: list[str]) -> None:
    """Push risk facts into ticker dossiers for dispute detection."""
    try:
        from src.utils.ticker_dossier import add_fact, ensure_dossier
    except ImportError:
        return

    pipeline = get_risk_pipeline(state)
    for ticker in tickers:
        key = ticker.strip().upper()
        bucket = pipeline.get(key)
        if not bucket:
            continue
        dossier = ensure_dossier(state, key)
        dossier["facts"] = [
            f for f in dossier["facts"] if not str(f.get("kind", "")).startswith("risk")
        ]
        for risk in bucket.get("inventory") or []:
            add_fact(
                dossier,
                kind="risk",
                label=risk.get("title", "Risk"),
                value=risk.get("category", "macro"),
                source=RISK_FORGE_ID,
            detail=", ".join(risk.get("tags") or []) or None,
            )
        for sc in bucket.get("scenarios") or []:
            impacts = sc.get("impacts") or {}
            add_fact(
                dossier,
                kind="risk_scenario",
                label=sc.get("title", "Scenario"),
                value=f"P{sc.get('probability_pct')}%",
                source=SCENARIO_LAB_ID,
                detail=(
                    f"rev {impacts.get('revenue_pct')}%, eps {impacts.get('eps_pct')}%, "
                    f"dcf {impacts.get('dcf_pct')}%"
                ),
            )
