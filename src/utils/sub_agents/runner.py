"""Plan and execute sub-agent tasks for a parent desk."""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from src.graph.state import AgentState
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.sub_agents.registry import build_task_context, catalog_for_parent, spec_by_id
from src.utils.sub_agents.types import (
    SubAgentBrief,
    SubAgentPick,
    SubAgentPlan,
    SubAgentResult,
    SubAgentSpec,
    SubAgentStatus,
)

PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"
DEFAULT_MAX_TASKS = 2
DEFAULT_MAX_WORKERS = 3


def sub_agents_enabled() -> bool:
    return os.environ.get("SUB_AGENTS", "1").strip().lower() not in {"0", "false", "no"}


def max_sub_agents_per_ticker() -> int:
    raw = os.environ.get("MAX_SUB_AGENTS", str(DEFAULT_MAX_TASKS)).strip()
    try:
        return max(0, min(4, int(raw)))
    except ValueError:
        return DEFAULT_MAX_TASKS


def _progress_payload(
    statuses: list[SubAgentStatus],
    results: list[SubAgentResult],
) -> dict[str, Any]:
    return {
        "subagents": [s.as_dict() for s in statuses],
        "subagent_results": [r.as_dict() for r in results],
    }


def plan_sub_agents(
    *,
    parent_agent_id: str,
    parent_name: str,
    ticker: str,
    parent_analysis: dict[str, Any],
    state: AgentState,
    catalog: list[SubAgentSpec] | None = None,
    max_tasks: int | None = None,
) -> list[SubAgentPick]:
    """Ask the planner which sub-agents to spin up for this ticker."""
    cap = max_tasks if max_tasks is not None else max_sub_agents_per_ticker()
    if cap <= 0 or not catalog:
        catalog = catalog or catalog_for_parent(parent_agent_id)
    if cap <= 0 or not catalog:
        return []

    from src.llm.models import ModelProvider, get_model
    from src.utils.aux_model import resolve_aux_model

    options = "\n".join(f"- {s.id}: {s.label} — {s.description}" for s in catalog)
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You delegate focused sub-tasks for {parent_name}'s desk on {ticker}. "
                "Pick 0-{max_tasks} sub-agents from the catalog. Each needs a sharp task_focus. "
                "Skip sub-agents that would duplicate work already in parent_analysis. "
                "Return JSON only.",
            ),
            (
                "human",
                "Parent desk: {parent_name}\n"
                "Ticker: {ticker}\n\n"
                "Catalog:\n{options}\n\n"
                "Parent analysis preview:\n{preview}\n\n"
                'Return: {{"tasks": [{{"id": "peer_benchmark", "task_focus": "..."}}]}}',
            ),
        ]
    )
    preview = json.dumps(parent_analysis, default=str)[:2800]
    prompt = template.invoke(
        {
            "parent_name": parent_name,
            "ticker": ticker,
            "max_tasks": cap,
            "options": options,
            "preview": preview,
        }
    )

    allowed = {s.id for s in catalog}

    def default() -> SubAgentPlan:
        fallback = catalog[0]
        return SubAgentPlan(
            tasks=[
                SubAgentPick(
                    id=fallback.id,
                    task_focus=f"Quick {fallback.label.lower()} pass on {ticker}",
                )
            ]
        )

    try:
        request = state.get("metadata", {}).get("request")
        api_keys = request.api_keys if request and hasattr(request, "api_keys") else None
        aux_model, aux_provider = resolve_aux_model(state, PLANNER_MODEL)
        llm = get_model(aux_model, aux_provider, api_keys)
        structured = llm.with_structured_output(SubAgentPlan, method="json_mode")
        plan: SubAgentPlan = structured.invoke(prompt)
    except Exception:
        plan = default()

    picks: list[SubAgentPick] = []
    for task in plan.tasks:
        if task.id not in allowed:
            continue
        picks.append(task)
        if len(picks) >= cap:
            break
    return picks


