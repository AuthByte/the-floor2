"""Quant desk agents — v2 alpha models wrapped for the floor graph."""

from __future__ import annotations

import json
from typing import Callable

from langchain_core.messages import HumanMessage

from src.graph.state import AgentState, show_agent_reasoning
from src.tools.providers.keys import keys_from_state
from src.utils.progress import progress
from v2.data.fallback_client import QuantDataClient
from v2.signals import QUANT_AGENT_MODELS


def _value_to_signal(value: float) -> str:
    if value >= 0.35:
        return "bullish"
    if value <= -0.35:
        return "bearish"
    return "neutral"


def make_quant_agent(agent_key: str) -> Callable[[AgentState, str], dict]:
    """Factory: one quant desk room per v2 alpha model."""
    model_cls = QUANT_AGENT_MODELS[agent_key]
    display = agent_key.replace("quant_", "").replace("_", " ").title()

    def quant_agent(state: AgentState, agent_id: str = f"{agent_key}_agent"):
        data = state["data"]
        tickers = data.get("tickers") or []
        end_date = data.get("end_date") or ""
        api_keys = keys_from_state(state)
        model = model_cls()
        results: dict[str, dict] = {}

        with QuantDataClient(api_keys) as fd:
            fd.set_end_date(end_date)
            for ticker in tickers:
                fd.last_price_source = "none"
                fd.last_earnings_source = "none"
                progress.update_status(agent_id, ticker, f"Running {display} model")
                try:
                    signal = model.predict(ticker, end_date, fd)
                    conviction = float(signal.value)
                    payload = {
                        "signal": _value_to_signal(conviction),
                        "conviction": round(conviction, 4),
                        "confidence": round(min(abs(conviction), 1.0) * 100),
                        "model": signal.model_name,
                        "reasoning": signal.reasoning,
                        "metadata": {
                            **signal.metadata,
                            "price_source": getattr(fd, "last_price_source", None),
                            "earnings_source": getattr(fd, "last_earnings_source", None),
                        },
                    }
                    results[ticker] = payload
                    progress.update_status(
                        agent_id,
                        ticker,
                        "Done",
                        analysis=json.dumps(payload, default=str),
                    )
                except Exception as exc:
                    err = {
                        "signal": "neutral",
                        "conviction": 0.0,
                        "model": model.name,
                        "reasoning": f"{display} model unavailable: {exc}",
                        "metadata": {"error": str(exc)},
                    }
                    results[ticker] = err
                    progress.update_status(
                        agent_id,
                        ticker,
                        "Error",
                        analysis=json.dumps(err, default=str),
                    )

        message = HumanMessage(content=json.dumps(results), name=agent_id)
        if state["metadata"].get("show_reasoning"):
            show_agent_reasoning(results, f"{display} Quant Desk")
        state["data"]["analyst_signals"][agent_id] = results
        return {"messages": [message], "data": state["data"]}

    quant_agent.__name__ = f"{agent_key}_agent"
    return quant_agent


quant_pead_agent = make_quant_agent("quant_pead")
quant_momentum_agent = make_quant_agent("quant_momentum")
quant_mean_reversion_agent = make_quant_agent("quant_mean_reversion")
quant_volatility_agent = make_quant_agent("quant_volatility")
