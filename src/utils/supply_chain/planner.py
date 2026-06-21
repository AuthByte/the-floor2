"""Plan, validate, and fall back supply chain graphs."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from src.llm.models import ModelProvider, get_model
from src.utils.agent_artifacts.plan import PLANNER_MODEL, _api_keys
from src.utils.supply_chain.models import SupplyChainGraphModel
from src.utils.supply_chain.seeds import seed_graph_for_ticker
from src.utils.supply_chain.seeds import _generic as generic_seed
from src.utils.supply_chain.validate import analyze_graph_structure, sanitize_graph

logger = logging.getLogger(__name__)

_GRAPH_SOURCE_SEED = "seed"
_GRAPH_SOURCE_LLM = "llm"
_GRAPH_SOURCE_GENERIC = "generic"


def plan_supply_chain_graph(
    *,
    ticker: str,
    company_context: str,
    state: Any | None,
) -> SupplyChainGraphModel | None:
    """LLM plan → sanitize → retry; seed or generic fallback on failure."""
    key = ticker.strip().upper()
    context = (company_context or "")[:4500]

    model = _invoke_planner(ticker=key, context=context, state=state, strict=False)
    if model:
        try:
            return sanitize_graph(model, key)
        except Exception as exc:
            logger.warning("supply chain sanitize failed (attempt 1): %s", exc)

    model = _invoke_planner(ticker=key, context=context, state=state, strict=True)
    if model:
        try:
            return sanitize_graph(model, key)
        except Exception as exc:
            logger.warning("supply chain sanitize failed (attempt 2): %s", exc)

    seed = seed_graph_for_ticker(key)
    if seed:
        logger.info("supply chain using curated seed for %s", key)
        return sanitize_graph(seed, key)

    logger.info("supply chain using generic scaffold for %s", key)
    return sanitize_graph(generic_seed(key), key)


def build_supply_chain_graph(
    *,
    ticker: str,
    company_context: str,
    state: Any | None,
) -> tuple[SupplyChainGraphModel, dict[str, Any]]:
    """Return graph plus metadata (source, structure metrics)."""
    key = ticker.strip().upper()
    context = (company_context or "")[:4500]

    source = _GRAPH_SOURCE_GENERIC
    raw = _invoke_planner(ticker=key, context=context, state=state, strict=False)
    if raw:
        source = _GRAPH_SOURCE_LLM
    else:
        raw = _invoke_planner(ticker=key, context=context, state=state, strict=True)
        if raw:
            source = _GRAPH_SOURCE_LLM

    if raw:
        try:
            graph = sanitize_graph(raw, key)
        except Exception:
            graph = None
    else:
        graph = None

    if graph is None:
        seed = seed_graph_for_ticker(key)
        if seed:
            graph = sanitize_graph(seed, key)
            source = _GRAPH_SOURCE_SEED
        else:
            graph = sanitize_graph(generic_seed(key), key)
            source = _GRAPH_SOURCE_GENERIC

    structure = analyze_graph_structure(graph.nodes, graph.edges, key)
    meta = {
        "graph_source": source,
        "structure": structure,
    }
    return graph, meta


def _invoke_planner(
    *,
    ticker: str,
    context: str,
    state: Any | None,
    strict: bool,
) -> SupplyChainGraphModel | None:
    min_nodes = 8 if strict else 4
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You map corporate supply chains for investors. Build a realistic multi-tier "
                "network: upstream suppliers (negative tier), focal company (tier 0), downstream "
                "customers/partners (positive tier). Include materials, geographies, and competitors "
                "where relevant. Use real company names when confident. Every edge must reference "
                "valid node ids. JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\n\nContext:\n{context}\n\n"
                "Return {min_nodes}-22 nodes and 8-35 edges. Tier -3 = raw materials, -2/-1 = "
                "suppliers, 0 = focal (id should match ticker slug), +1/+2 = customers. "
                "Flag single-source risks in concentration_risks. "
                "Focal node role must be 'focal' at tier 0.",
            ),
        ]
    )
    prompt = template.invoke({"ticker": ticker, "context": context, "min_nodes": min_nodes})
    try:
        llm = get_model(PLANNER_MODEL, ModelProvider.OPENROUTER.value, _api_keys(state))
        structured = llm.with_structured_output(SupplyChainGraphModel, method="json_mode")
        out: SupplyChainGraphModel = structured.invoke(prompt)
        if out.nodes and out.edges:
            return out
    except Exception as exc:
        logger.warning("supply chain planner failed (strict=%s): %s", strict, exc)
    return None


def graph_to_artifact(model: SupplyChainGraphModel, *, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    structure = (meta or {}).get("structure")
    if not structure:
        structure = analyze_graph_structure(model.nodes, model.edges, model.focal_ticker)
    return {
        "id": "supply_chain_graph",
        "title": model.title,
        "caption": model.caption,
        "kind": "supply_chain_graph",
        "graph": {
            "focal_ticker": model.focal_ticker,
            "nodes": [n.model_dump() for n in model.nodes],
            "edges": [e.model_dump() for e in model.edges],
            "concentration_risks": model.concentration_risks,
            "graph_source": (meta or {}).get("graph_source"),
            "structure": structure,
        },
    }
