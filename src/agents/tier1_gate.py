"""Barrier node: Tier-0 data feeds must finish before Tier-1 investors start."""

from __future__ import annotations

from typing import Any

from src.graph.state import AgentState
from src.utils.progress import progress
from src.utils.risk_pipeline import ingest_risk_into_dossiers
from src.utils.ticker_dossier import ingest_tier0_into_dossiers
from src.utils.tier0_briefing import build_tier0_briefings
from src.utils.tier0_summaries import enrich_tier0_signals, macro_briefing_appendix
from src.tools.api import get_macro_context
from src.tools.providers.keys import keys_from_state

TIER1_GATE_ID = "tier1_gate"


def tier1_gate_node(state: AgentState) -> dict[str, Any]:
    data = state["data"]
    tickers = data.get("tickers") or []
    signals = data.get("analyst_signals") or {}
    enrich_tier0_signals(signals)

    macro = data.get("macro_context")
    if not macro or not macro.get("available"):
        macro = get_macro_context(data.get("end_date"), keys_from_state(state))
        data["macro_context"] = macro

    briefings = build_tier0_briefings(signals, tickers)
    macro_block = macro_briefing_appendix(macro)
    if macro_block:
        briefings = {t: f"{b}\n\n{macro_block}" for t, b in briefings.items()}
    ingest_tier0_into_dossiers(state, tickers)
    ingest_risk_into_dossiers(state, tickers)
    dossiers = data.get("ticker_dossiers") or {}
    risk_n = sum(
        len((data.get("risk_pipeline") or {}).get(str(t).strip().upper(), {}).get("inventory") or [])
        for t in tickers
    )

    if briefings:
        msg = f"Tier-0 + risk pipeline complete — {len(briefings)} briefing(s), {risk_n} risks catalogued"
    elif risk_n:
        msg = f"Risk pipeline complete — {risk_n} risks catalogued; releasing investor floor"
    else:
        msg = "Tier-0 skipped or empty — releasing investor floor"

    progress.update_status(TIER1_GATE_ID, None, msg)

    return {
        "data": {
            "tier0_briefings": briefings,
            "tier0_complete": True,
            "ticker_dossiers": dossiers,
            "macro_context": macro,
        }
    }
