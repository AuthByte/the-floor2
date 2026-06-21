"""George Soros agent — reflexivity, macro narrative, asymmetric bets."""

from src.graph.state import AgentState, show_agent_reasoning
from src.tools.api import (
    get_financial_metrics,
    get_market_cap,
    search_line_items,
    get_insider_trades,
    get_company_news,
    get_prices,
)
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
import json
from typing_extensions import Literal
from src.utils.progress import progress
from src.utils.thesis_outlook import ThesisOutlookFields, latest_close
from src.utils.thesis_verdict import finish_from_signal
from src.utils.llm import call_llm
from src.utils.api_key import get_api_key_from_state
from src.utils.tier1_fetch import tier0_briefings_ready

from src.agents.stanley_druckenmiller import (
    analyze_growth_and_momentum,
    analyze_insider_activity,
    analyze_risk_reward,
    analyze_sentiment,
    analyze_druckenmiller_valuation,
)


class GeorgeSorosSignal(ThesisOutlookFields):
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float
    reasoning: str


def george_soros_agent(state: AgentState, agent_id: str = "george_soros_agent"):
    """
    Soros-style analysis: reflexivity (market narratives feeding fundamentals),
    macro/sentiment catalysts, and asymmetric risk-reward.
    """
    data = state["data"]
    start_date = data["start_date"]
    end_date = data["end_date"]
    tickers = data["tickers"]
    api_key = get_api_key_from_state(state, "FINANCIAL_DATASETS_API_KEY")
    analysis_data = {}
    soros_analysis = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Reading market narrative")
        metrics = get_financial_metrics(ticker, end_date, period="annual", limit=5, api_key=api_key)

        progress.update_status(agent_id, ticker, "Gathering financial line items")
        financial_line_items = search_line_items(
            ticker,
            [
                "revenue",
                "earnings_per_share",
                "net_income",
                "operating_income",
                "free_cash_flow",
                "total_debt",
                "shareholders_equity",
                "outstanding_shares",
                "ebit",
                "ebitda",
            ],
            end_date,
            period="annual",
            limit=5,
            api_key=api_key,
        )

        progress.update_status(agent_id, ticker, "Getting market cap")
        market_cap = get_market_cap(ticker, end_date, api_key=api_key)

        if tier0_briefings_ready(state):
            progress.update_status(agent_id, ticker, "Using Tier-0 sentiment briefings")
            company_news = []
            insider_trades = []
        else:
            progress.update_status(agent_id, ticker, "Scanning news flow")
            company_news = get_company_news(ticker, end_date, limit=50, api_key=api_key)
            insider_trades = get_insider_trades(ticker, end_date, limit=50, api_key=api_key)
        prices = get_prices(ticker, start_date=start_date, end_date=end_date, api_key=api_key)
        current_price = latest_close(prices)

        progress.update_status(agent_id, ticker, "Testing reflexivity (price vs narrative)")
        growth_momentum = analyze_growth_and_momentum(financial_line_items, prices)
        sentiment = analyze_sentiment(company_news)
        insider = analyze_insider_activity(insider_trades)
        risk_reward = analyze_risk_reward(financial_line_items, prices)
        valuation = analyze_druckenmiller_valuation(financial_line_items, market_cap)

        # Soros weights: sentiment/reflexivity heavy
        total_score = (
            sentiment["score"] * 0.30
            + growth_momentum["score"] * 0.25
            + risk_reward["score"] * 0.20
            + valuation["score"] * 0.15
            + insider["score"] * 0.10
        )

        if total_score >= 7.0:
            signal = "bullish"
        elif total_score <= 4.0:
            signal = "bearish"
        else:
            signal = "neutral"

        analysis_data[ticker] = {
            "signal": signal,
            "score": total_score,
            "max_score": 10,
            "reflexivity_note": (
                "Price and narrative may be mutually reinforcing — watch for trend "
                "exhaustion or policy catalysts that break the feedback loop."
            ),
            "growth_momentum_analysis": growth_momentum,
            "sentiment_analysis": sentiment,
            "insider_activity": insider,
            "risk_reward_analysis": risk_reward,
            "valuation_analysis": valuation,
        }

        progress.update_status(agent_id, ticker, "Generating Soros thesis")
        soros_output = generate_soros_output(
            ticker=ticker,
            analysis_data=analysis_data,
            state=state,
            agent_id=agent_id,
        )

        soros_analysis[ticker] = {
            "signal": soros_output.signal,
            "confidence": soros_output.confidence,
            "reasoning": soros_output.reasoning,
        }

        finish_from_signal(agent_id, ticker, soros_output, state, current_price=current_price)

    message = HumanMessage(content=json.dumps(soros_analysis), name=agent_id)

    if state["metadata"].get("show_reasoning"):
        show_agent_reasoning(soros_analysis, "George Soros Agent")

    state["data"]["analyst_signals"][agent_id] = soros_analysis
    progress.update_status(agent_id, None, "Done")

    return {"messages": [message], "data": state["data"]}


def generate_soros_output(
    ticker: str,
    analysis_data: dict,
    state: AgentState,
    agent_id: str,
) -> GeorgeSorosSignal:
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a George Soros AI agent applying reflexivity and macro investing:

                1. Markets are reflexive — prices and fundamentals influence each other in feedback loops.
                2. Identify when a narrative is self-reinforcing vs. near an inflection point.
                3. Size bets for asymmetric payoffs; preserve capital when thesis is unclear.
                4. Policy, liquidity, and crowd psychology are first-class inputs.
                5. Be willing to act decisively when the trend and fundamentals align — or fade the crowd when the loop breaks.

                Output JSON with signal, confidence (0-100), and reasoning in Soros's voice:
                philosophical but concrete, focused on narrative, catalysts, and risk asymmetry.""",
            ),
            (
                "human",
                """Create a Soros-style investment signal for {ticker}.

                Analysis:
                {analysis_data}

                Return JSON:
                {{
                  "signal": "bullish/bearish/neutral",
                  "confidence": float,
                  "reasoning": "string"
                }}""",
            ),
        ]
    )

    prompt = template.invoke(
        {"analysis_data": json.dumps(analysis_data, indent=2), "ticker": ticker}
    )

    def default_signal():
        return GeorgeSorosSignal(
            signal="neutral",
            confidence=0.0,
            reasoning="Error in analysis, defaulting to neutral",
        )

    return call_llm(
        prompt=prompt,
        pydantic_model=GeorgeSorosSignal,
        agent_name=agent_id,
        state=state,
        default_factory=default_signal,
    )
