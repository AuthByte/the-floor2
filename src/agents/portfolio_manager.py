import json
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate

from src.graph.state import AgentState, show_agent_reasoning
from pydantic import BaseModel, Field
from typing_extensions import Literal
from src.utils.progress import progress
from src.utils.tier0_briefing import tier0_briefing_for_ticker
from src.utils.llm import call_llm


class PortfolioDecision(BaseModel):
    action: Literal["buy", "sell", "short", "cover", "hold"]
    quantity: int = Field(description="Number of shares to trade")
    confidence: int = Field(description="Confidence 0-100")
    reasoning: str = Field(description="Reasoning for the decision")


class PortfolioManagerOutput(BaseModel):
    decisions: dict[str, PortfolioDecision] = Field(description="Dictionary of ticker to trading decisions")


##### Portfolio Management Agent #####
def portfolio_management_agent(state: AgentState, agent_id: str = "portfolio_manager"):
    """Makes final trading decisions and generates orders for multiple tickers"""

    portfolio = state["data"]["portfolio"]
    analyst_signals = state["data"]["analyst_signals"]
    tickers = state["data"]["tickers"]

    position_limits = {}
    current_prices = {}
    max_shares = {}
    signals_by_ticker = {}
    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Processing analyst signals")

        # Find the corresponding risk manager for this portfolio manager
        if agent_id.startswith("portfolio_manager_"):
            suffix = agent_id.split('_')[-1]
            risk_manager_id = f"risk_management_agent_{suffix}"
        else:
            risk_manager_id = "risk_management_agent"  # Fallback for CLI

        risk_data = analyst_signals.get(risk_manager_id, {}).get(ticker, {})
        position_limits[ticker] = risk_data.get("remaining_position_limit", 0.0)
        current_prices[ticker] = float(risk_data.get("current_price", 0.0))

        # Calculate maximum shares allowed based on position limit and price
        if current_prices[ticker] > 0:
            max_shares[ticker] = int(position_limits[ticker] // current_prices[ticker])
        else:
            max_shares[ticker] = 0

        # Compress analyst signals to {sig, conf, horizon, target}
        ticker_signals = {}
        for agent, signals in analyst_signals.items():
            if not agent.startswith("risk_management_agent") and ticker in signals:
                bucket = signals[ticker]
                sig = bucket.get("signal")
                conf = bucket.get("confidence")
                if conf is None and bucket.get("conviction") is not None:
                    try:
                        conf = round(min(abs(float(bucket["conviction"])), 1.0) * 100)
                    except (TypeError, ValueError):
                        conf = None
                if sig is not None and conf is not None:
                    compact = {"sig": sig, "conf": conf}
                    if bucket.get("user_consulted"):
                        compact["user_consulted"] = True
                    for src, dst in (
                        ("time_horizon_months", "horizon_mo"),
                        ("price_target", "target"),
                        ("upside_pct", "upside_pct"),
                    ):
                        if bucket.get(src) is not None:
                            compact[dst] = bucket[src]
                    ticker_signals[agent] = compact
        signals_by_ticker[ticker] = ticker_signals

    state["data"]["current_prices"] = current_prices

    progress.update_status(agent_id, None, "Generating trading decisions")

    run_id = state["data"].get("run_id")
    if run_id:
        from src.utils.live_run_registry import get_session

        live = get_session(run_id)
        if live:
            live.set_phase("pm")

    result = generate_trading_decision(
        tickers=tickers,
        signals_by_ticker=signals_by_ticker,
        current_prices=current_prices,
        max_shares=max_shares,
        portfolio=portfolio,
        agent_id=agent_id,
        state=state,
    )

    if run_id:
        from src.utils.live_run_registry import get_session

        live = get_session(run_id)
        if live:
            for t, decision in result.decisions.items():
                if t not in live.pm_baselines:
                    live.pm_baselines[t] = decision.model_dump()

    message = HumanMessage(
        content=json.dumps({ticker: decision.model_dump() for ticker, decision in result.decisions.items()}),
        name=agent_id,
    )

    if state["metadata"]["show_reasoning"]:
        show_agent_reasoning({ticker: decision.model_dump() for ticker, decision in result.decisions.items()},
                             "Portfolio Manager")

    progress.update_status(agent_id, None, "Done")

    return {
        "messages": state["messages"] + [message],
        "data": state["data"],
    }


def compute_allowed_actions(
        tickers: list[str],
        current_prices: dict[str, float],
        max_shares: dict[str, int],
        portfolio: dict[str, float],
) -> dict[str, dict[str, int]]:
    """Compute allowed actions and max quantities for each ticker deterministically."""
    allowed = {}
    cash = float(portfolio.get("cash", 0.0))
    positions = portfolio.get("positions", {}) or {}
    margin_requirement = float(portfolio.get("margin_requirement", 0.5))
    margin_used = float(portfolio.get("margin_used", 0.0))
    equity = float(portfolio.get("equity", cash))

    for ticker in tickers:
        price = float(current_prices.get(ticker, 0.0))
        pos = positions.get(
            ticker,
            {"long": 0, "long_cost_basis": 0.0, "short": 0, "short_cost_basis": 0.0},
        )
        long_shares = int(pos.get("long", 0) or 0)
        short_shares = int(pos.get("short", 0) or 0)
        max_qty = int(max_shares.get(ticker, 0) or 0)

        # Start with zeros
        actions = {"buy": 0, "sell": 0, "short": 0, "cover": 0, "hold": 0}

        # Long side
        if long_shares > 0:
            actions["sell"] = long_shares
        if cash > 0 and price > 0:
            max_buy_cash = int(cash // price)
            max_buy = max(0, min(max_qty, max_buy_cash))
            if max_buy > 0:
                actions["buy"] = max_buy

        # Short side
        if short_shares > 0:
            actions["cover"] = short_shares
        if price > 0 and max_qty > 0:
            if margin_requirement <= 0.0:
                # If margin requirement is zero or unset, only cap by max_qty
                max_short = max_qty
            else:
                available_margin = max(0.0, (equity / margin_requirement) - margin_used)
                max_short_margin = int(available_margin // price)
                max_short = max(0, min(max_qty, max_short_margin))
            if max_short > 0:
                actions["short"] = max_short

        # Hold always valid
        actions["hold"] = 0

        # Prune zero-capacity actions to reduce tokens, keep hold
        pruned = {"hold": 0}
        for k, v in actions.items():
            if k != "hold" and v > 0:
                pruned[k] = v

        allowed[ticker] = pruned

    return allowed


class _RationaleOutput(BaseModel):
    rationale: dict[str, str] = Field(default_factory=dict, description="ticker -> one-line rationale")


def generate_trading_decision(
        tickers: list[str],
        signals_by_ticker: dict[str, dict],
        current_prices: dict[str, float],
        max_shares: dict[str, int],
        portfolio: dict[str, float],
        agent_id: str,
        state: AgentState,
        *,
        chair_context: bool = False,
) -> PortfolioManagerOutput:
    """Conviction ensemble picks action and size; the LLM only writes the rationale."""
    from src.desk.ensemble import decide, fallback_rationale, tally

    allowed_actions_full = compute_allowed_actions(tickers, current_prices, max_shares, portfolio)
    positions = portfolio.get("positions", {}) or {}

    decisions: dict[str, PortfolioDecision] = {}
    tallies = {}
    for t in tickers:
        tl = tally(signals_by_ticker.get(t, {}))
        tallies[t] = tl
        action, qty, conf = decide(tl, allowed_actions_full.get(t, {"hold": 0}), positions.get(t))
        decisions[t] = PortfolioDecision(
            action=action,
            quantity=qty,
            confidence=int(round(conf)),
            reasoning=fallback_rationale(t, action, qty, tl),
        )
        progress.update_status(agent_id, t, f"Committee net {tl.net:+.2f} → {action} {qty}")

    state["data"]["committee_tally"] = {t: tl.to_dict() for t, tl in tallies.items()}

    worth_explaining = [t for t in tickers if tallies[t].voters]
    if not worth_explaining:
        return PortfolioManagerOutput(decisions=decisions)

    brief = {
        t: {
            "decision": f"{decisions[t].action} {decisions[t].quantity}",
            "net": round(tallies[t].net, 2),
            "split": f"{tallies[t].bulls} bull / {tallies[t].bears} bear / {tallies[t].neutrals} neutral",
            "for": tallies[t].top_for,
            "against": tallies[t].top_against,
            "desk": tier0_briefing_for_ticker(state, t) or "",
        }
        for t in worth_explaining
    }
    chair_note = (
        "The chair consulted desks mid-shift; mention it if it moved the decision. "
        if chair_context
        else ""
    )
    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are the portfolio manager signing the committee memo. The decisions are final and were "
                "computed from the committee vote; do not change or second-guess them. "
                + chair_note
                + "For each ticker write one plain sentence (max 140 chars) explaining the decision: "
                "the deciding argument and the strongest dissent. Return JSON only.",
            ),
            (
                "human",
                '{brief}\n\nReturn: {{"rationale": {{"TICKER": "..."}}}}',
            ),
        ]
    )
    prompt = template.invoke({"brief": json.dumps(brief, ensure_ascii=False, default=str)[:12000]})
    out = call_llm(
        prompt=prompt,
        pydantic_model=_RationaleOutput,
        agent_name=agent_id,
        state=state,
        default_factory=_RationaleOutput,
    )
    for t, line in (out.rationale or {}).items():
        key = t.upper() if t.upper() in decisions else t
        if key in decisions and line and line.strip():
            decisions[key].reasoning = line.strip()[:200]
    return PortfolioManagerOutput(decisions=decisions)