def _run_one(
    *,
    pick: SubAgentPick,
    spec: SubAgentSpec,
    parent_agent_id: str,
    parent_name: str,
    ticker: str,
    task_ctx: dict[str, Any],
    state: AgentState,
) -> SubAgentResult:
    sub_id = f"{parent_agent_id}::{pick.id}"
    context_block = build_task_context(task_ctx)
    if spec.build_context:
        context_block = spec.build_context(task_ctx)

    template = ChatPromptTemplate.from_messages(
        [
            ("system", spec.system_prompt),
            (
                "human",
                "Parent desk: {parent_name}\n"
                "Ticker: {ticker}\n"
                "Delegated focus: {task_focus}\n\n"
                "Context (JSON):\n{context}\n\n"
                "Return summary, key_findings (3-5), confidence (0-100), data_gaps.",
            ),
        ]
    )

    def default() -> SubAgentBrief:
        return SubAgentBrief(
            summary=f"{spec.label} could not reach a firm conclusion on {ticker}.",
            key_findings=["Insufficient context for a differentiated view"],
            confidence=35.0,
            data_gaps=["Limited delegated context"],
        )

    prompt = template.invoke(
        {
            "parent_name": parent_name,
            "ticker": ticker,
            "task_focus": pick.task_focus,
            "context": context_block,
        }
    )
    out: SubAgentBrief = call_llm(
        prompt=prompt,
        pydantic_model=SubAgentBrief,
        agent_name=sub_id,
        state=state,
        default_factory=default,
        stream=False,
    )
    return SubAgentResult(
        id=pick.id,
        label=spec.label,
        task=pick.task_focus,
        summary=out.summary,
        key_findings=out.key_findings[:6],
        confidence=float(out.confidence),
        data_gaps=out.data_gaps[:4],
    )


def delegate_sub_agents(
    *,
    parent_agent_id: str,
    parent_name: str,
    ticker: str,
    parent_analysis: dict[str, Any],
    chart_ctx: dict[str, Any],
    state: AgentState,
    catalog: list[SubAgentSpec] | None = None,
) -> dict[str, Any] | None:
    """Plan and run sub-agents; stream progress on the parent agent channel.

    Returns a dict with ``statuses``, ``results``, and ``briefs`` for thesis synthesis,
    or None when sub-agents are disabled or nothing was delegated.
    """
    if not sub_agents_enabled():
        return None

    catalog = catalog or catalog_for_parent(parent_agent_id)
    picks = plan_sub_agents(
        parent_agent_id=parent_agent_id,
        parent_name=parent_name,
        ticker=ticker,
        parent_analysis=parent_analysis,
        state=state,
        catalog=catalog,
    )
    if not picks:
        return None

    statuses = [
        SubAgentStatus(id=p.id, label=spec_by_id(p.id).label if spec_by_id(p.id) else p.id, task=p.task_focus)
        for p in picks
    ]
    results: list[SubAgentResult] = []

    progress.update_status(
        parent_agent_id,
        ticker,
        "Delegating sub-agents",
        analysis=json.dumps(_progress_payload(statuses, results), default=str),
    )

    macro = state.get("data", {}).get("macro_context") or {}
    task_ctx = {
        **chart_ctx,
        "ticker": ticker,
        "parent_analysis": parent_analysis,
        "macro": macro,
    }

    workers = min(DEFAULT_MAX_WORKERS, len(picks))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {}
        for pick in picks:
            spec = spec_by_id(pick.id)
            if not spec:
                continue
            for st in statuses:
                if st.id == pick.id:
                    st.status = "running"
            progress.update_status(
                parent_agent_id,
                ticker,
                f"Sub-agent — {spec.label}",
                analysis=json.dumps(_progress_payload(statuses, results), default=str),
            )
            futures[
                pool.submit(
                    _run_one,
                    pick=pick,
                    spec=spec,
                    parent_agent_id=parent_agent_id,
                    parent_name=parent_name,
                    ticker=ticker,
                    task_ctx=task_ctx,
                    state=state,
                )
            ] = pick

        for fut in as_completed(futures):
            pick = futures[fut]
            try:
                result = fut.result()
            except Exception as exc:
                spec = spec_by_id(pick.id)
                result = SubAgentResult(
                    id=pick.id,
                    label=spec.label if spec else pick.id,
                    task=pick.task_focus,
                    summary=f"Sub-agent failed: {exc}",
                    error=str(exc),
                )
            results.append(result)
            for st in statuses:
                if st.id == pick.id:
                    st.status = "failed" if result.error else "done"
            progress.update_status(
                parent_agent_id,
                ticker,
                f"Sub-agent — {result.label}",
                analysis=json.dumps(_progress_payload(statuses, results), default=str),
            )

    briefs = [
        {
            "id": r.id,
            "label": r.label,
            "task": r.task,
            "summary": r.summary,
            "key_findings": r.key_findings,
            "confidence": r.confidence,
        }
        for r in results
    ]
    return {
        "statuses": statuses,
        "results": results,
        "briefs": briefs,
        "progress": _progress_payload(statuses, results),
    }
