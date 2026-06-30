"""Barrier: specialist analysis must finish before quant desk models run."""

from __future__ import annotations

from typing import Any

from src.graph.state import AgentState
from src.utils.progress import progress
from src.utils.ticker_dossier import ingest_quant_into_dossiers
from src.utils.tier0_briefing import build_quant_briefings
from src.utils.tier0_summaries import enrich_quant_signals

QUANT_GATE_ID = "quant_gate"


def quant_gate_node(state: AgentState) -> dict[str, Any]:
    data = state["data"]
    signals = data.get("analyst_signals") or {}
    enrich_quant_signals(signals)
    tickers = data.get("tickers") or []
    quant_briefings = build_quant_briefings(signals, tickers)
    dossiers = ingest_quant_into_dossiers(state, tickers) if tickers else {}
    progress.update_status(QUANT_GATE_ID, None, "Analysis desks complete — releasing quant models")
    return {
        "data": {
            "quant_floor_released": True,
            "quant_briefings": quant_briefings,
            "ticker_dossiers": dossiers or data.get("ticker_dossiers"),
        }
    }
