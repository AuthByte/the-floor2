"""Stage 2 — research hub with internal specialist subagents."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from langchain_core.messages import HumanMessage

from src.agents.risk_specialists.router import research_risk, route_specialists
from src.graph.state import AgentState
from src.utils.progress import progress
from src.utils.risk_pipeline import (
    MAX_RESEARCH_RISKS,
    RISK_RESEARCH_HUB_ID,
    blended_scores,
    ensure_risk_bucket,
    risk_pipeline_enabled,
)


def _research_one(
    state: AgentState,
    ticker: str,
    risk: dict[str, Any],
    specialist_id: str,
) -> tuple[str, str, dict[str, Any]]:
    report = research_risk(
        ticker=ticker,
        risk=risk,
        specialist_id=specialist_id,
        state=state,
        hub_agent_id=RISK_RESEARCH_HUB_ID,
    )
    return risk["id"], specialist_id, report


def risk_research_hub_node(state: AgentState) -> dict[str, Any]:
    if not risk_pipeline_enabled(state):
        progress.update_status(RISK_RESEARCH_HUB_ID, None, "Skipped")
        return {"data": {}}

    data = state["data"]
    tickers = data.get("tickers") or []
    pipeline: dict[str, Any] = data.get("risk_pipeline") or {}

    for ticker in tickers:
        key = ticker.strip().upper()
        bucket = ensure_risk_bucket(state, key)
        inventory = (bucket.get("inventory") or [])[:MAX_RESEARCH_RISKS]
        if not inventory:
            progress.update_status(RISK_RESEARCH_HUB_ID, key, "No risks to research")
            continue

        subagents: list[dict[str, Any]] = []
        research_map: dict[str, Any] = {}

        for risk in inventory:
            specialists = route_specialists(risk.get("category", "macro"))
            research_map[risk["id"]] = {
                "assigned_to": specialists,
                "reports": {},
            }
            for sid in specialists:
                subagents.append(
                    {
                        "id": sid,
                        "risk_id": risk["id"],
                        "status": "queued",
                        "title": risk.get("title"),
                    }
                )

        progress.update_status(
            RISK_RESEARCH_HUB_ID,
            key,
            "Dispatching specialists",
            analysis=json.dumps({"subagents": subagents, "reports": []}, default=str),
        )

        tasks: list[tuple[dict[str, Any], str]] = []
        for risk in inventory:
            for sid in route_specialists(risk.get("category", "macro")):
                tasks.append((risk, sid))

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {
                pool.submit(_research_one, state, key, risk, sid): (risk, sid)
                for risk, sid in tasks
            }
            for fut in as_completed(futures):
                risk, sid = futures[fut]
                try:
                    risk_id, specialist_id, report = fut.result()
                except Exception as exc:
                    risk_id, specialist_id = risk["id"], sid
                    report = {
                        "specialist": sid,
                        "summary": f"Research failed: {exc}",
                        "probability_pct": 15.0,
                        "severity": "medium",
                        "severity_score": 5.0,
                        "early_warnings": [],
                        "historical_examples": [],
                    }

                block = research_map[risk_id]
                block["reports"][specialist_id] = report
                prob, sev = blended_scores(block["reports"])
                block["blended_probability_pct"] = prob
                block["blended_severity_score"] = sev

                for sa in subagents:
                    if sa["risk_id"] == risk_id and sa["id"] == specialist_id:
                        sa["status"] = "done"

                progress.update_status(
                    RISK_RESEARCH_HUB_ID,
                    key,
                    f"Researching — {specialist_id}",
                    analysis=json.dumps(
                        {"subagents": subagents, "reports": list(research_map.values())},
                        default=str,
                    ),
                )

        bucket["research"] = research_map
        pipeline[key] = bucket
        progress.update_status(
            RISK_RESEARCH_HUB_ID,
            key,
            "Done",
            analysis=json.dumps(
                {"subagents": subagents, "reports": list(research_map.values())},
                default=str,
            ),
        )

    progress.update_status(RISK_RESEARCH_HUB_ID, None, "Risk research complete")
    message = HumanMessage(
        content=json.dumps({"stage": "research", "tickers": tickers}),
        name=RISK_RESEARCH_HUB_ID,
    )
    return {"messages": [message], "data": {"risk_pipeline": pipeline}}
