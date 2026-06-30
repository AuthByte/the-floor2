"""Shared plumbing for named investor agents with custom metric blocks."""

from __future__ import annotations

import json
import math
import statistics
from typing import Any, Callable

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing_extensions import Literal

from src.graph.state import AgentState, show_agent_reasoning
from src.tools.api import get_company_news, get_financial_metrics, get_insider_trades, get_macro_context, get_market_cap, get_prices, search_line_items
from src.tools.providers.keys import keys_from_state
from src.utils.llm import call_llm
from src.utils.progress import progress
from src.utils.thesis_outlook import (
    OUTLOOK_JSON_SCHEMA,
    OUTLOOK_PROMPT_RULES,
    ThesisOutlookFields,
    latest_close,
)
from src.utils.thesis_verdict import finish_from_signal, merge_finish_outlook


class LegendaryInvestorSignal(ThesisOutlookFields):
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(description="Confidence from 0 to 100")
    reasoning: str = Field(description="Detailed investor-style thesis with concrete evidence")


LINE_ITEMS = [
    "revenue",
    "net_income",
    "operating_income",
    "earnings_per_share",
    "free_cash_flow",
    "operating_cash_flow",
    "capital_expenditure",
    "depreciation_and_amortization",
    "cash_and_equivalents",
    "total_debt",
    "shareholders_equity",
    "total_assets",
    "total_liabilities",
    "current_assets",
    "current_liabilities",
    "ebit",
    "ebitda",
    "interest_expense",
    "gross_profit",
    "outstanding_shares",
    "issuance_or_purchase_of_equity_shares",
    "dividends_and_other_cash_distributions",
]


