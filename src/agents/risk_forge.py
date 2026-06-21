"""Stage 1 — brainstorm risk inventory per ticker."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from src.graph.state import AgentState
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.risk_pipeline import (
    MAX_RISKS_PER_TICKER,
    RISK_FORGE_ID,
    ensure_risk_bucket,
    risk_pipeline_enabled,
    slug_risk_id,
    tier0_context_snippet,
)
from src.utils.interactive_artifacts import build_risk_inventory_heatmap


class RiskItem(BaseModel):
    title: str = Field(description="Short risk headline")
    category: str = Field(
        description="geopolitical|macro|supply_chain|competition|technology|regulatory|financial|demand"
    )
    tags: list[str] = Field(default_factory=list)


class RiskInventory(BaseModel):
    risks: list[RiskItem] = Field(description="8-12 distinct risks")


def risk_forge_node(state: AgentState) -> dict[str, Any]:
    if not risk_pipeline_enabled(state):
        progress.update_status(RISK_FORGE_ID, None, "Skipped (RISK_PIPELINE=0)")
        return {"data": {}}

    data = state["data"]
    tickers = data.get("tickers") or []
    pipeline: dict[str, Any] = data.setdefault("risk_pipeline", {})

    for ticker in tickers:
        key = ticker.strip().upper()
        progress.update_status(RISK_FORGE_ID, key, "Brainstorming risk inventory")

        template = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are the Risk Forge desk. List concrete, company-specific risks "
                    "investors might miss. No scoring yet — titles only. English only. JSON only.",
                ),
                (
                    "human",
                    "Ticker: {ticker}\n\n"
                    "Desk context:\n{context}\n\n"
                    "Return {max_risks} distinct risks with category and tags.",
                ),
            ]
        )

        def default() -> RiskInventory:
            return RiskInventory(
                risks=[
                    RiskItem(
                        title=f"Demand slowdown pressures {key} growth",
                        category="demand",
                        tags=["demand", "growth"],
                    )
                ]
            )

        prompt = template.invoke(
            {
                "ticker": key,
                "context": tier0_context_snippet(state, key) or "(early run — limited context)",
                "max_risks": MAX_RISKS_PER_TICKER,
            }
        )
        out: RiskInventory = call_llm(
            prompt=prompt,
            pydantic_model=RiskInventory,
            agent_name=RISK_FORGE_ID,
            state=state,
            default_factory=default,
            stream=False,
        )

        bucket = ensure_risk_bucket(state, key)
        seen: set[str] = set()
        inventory: list[dict[str, Any]] = []
        for item in out.risks[:MAX_RISKS_PER_TICKER]:
            rid = slug_risk_id(item.title)
            if rid in seen:
                rid = f"{rid}_{len(seen)}"
            seen.add(rid)
            inventory.append(
                {
                    "id": rid,
                    "title": item.title.strip(),
                    "category": item.category.strip().lower(),
                    "tags": item.tags[:6],
                    "source": RISK_FORGE_ID,
                }
            )
        bucket["inventory"] = inventory
        pipeline[key] = bucket

        heatmap = build_risk_inventory_heatmap(key, inventory)
        progress.update_status(
            RISK_FORGE_ID,
            key,
            "Done",
            analysis=json.dumps({"inventory": inventory, "artifacts": [heatmap]}, default=str),
        )

    progress.update_status(
        RISK_FORGE_ID,
        None,
        f"Risk inventory ready for {len(tickers)} ticker(s)",
    )
    return {"data": {"risk_pipeline": pipeline}}
