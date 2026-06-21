"""Unknown Unknowns agent — assigned red team that attacks the desk consensus.

Nobody was assigned to attack the thesis. This desk's sole job is to ask why
everyone else might be wrong and surface risks the bull case ignores.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing_extensions import Literal

from src.agents._legendary_investor_utils import (
    LINE_ITEMS,
    clamp,
    latest,
    news_tone,
    price_stats,
    ratio,
    safe_get,
    valuation_snapshot,
    values,
)
from src.graph.state import AgentState, show_agent_reasoning
from src.tools.api import get_company_news, get_financial_metrics, get_insider_trades, get_market_cap, get_prices, search_line_items
from src.utils.api_key import get_api_key_from_state
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.risk_pipeline import risk_briefing_for_ticker
from src.utils.thesis_outlook import ThesisOutlookFields, latest_close
from src.utils.thesis_verdict import finish_from_signal
from src.utils.ticker_dossier import claim_ids_for_signal
from src.utils.tier1_fetch import tier0_briefings_ready


class RedTeamSignal(ThesisOutlookFields):
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(description="Confidence from 0 to 100")
    reasoning: str = Field(description="Red-team attack memo in English")
    majority_disagreement: str = Field(
        description="One sentence stating how this stance differs from desk consensus"
    )


def unknown_unknowns_agent(state: AgentState, agent_id: str = "unknown_unknowns_agent"):
    """Attack the consensus thesis for each ticker using red-team risk pillars."""
    data = state["data"]
    end_date = data["end_date"]
    start_date = data["start_date"]
    tickers = data["tickers"]
    api_key = get_api_key_from_state(state, "FINANCIAL_DATASETS_API_KEY")
    signals: dict[str, dict[str, Any]] = {}

    for ticker in tickers:
        consensus = summarize_desk_consensus(state, ticker, agent_id)

        progress.update_status(agent_id, ticker, "Stress-testing desk consensus")
        metrics = get_financial_metrics(ticker, end_date, period="ttm", limit=8, api_key=api_key)
        line_items = search_line_items(ticker, LINE_ITEMS, end_date, period="ttm", limit=8, api_key=api_key)
        market_cap = get_market_cap(ticker, end_date, api_key=api_key)
        current_price = None
        prices = get_prices(ticker, start_date=start_date, end_date=end_date, api_key=api_key)
        current_price = latest_close(prices)

        if tier0_briefings_ready(state):
            news = []
            insider_trades = []
        else:
            news = get_company_news(ticker, end_date, limit=60, api_key=api_key)
            insider_trades = get_insider_trades(ticker, end_date, limit=80, api_key=api_key)

        chart_ctx = {
            "ticker": ticker,
            "metrics": metrics,
            "line_items": line_items,
            "market_cap": market_cap,
            "prices": prices,
            "news": news,
            "insider_trades": insider_trades,
            "desk_consensus": consensus,
        }
        analysis = analyze_red_team_metrics(chart_ctx)
        analysis["desk_consensus"] = consensus
        analysis["ticker"] = ticker
        analysis["max_score"] = 10
        analysis["preliminary_signal"] = _contrarian_signal(consensus["majority_signal"])

        subagent_bundle: dict[str, Any] | None = None
        try:
            from src.utils.sub_agents import delegate_sub_agents

            subagent_bundle = delegate_sub_agents(
                parent_agent_id=agent_id,
                parent_name="Unknown Unknowns",
                ticker=ticker,
                parent_analysis=analysis,
                chart_ctx=chart_ctx,
                state=state,
            )
            if subagent_bundle:
                analysis["sub_agent_briefs"] = subagent_bundle["briefs"]
        except Exception as exc:
            progress.update_status(agent_id, ticker, f"Sub-agents skipped: {exc}")

        progress.update_status(agent_id, ticker, "Writing red-team attack memo")
        output = generate_red_team_output(
            ticker=ticker,
            consensus=consensus,
            analysis_data=analysis,
            state=state,
            agent_id=agent_id,
        )
        output = enforce_contrarian(output, consensus["majority_signal"])

        try:
            from src.utils.agent_artifacts import attach_artifacts

            artifacts = attach_artifacts(
                agent_id=agent_id,
                investor_name="Unknown Unknowns",
                ticker=ticker,
                state=state,
                metrics_ctx=chart_ctx,
                reasoning_payload=analysis,
            )
        except Exception as exc:
            progress.update_status(agent_id, ticker, f"Chart render skipped: {exc}")
            artifacts = []

        contradicts = claim_ids_for_signal(
            state,
            ticker,
            consensus["majority_signal"],
            exclude_agent=agent_id,
        )

        summary = finish_from_signal(
            agent_id,
            ticker,
            output,
            state,
            artifacts=artifacts,
            contradicts=contradicts,
            current_price=current_price,
            subagent_progress=subagent_bundle["progress"] if subagent_bundle else None,
        )
        signals[ticker] = {
            "signal": output.signal,
            "confidence": output.confidence,
            "reasoning": output.reasoning,
            "thesis_summary": summary,
            "majority_disagreement": output.majority_disagreement,
            "desk_consensus": consensus,
        }
        if artifacts:
            signals[ticker]["artifacts"] = artifacts

    message = HumanMessage(content=json.dumps(signals), name=agent_id)
    if state["metadata"].get("show_reasoning"):
        show_agent_reasoning(signals, "Unknown Unknowns")

    state["data"]["analyst_signals"][agent_id] = signals
    progress.update_status(agent_id, None, "Done")
    return {"messages": [message], "data": state["data"]}


def extract_base_agent_key(unique_id: str) -> str:
    parts = unique_id.split("_")
    if len(parts) >= 2:
        last = parts[-1]
        if len(last) == 6 and re.match(r"^[a-z0-9]+$", last):
            return "_".join(parts[:-1])
    return unique_id


def summarize_desk_consensus(state: AgentState, ticker: str, self_agent_id: str) -> dict[str, Any]:
    """Tally peer signals already on the floor for this ticker."""
    self_base = extract_base_agent_key(self_agent_id)
    counts: Counter[str] = Counter()
    peers: list[dict[str, Any]] = []

    for agent_key, bucket in (state.get("data", {}).get("analyst_signals") or {}).items():
        if extract_base_agent_key(agent_key) == self_base:
            continue
        if not isinstance(bucket, dict):
            continue
        row = bucket.get(ticker)
        if not isinstance(row, dict):
            continue
        sig = str(row.get("signal", "neutral")).lower()
        if sig not in {"bullish", "bearish", "neutral"}:
            sig = "neutral"
        counts[sig] += 1
        peers.append(
            {
                "agent": extract_base_agent_key(agent_key),
                "signal": sig,
                "confidence": row.get("confidence"),
                "thesis_summary": (row.get("thesis_summary") or "")[:220],
            }
        )

    if not counts:
        majority = "neutral"
    else:
        majority = counts.most_common(1)[0][0]

    return {
        "majority_signal": majority,
        "counts": dict(counts),
        "peer_count": sum(counts.values()),
        "peers": peers[:12],
    }


def analyze_red_team_metrics(ctx: dict[str, Any]) -> dict[str, Any]:
    metrics = ctx.get("metrics") or []
    line_items = ctx.get("line_items") or []
    news = ctx.get("news") or []
    insider_trades = ctx.get("insider_trades") or []
    valuation = valuation_snapshot(metrics, line_items, ctx.get("market_cap"))

    hidden = score_hidden_risks(ctx.get("prices") or [], news, metrics)
    accounting = score_accounting_concerns(metrics, line_items, insider_trades)
    concentration = score_concentration_risk(line_items, news)
    disruption = score_disruptive_threat(news, metrics)
    regulatory = score_regulatory_threat(news)

    # Higher score = more bearish ammunition for the red team.
    score = (
        hidden["score"] * 0.22
        + accounting["score"] * 0.22
        + concentration["score"] * 0.18
        + disruption["score"] * 0.18
        + regulatory["score"] * 0.20
    )
    return {
        "score": score,
        "hidden_risks": hidden,
        "accounting_concerns": accounting,
        "concentration_risk": concentration,
        "disruptive_technology": disruption,
        "regulatory_threats": regulatory,
        "valuation_snapshot": valuation,
    }


def score_hidden_risks(prices: list[Any], news: list[Any], metrics: list[Any]) -> dict[str, Any]:
    stats = price_stats(prices)
    tone = news_tone(news)
    vol = safe_get(latest(metrics), "earnings_growth")
    score = 5.0
    if stats.get("drawdown") is not None and stats["drawdown"] < -0.25:
        score += 2
    if stats.get("volatility") is not None and stats["volatility"] > 0.45:
        score += 1.5
    if tone.get("pessimism", 0) > 0.25:
        score += 1.5
    if vol is not None and vol < 0:
        score += 1
    return {
        "score": clamp(score),
        "details": (
            f"drawdown {stats.get('drawdown')}; vol {stats.get('volatility')}; "
            f"news pessimism {tone.get('pessimism', 0):.0%}"
        ),
    }


def score_accounting_concerns(
    metrics: list[Any], line_items: list[Any], insider_trades: list[Any]
) -> dict[str, Any]:
    li = latest(line_items)
    m = latest(metrics)
    fcf = safe_get(li, "free_cash_flow")
    ni = safe_get(li, "net_income")
    ocf = safe_get(li, "operating_cash_flow")
    conversion = ratio(fcf, ni) if ni else ratio(ocf, ni)
    dte = safe_get(m, "debt_to_equity")
    sells = sum(
        1
        for t in insider_trades or []
        if (getattr(t, "transaction_shares", None) or 0) < 0
        or "sell" in str(getattr(t, "transaction_type", "")).lower()
    )
    score = 5.0
    if conversion is not None and conversion < 0.7:
        score += 2.5
    if fcf is not None and fcf < 0:
        score += 2
    if dte is not None and dte > 1.8:
        score += 1.5
    if sells >= 3:
        score += 1
    return {
        "score": clamp(score),
        "details": f"FCF/earnings {conversion}; D/E {dte}; insider sells {sells}",
    }


def score_concentration_risk(line_items: list[Any], news: list[Any]) -> dict[str, Any]:
    rev_series = values(line_items, "revenue")
    score = 5.0
    if len(rev_series) >= 2 and rev_series[0] and rev_series[-1]:
        concentration_proxy = rev_series[0] / max(rev_series[-1], 1e-9)
        if concentration_proxy > 2.5:
            score += 1
    keywords = ("customer concentration", "single customer", "top customer", "reliance on", "largest client")
    hits = 0
    for item in news or []:
        text = f"{safe_get(item, 'title', '')} {safe_get(item, 'summary', '')}".lower()
        hits += int(any(k in text for k in keywords))
    if hits:
        score += min(3, hits * 0.8)
    return {"score": clamp(score), "details": f"concentration news hits {hits}; revenue series len {len(rev_series)}"}


def score_disruptive_threat(news: list[Any], metrics: list[Any]) -> dict[str, Any]:
    keywords = (
        "disrupt",
        "substitute",
        "obsolesc",
        "ai ",
        "artificial intelligence",
        "new entrant",
        "commoditiz",
        "platform shift",
        "paradigm",
    )
    hits = 0
    for item in news or []:
        text = f"{safe_get(item, 'title', '')} {safe_get(item, 'summary', '')}".lower()
        hits += int(any(k in text for k in keywords))
    margin = safe_get(latest(metrics), "gross_margin")
    score = 5.0 + min(3.5, hits * 0.7)
    if margin is not None and margin < 0.25:
        score += 1.5
    return {"score": clamp(score), "details": f"disruption headline hits {hits}; gross margin {margin}"}


def score_regulatory_threat(news: list[Any]) -> dict[str, Any]:
    keywords = (
        "regulat",
        "antitrust",
        "doj",
        "sec ",
        "ftc",
        "fda",
        "ban ",
        "probe",
        "investigation",
        "subpoena",
        "fine ",
        "lawsuit",
        "compliance",
    )
    hits = 0
    for item in news or []:
        text = f"{safe_get(item, 'title', '')} {safe_get(item, 'summary', '')}".lower()
        hits += int(any(k in text for k in keywords))
    score = 5.0 + min(4, hits * 0.85)
    return {"score": clamp(score), "details": f"regulatory/legal headline hits {hits}"}


def _contrarian_signal(majority: str) -> str:
    if majority == "bullish":
        return "bearish"
    if majority == "bearish":
        return "bullish"
    return "bearish"


def generate_red_team_output(
    *,
    ticker: str,
    consensus: dict[str, Any],
    analysis_data: dict[str, Any],
    state: AgentState,
    agent_id: str,
) -> RedTeamSignal:
    majority = consensus.get("majority_signal", "neutral")
    forbidden = majority
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are the Unknown Unknowns red-team desk. Your ONLY job is to attack the "
                "investment thesis — especially the consensus view.\n\n"
                "Rules:\n"
                "1. You MUST NOT agree with the desk majority signal ({majority}). Your signal "
                "cannot be '{forbidden}'.\n"
                "2. Lead with why smart investors could be wrong.\n"
                "3. Cover hidden risks, accounting concerns, concentration risk, disruptive "
                "technology, and regulatory threats using the metric blocks provided.\n"
                "4. If consensus is thin, still argue the bear case hardest.\n"
                "5. Reasoning: 200-320 words, cite named metric blocks, include counter-thesis "
                "and what would prove YOU wrong.\n"
                "Return JSON only.",
            ),
            (
                "human",
                "Ticker: {ticker}\n"
                "Desk consensus: {consensus_json}\n"
                "Risk discovery register:\n{risk_register}\n"
                "Red-team metric blocks:\n{analysis}\n\n"
                "Return exactly:\n"
                "{{\n"
                '  "signal": "bullish" | "bearish" | "neutral",\n'
                '  "confidence": float,\n'
                '  "reasoning": "string",\n'
                '  "majority_disagreement": "one sentence"\n'
                "}}",
            ),
        ]
    )
    prompt = template.invoke(
        {
            "ticker": ticker,
            "majority": majority,
            "forbidden": forbidden,
            "consensus_json": json.dumps(consensus, indent=2, default=str)[:3000],
            "risk_register": risk_briefing_for_ticker(state, ticker) or "(no risk register)",
            "analysis": json.dumps(analysis_data, indent=2, default=str)[:4000],
        }
    )

    def default_signal() -> RedTeamSignal:
        sig = _contrarian_signal(majority)
        return RedTeamSignal(
            signal=sig,
            confidence=58.0,
            reasoning=(
                f"Red-team default: desk leans {majority} on {ticker}, but unmodeled tail "
                "risks, accounting drift, and regulatory overhang are under-weighted."
            ),
            majority_disagreement=f"Explicitly rejects the {majority} consensus.",
        )

    return call_llm(
        prompt=prompt,
        pydantic_model=RedTeamSignal,
        agent_name=agent_id,
        state=state,
        default_factory=default_signal,
    )


def enforce_contrarian(output: RedTeamSignal, majority: str) -> RedTeamSignal:
    """Hard guarantee: never return the majority signal."""
    if output.signal != majority:
        return output
    flipped = _contrarian_signal(majority)
    note = (
        f" (Red-team override: cannot echo {majority} consensus.)"
    )
    return RedTeamSignal(
        signal=flipped,
        confidence=max(40.0, min(output.confidence, 85.0)),
        reasoning=output.reasoning + note,
        majority_disagreement=output.majority_disagreement
        or f"Rejects the prevailing {majority} desk view.",
    )