def run_legendary_agent(
    *,
    state: AgentState,
    agent_id: str,
    investor_name: str,
    agent_label: str,
    persona: str,
    checklist: list[str],
    analysis_fn: Callable[[dict[str, Any]], dict[str, Any]],
    extra_artifacts_fn: Callable[[str, dict[str, Any], dict[str, Any], AgentState], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Fetch common data, run the agent's custom metric analysis, and ask the LLM."""
    data = state["data"]
    start_date = data["start_date"]
    end_date = data["end_date"]
    tickers = data["tickers"]
    api_keys = keys_from_state(state)
    macro = data.get("macro_context") or get_macro_context(end_date, api_keys)
    if macro.get("available"):
        state["data"]["macro_context"] = macro
    tier0_ready = bool(data.get("tier0_complete"))
    signals: dict[str, dict[str, Any]] = {}

    for ticker in tickers:
        if tier0_ready:
            progress.update_status(agent_id, ticker, "Using Tier-0 briefings + cached market data")
        else:
            progress.update_status(agent_id, ticker, "Fetching market data")
        metrics = get_financial_metrics(ticker, end_date, period="ttm", limit=8, api_key=api_keys)

        progress.update_status(agent_id, ticker, "Gathering financial line items")
        line_items = search_line_items(ticker, LINE_ITEMS, end_date, period="ttm", limit=8, api_key=api_keys)

        progress.update_status(agent_id, ticker, "Gathering prices and context")
        market_cap = get_market_cap(ticker, end_date, api_key=api_keys)
        prices = get_prices(ticker, start_date=start_date, end_date=end_date, api_key=api_keys)
        if tier0_ready:
            news = []
            insider_trades = []
        else:
            news = get_company_news(ticker, end_date, limit=50, api_key=api_keys)
            from src.agents._insider_utils import get_prefetched_insider_trades

            insider_trades = get_prefetched_insider_trades(state, ticker)
            if insider_trades is None:
                insider_trades = get_insider_trades(ticker, end_date, limit=100, api_key=api_keys)

        progress.update_status(agent_id, ticker, f"Running {investor_name} metrics")
        chart_ctx = {
            "ticker": ticker,
            "end_date": end_date,
            "metrics": metrics,
            "line_items": line_items,
            "market_cap": market_cap,
            "prices": prices,
            "news": news,
            "insider_trades": insider_trades,
            "macro": macro,
        }
        analysis = analysis_fn(chart_ctx)
        analysis["ticker"] = ticker
        analysis["max_score"] = analysis.get("max_score", 10)
        analysis["preliminary_signal"] = signal_from_score(analysis.get("score", 0), analysis["max_score"])

        subagent_bundle: dict[str, Any] | None = None
        try:
            from src.utils.sub_agents import delegate_sub_agents

            subagent_bundle = delegate_sub_agents(
                parent_agent_id=agent_id,
                parent_name=investor_name,
                ticker=ticker,
                parent_analysis=analysis,
                chart_ctx=chart_ctx,
                state=state,
            )
            if subagent_bundle:
                analysis["sub_agent_briefs"] = subagent_bundle["briefs"]
        except Exception as exc:
            progress.update_status(agent_id, ticker, f"Sub-agents skipped: {exc}")

        progress.update_status(agent_id, ticker, f"Generating {investor_name} thesis")
        output = generate_legendary_output(
            ticker=ticker,
            investor_name=investor_name,
            persona=persona,
            checklist=checklist,
            analysis_data=analysis,
            state=state,
            agent_id=agent_id,
            current_price=latest_close(prices),
        )

        try:
            from src.utils.agent_artifacts import attach_artifacts

            artifacts = attach_artifacts(
                agent_id=agent_id,
                investor_name=investor_name,
                ticker=ticker,
                state=state,
                metrics_ctx=chart_ctx,
                reasoning_payload=analysis,
            )
        except Exception as exc:
            progress.update_status(agent_id, ticker, f"Chart render skipped: {exc}")
            artifacts = []

        if extra_artifacts_fn:
            try:
                artifacts.extend(extra_artifacts_fn(ticker, analysis, chart_ctx, state))
            except Exception as exc:
                progress.update_status(agent_id, ticker, f"Desk artifact skipped: {exc}")

        subagent_progress = subagent_bundle["progress"] if subagent_bundle else None
        summary = finish_from_signal(
            agent_id,
            ticker,
            output,
            state,
            artifacts=artifacts,
            current_price=latest_close(prices),
            analysis_data=analysis,
            subagent_progress=subagent_progress,
        )
        signals[ticker] = {
            "signal": output.signal,
            "confidence": output.confidence,
            "reasoning": output.reasoning,
            "thesis_summary": summary,
        }
        if subagent_bundle:
            signals[ticker]["subagents"] = subagent_bundle["progress"]["subagents"]
            signals[ticker]["subagent_results"] = subagent_bundle["progress"]["subagent_results"]
        merge_finish_outlook(signals[ticker], state, agent_id, ticker, thesis_summary=summary)
        if artifacts:
            signals[ticker]["artifacts"] = artifacts

    message = HumanMessage(content=json.dumps(signals), name=agent_id)
    if state["metadata"].get("show_reasoning"):
        show_agent_reasoning(signals, agent_label)

    state["data"]["analyst_signals"][agent_id] = signals
    progress.update_status(agent_id, None, "Done")
    return {"messages": [message], "data": state["data"]}


def generate_legendary_output(
    *,
    ticker: str,
    investor_name: str,
    persona: str,
    checklist: list[str],
    analysis_data: dict[str, Any],
    state: AgentState,
    agent_id: str,
    current_price: float | None = None,
) -> LegendaryInvestorSignal:
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are {investor_name}. Use only the provided custom metric blocks.\n"
                "{persona}\n\n"
                "Decision checklist:\n"
                "{checklist}\n\n"
                "Return JSON only. Write all reasoning in English only.\n"
                "When Tier-0 desk briefings are attached, treat them as authoritative feeds for "
                "sentiment, news, growth, valuation, and fundamentals — synthesize; do not ignore them.\n"
                "When sub_agent_briefs are present in the analysis blocks, cite them as delegated "
                "specialist memos — integrate their findings; do not ignore them.\n"
                "Keep reasoning specific, cite named metric blocks, and do not invent data.\n"
                f"{OUTLOOK_PROMPT_RULES}\n"
                "Reasoning must be substantial (roughly 180-320 words) and include: "
                "(1) core thesis, (2) 2-4 supporting data points, (3) key risk/counterpoint, "
                "(4) what would invalidate your view.",
            ),
            (
                "human",
                "Ticker: {ticker}\n"
                "Latest close (USD): {current_price}\n"
                "Macro backdrop (FRED):\n{macro_block}\n\n"
                "Custom analysis blocks:\n{analysis_data}\n\n"
                "Return exactly:\n"
                "{{\n"
                '  "signal": "bullish" | "bearish" | "neutral",\n'
                '  "confidence": float,\n'
                '  "reasoning": "string",\n'
                f"{OUTLOOK_JSON_SCHEMA}\n"
                "}}",
            ),
        ]
    )
    macro = state.get("data", {}).get("macro_context") or {}
    macro_block = json.dumps(
        {
            "headline": macro.get("summary", {}).get("headline") if isinstance(macro.get("summary"), dict) else macro.get("summary"),
            "series": macro.get("series", {}),
        },
        indent=2,
        default=str,
    )[:3000]

    prompt = template.invoke(
        {
            "ticker": ticker,
            "current_price": current_price if current_price is not None else "unknown",
            "investor_name": investor_name,
            "persona": persona,
            "checklist": "\n".join(f"- {item}" for item in checklist),
            "analysis_data": json.dumps(analysis_data, indent=2, default=str),
            "macro_block": macro_block,
        }
    )

    def default_signal() -> LegendaryInvestorSignal:
        return LegendaryInvestorSignal(signal="neutral", confidence=50.0, reasoning="Insufficient data for a differentiated view")

    return call_llm(
        prompt=prompt,
        pydantic_model=LegendaryInvestorSignal,
        agent_name=agent_id,
        state=state,
        default_factory=default_signal,
    )


