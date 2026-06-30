"""Insider Activity Desk — public Form 4 filing cluster watch."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from src.agents._insider_utils import (
    compute_insider_metrics,
    normalize_trades,
    score_insider_activity,
)
from src.agents._legendary_investor_utils import run_legendary_agent
from src.graph.state import AgentState
from src.tools.api import get_insider_trades
from src.tools.providers.keys import keys_from_state
from src.utils.interactive_artifacts import build_insider_cluster_card, build_insider_timeline
from src.utils.progress import progress


def insider_activity_desk_agent(state: AgentState, agent_id: str = "insider_activity_desk_agent"):
    """Tier-0 desk agent for legal public insider filing activity."""
    data = state["data"]
    end_date = data["end_date"]
    api_keys = keys_from_state(state)
    lookback_start = (datetime.fromisoformat(end_date) - timedelta(days=365)).date().isoformat()
    by_ticker: dict[str, list] = data.setdefault("insider_trades_by_ticker", {})

    for ticker in data.get("tickers") or []:
        key = str(ticker).strip().upper()
        if key not in by_ticker:
            progress.update_status(agent_id, key, "Prefetching Form 4 filings")
            by_ticker[key] = get_insider_trades(
                key,
                end_date=end_date,
                start_date=lookback_start,
                limit=500,
                api_key=api_keys,
            )

    return run_legendary_agent(
        state=state,
        agent_id=agent_id,
        investor_name="Insider Activity Desk",
        agent_label="Insider Activity Desk (Form 4 Watch)",
        persona=(
            "You are the Insider Activity Desk. You read only public Form 4 filings and licensed feeds. "
            "You care about clusters (multiple insiders buying within 30 days), meaningful dollar amounts, "
            "10b5-1 plan sales (less informative), and officer rank (CEO/CFO > director). "
            "You are skeptical of single small sales. Bullish on coordinated open-market buying after "
            "drawdowns; bearish on heavy officer selling without buybacks. "
            "Filing activity does not prove intent, timing edge, or future performance."
        ),
        checklist=[
            "Net shares bought vs sold (90d / 12m windows)",
            "Count of distinct insiders on buy side vs sell side",
            "Largest transactions by dollar value",
            "Filing velocity (filings per month vs baseline)",
            "10b5-1 flagged sales vs discretionary",
            "How this compares to price trend (context only)",
        ],
        analysis_fn=analyze_insider_activity_desk,
        extra_artifacts_fn=lambda t, a, _c, _s: [
            build_insider_timeline(t, a),
            build_insider_cluster_card(t, a),
        ],
    )


def analyze_insider_activity_desk(ctx: dict[str, Any]) -> dict[str, Any]:
    end_date = ctx.get("end_date") or datetime.utcnow().date().isoformat()
    trades = normalize_trades(ctx.get("insider_trades") or [], as_of=end_date)
    metrics = compute_insider_metrics(trades, as_of=end_date)
    scored = score_insider_activity(metrics, mode="desk")
    return {**metrics, **scored}
