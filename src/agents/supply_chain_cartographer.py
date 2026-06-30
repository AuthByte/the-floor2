"""Supply Chain Cartographer — maps multi-tier supply webs per ticker."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing_extensions import Literal

from src.agents._legendary_investor_utils import (
    LINE_ITEMS,
    clamp,
    signal_from_score,
)
from src.graph.state import AgentState, show_agent_reasoning
from src.tools.api import get_company_news, get_financial_metrics, get_market_cap, get_prices, search_line_items
from src.tools.providers.keys import keys_from_state
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.supply_chain_graph import (
    build_company_context,
    build_supply_chain_graph,
    graph_to_artifact,
)
from src.utils.thesis_outlook import ThesisOutlookFields, latest_close
from src.utils.thesis_verdict import finish_from_signal, merge_finish_outlook
from src.utils.tier1_fetch import tier0_briefings_ready


class CartographerSignal(ThesisOutlookFields):
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(ge=0, le=100)
    reasoning: str
    supply_resilience: str = Field(description="One sentence on supply chain resilience vs fragility")


def supply_chain_cartographer_agent(state: AgentState, agent_id: str = "supply_chain_cartographer_agent"):
    data = state["data"]
    tickers = data["tickers"]
    start_date = data["start_date"]
    end_date = data["end_date"]
    api_keys = keys_from_state(state)
    signals: dict[str, Any] = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Mapping supply network")
        metrics = get_financial_metrics(ticker, end_date, period="ttm", limit=6, api_key=api_keys)
        line_items = search_line_items(ticker, LINE_ITEMS, end_date, period="ttm", limit=6, api_key=api_keys)
        market_cap = get_market_cap(ticker, end_date, api_key=api_keys)
        prices = get_prices(ticker, start_date=start_date, end_date=end_date, api_key=api_keys)
        current_price = latest_close(prices)
        if tier0_briefings_ready(state):
            news = get_company_news(ticker, end_date, limit=25, api_key=api_keys)
        else:
            news = get_company_news(ticker, end_date, limit=40, api_key=api_keys)

        chart_ctx = {
            "ticker": ticker,
            "metrics": metrics,
            "line_items": line_items,
            "market_cap": market_cap,
            "prices": prices,
            "news": news,
        }
        analysis = analyze_supply_chain_metrics(chart_ctx)
        analysis["ticker"] = ticker

        progress.update_status(agent_id, ticker, "Building supply chain graph")
        company_context = build_company_context(chart_ctx, state=state, analysis=analysis)
        graph_model, graph_meta = build_supply_chain_graph(
            ticker=ticker,
            company_context=company_context,
            state=state,
        )
        structure = graph_meta.get("structure") or {}
        analysis["graph_stats"] = {
            "nodes": structure.get("node_count", len(graph_model.nodes)),
            "edges": structure.get("edge_count", len(graph_model.edges)),
            "resilience_score": structure.get("resilience_score"),
            "upstream_depth": structure.get("upstream_depth"),
            "inbound_links": structure.get("inbound_links"),
            "graph_source": graph_meta.get("graph_source"),
            "concentration_risks": graph_model.concentration_risks,
        }
        if structure.get("resilience_score") is not None:
            analysis["score"] = clamp(float(structure["resilience_score"]))
            analysis["preliminary_signal"] = signal_from_score(analysis["score"], 10)

        artifact = graph_to_artifact(graph_model, meta=graph_meta)
        artifacts: list[dict[str, Any]] = [artifact]

        progress.update_status(
            agent_id,
            ticker,
            f"Graph mapped ({graph_meta.get('graph_source', 'unknown')})",
            analysis=json.dumps(
                {
                    "graph_source": graph_meta.get("graph_source"),
                    "structure": structure,
                    "concentration_risks": graph_model.concentration_risks[:6],
                },
                default=str,
            ),
        )

        progress.update_status(agent_id, ticker, "Writing cartographer thesis")
        output = generate_cartographer_output(ticker=ticker, analysis=analysis, state=state, agent_id=agent_id)

        summary = finish_from_signal(
            agent_id,
            ticker,
            output,
            state,
            artifacts=artifacts,
            current_price=current_price,
        )
        signals[ticker] = {
            "signal": output.signal,
            "confidence": output.confidence,
            "reasoning": output.reasoning,
            "supply_resilience": output.supply_resilience,
            "thesis_summary": summary,
            "artifacts": artifacts,
        }
        merge_finish_outlook(signals[ticker], state, agent_id, ticker, thesis_summary=summary)

    message = HumanMessage(content=json.dumps(signals), name=agent_id)
    if state["metadata"].get("show_reasoning"):
        show_agent_reasoning(signals, "Supply Chain Cartographer")
    state["data"]["analyst_signals"][agent_id] = signals
    progress.update_status(agent_id, None, "Done")
    return {"messages": [message], "data": state["data"]}


def analyze_supply_chain_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    news = ctx.get("news") or []
    supplier_mentions = 0
    geo_mentions = 0
    logistics_mentions = 0
    for n in news:
        title = (getattr(n, "title", "") or "").lower()
        if any(w in title for w in ("supplier", "tsmc", "shortage", "supply chain", "bottleneck", "fab")):
            supplier_mentions += 1
        if any(w in title for w in ("china", "taiwan", "export", "tariff", "sanction")):
            geo_mentions += 1
        if any(w in title for w in ("logistics", "port", "freight", "inventory", "lead time")):
            logistics_mentions += 1

    score = 6.0
    if supplier_mentions >= 3:
        score -= 1.5
    if geo_mentions >= 2:
        score -= 1.2
    if logistics_mentions >= 2:
        score -= 0.8
    if supplier_mentions == 0 and geo_mentions == 0:
        score += 0.4

    return {
        "score": clamp(score),
        "max_score": 10,
        "preliminary_signal": signal_from_score(score, 10),
        "supplier_headline_count": supplier_mentions,
        "geopolitical_headline_count": geo_mentions,
        "logistics_headline_count": logistics_mentions,
    }


def generate_cartographer_output(
    *,
    ticker: str,
    analysis: dict[str, Any],
    state: AgentState,
    agent_id: str,
) -> CartographerSignal:
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are the Supply Chain Cartographer. Map concentration risk, single-source "
                "dependencies, and logistics fragility. An interactive supply web was built for "
                "this ticker — reference graph_stats, concentration_risks, and resilience_score. "
                "If graph_source is 'seed' or 'generic', note that the map used a fallback template. "
                "Bearish when concentration or geopolitical chokepoints dominate; bullish when "
                "diversified and resilient. JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\nAnalysis:\n{analysis}\n\n"
                "Return signal, confidence, reasoning (180-280 words), supply_resilience one-liner.",
            ),
        ]
    )
    prompt = template.invoke({"ticker": ticker, "analysis": json.dumps(analysis, indent=2, default=str)})

    def default() -> CartographerSignal:
        gs = analysis.get("graph_stats") or {}
        resilience = gs.get("resilience_score")
        line = (
            f"Resilience score {resilience}/10 from structural graph analysis."
            if resilience is not None
            else "Moderate — mapping used fallback scaffold."
        )
        return CartographerSignal(
            signal="neutral",
            confidence=50.0,
            reasoning=f"Supply chain view on {ticker} is mixed; graph mapped with available context.",
            supply_resilience=line,
        )

    return call_llm(
        prompt=prompt,
        pydantic_model=CartographerSignal,
        agent_name=agent_id,
        state=state,
        default_factory=default,
        stream=False,
    )