def signal_from_score(score: float, max_score: float = 10) -> str:
    if max_score <= 0:
        return "neutral"
    pct = score / max_score
    if pct >= 0.70:
        return "bullish"
    if pct <= 0.40:
        return "bearish"
    return "neutral"


def clamp(value: float, low: float = 0, high: float = 10) -> float:
    return max(low, min(high, value))


def safe_get(obj: Any, name: str, default: Any = None) -> Any:
    return getattr(obj, name, default) if obj is not None else default


def latest(items: list[Any]) -> Any | None:
    return items[0] if items else None


def values(items: list[Any], attr: str) -> list[float]:
    return [v for item in items if (v := safe_get(item, attr)) is not None]


def ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def cagr(series: list[float]) -> float | None:
    if len(series) < 2:
        return None
    newest, oldest = series[0], series[-1]
    years = len(series) - 1
    if newest <= 0 or oldest <= 0:
        return None
    return (newest / oldest) ** (1 / years) - 1


def trend_slope(series: list[float]) -> float:
    if len(series) < 2:
        return 0.0
    return (series[0] - series[-1]) / max(abs(series[-1]), 1e-9)


def stability_score(series: list[float], target_low_vol: float = 0.20) -> float:
    clean = [x for x in series if x is not None]
    if len(clean) < 3:
        return 5.0
    avg = statistics.fmean(clean)
    if abs(avg) < 1e-9:
        return 4.0
    cv = statistics.pstdev(clean) / abs(avg)
    return clamp(10 * (1 - cv / target_low_vol))


def price_stats(prices: list[Any]) -> dict[str, Any]:
    sorted_prices = sorted(prices, key=lambda p: safe_get(p, "time", ""))
    closes = [safe_get(p, "close") for p in sorted_prices if safe_get(p, "close") is not None]
    volumes = [safe_get(p, "volume") for p in sorted_prices if safe_get(p, "volume") is not None]
    if len(closes) < 2:
        return {"momentum": None, "reversal_20d": None, "drawdown": None, "volatility": None, "trend_consistency": None, "liquidity": None}

    returns = [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes)) if closes[i - 1] > 0]
    peak = max(closes)
    drawdown = (closes[-1] - peak) / peak if peak > 0 else None
    up_days = sum(1 for r in returns[-60:] if r > 0)
    momentum = (closes[-1] - closes[0]) / closes[0] if closes[0] > 0 else None
    recent_window = closes[-20:] if len(closes) >= 20 else closes
    reversal_20d = (closes[-1] - recent_window[0]) / recent_window[0] if recent_window[0] > 0 else None
    volatility = statistics.pstdev(returns) * math.sqrt(252) if len(returns) > 2 else None
    trend_consistency = up_days / min(60, len(returns)) if returns else None
    liquidity = statistics.fmean(volumes[-60:]) if volumes else None
    return {
        "momentum": momentum,
        "reversal_20d": reversal_20d,
        "drawdown": drawdown,
        "volatility": volatility,
        "trend_consistency": trend_consistency,
        "liquidity": liquidity,
    }


def news_tone(news: list[Any]) -> dict[str, Any]:
    negative_words = ["fraud", "lawsuit", "investigation", "decline", "miss", "warning", "downgrade", "layoff", "loss", "probe", "slump", "bankruptcy"]
    positive_words = ["beat", "upgrade", "growth", "record", "partnership", "approval", "surge", "profit", "launch", "expansion", "buyback"]
    negative = 0
    positive = 0
    for item in news:
        text = f"{safe_get(item, 'title', '')} {safe_get(item, 'sentiment', '')}".lower()
        negative += int(any(word in text for word in negative_words))
        positive += int(any(word in text for word in positive_words))
    total = len(news)
    pessimism = negative / total if total else 0
    optimism = positive / total if total else 0
    return {"negative_count": negative, "positive_count": positive, "total": total, "pessimism": pessimism, "optimism": optimism}


def insider_tone(insider_trades: list[Any], *, as_of: str | None = None) -> dict[str, Any]:
    from src.agents._insider_utils import insider_tone as _insider_tone

    return _insider_tone(insider_trades, as_of=as_of)


def valuation_snapshot(metrics: list[Any], line_items: list[Any], market_cap: float | None) -> dict[str, Any]:
    m = latest(metrics)
    li = latest(line_items)
    net_income = safe_get(li, "net_income")
    fcf = safe_get(li, "free_cash_flow")
    equity = safe_get(li, "shareholders_equity")
    revenue = safe_get(li, "revenue")
    return {
        "pe": safe_get(m, "price_to_earnings_ratio") or ratio(market_cap, net_income),
        "pb": safe_get(m, "price_to_book_ratio") or ratio(market_cap, equity),
        "ps": safe_get(m, "price_to_sales_ratio") or ratio(market_cap, revenue),
        "fcf_yield": safe_get(m, "free_cash_flow_yield") or ratio(fcf, market_cap),
        "earnings_yield": ratio(net_income, market_cap),
        "market_cap": market_cap,
    }

