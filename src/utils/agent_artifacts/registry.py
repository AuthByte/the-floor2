"""Catalog of registered chart specs keyed by agent id.

Adding a new chart means: write a builder in `builders.py`, register a
ChartSpec here, and (optionally) bump the catalog cap in `plan.py`. The
LLM planner can only pick ids that already exist in this registry.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from src.utils.agent_artifacts.types import ChartSpec

# Floor graph nodes use `{base_key}_{6-char suffix}`; registry keys use `{base_key}_agent`.
_FLOOR_SUFFIX = re.compile(r"^[a-z0-9]{6}$")


def _builder(fn_name: str) -> Callable[[dict[str, Any]], Any]:
    """Defer importing builders (and matplotlib) until a chart is actually rendered."""

    def _build(ctx: dict[str, Any]) -> Any:
        from src.utils.agent_artifacts import builders

        return getattr(builders, fn_name)(ctx)

    return _build


def _has_prices(min_count: int):
    def check(ctx: dict[str, Any]) -> bool:
        prices = ctx.get("prices") or []
        return len(prices) >= min_count
    return check


def _has_quarterly_history(ctx: dict[str, Any]) -> bool:
    reasoning = ctx.get("reasoning") or {}
    if not isinstance(reasoning, dict):
        return False
    sec = reasoning.get("sec_earnings")
    return isinstance(sec, dict) and bool(sec.get("quarterly_history"))


def _has_pillars(ctx: dict[str, Any]) -> bool:
    reasoning = ctx.get("reasoning") or {}
    if not isinstance(reasoning, dict):
        return False
    return any(
        isinstance(v, dict) and "signal" in v
        for k, v in reasoning.items()
        if k != "sec_earnings"
    )


def _has_technical_blocks(ctx: dict[str, Any]) -> bool:
    reasoning = ctx.get("reasoning") or {}
    if not isinstance(reasoning, dict):
        return False
    return any(
        isinstance(reasoning.get(k), dict)
        for k in ("trend_following", "mean_reversion", "momentum", "volatility")
    )


def _has_line_items(min_count: int):
    def check(ctx: dict[str, Any]) -> bool:
        return len(ctx.get("line_items") or []) >= min_count
    return check


def _has_metrics(min_count: int):
    def check(ctx: dict[str, Any]) -> bool:
        return len(ctx.get("metrics") or []) >= min_count
    return check


def _has_intrinsic(ctx: dict[str, Any]) -> bool:
    reasoning = ctx.get("reasoning") or {}
    if not isinstance(reasoning, dict):
        return False
    iv = reasoning.get("intrinsic_value_analysis")
    return isinstance(iv, dict) and iv.get("intrinsic_value") is not None and reasoning.get("market_cap") is not None


def _has_valuation_multiple(ctx: dict[str, Any]) -> bool:
    metrics = ctx.get("metrics") or []
    if not metrics:
        return False
    m = metrics[0]
    for attr in (
        "price_to_earnings_ratio",
        "price_to_book_ratio",
        "price_to_sales_ratio",
        "enterprise_value_to_ebitda_ratio",
        "peg_ratio",
    ):
        val = getattr(m, attr, None)
        try:
            if val is not None and float(val) > 0:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _has_revenue_history(min_count: int):
    def check(ctx: dict[str, Any]) -> bool:
        count = 0
        for item in ctx.get("line_items") or []:
            if getattr(item, "revenue", None) is not None:
                count += 1
        return count >= min_count
    return check


def _has_growth_metrics(ctx: dict[str, Any]) -> bool:
    metrics = ctx.get("metrics") or []
    if not metrics:
        return False
    m = metrics[0]
    for attr in ("revenue_growth", "earnings_growth", "book_value_growth"):
        val = getattr(m, attr, None)
        if val is not None:
            try:
                if float(val) != 0:
                    return True
            except (TypeError, ValueError):
                continue
    return False


def _has_net_income_items(min_count: int):
    def check(ctx: dict[str, Any]) -> bool:
        count = sum(
            1 for item in ctx.get("line_items") or [] if getattr(item, "net_income", None) is not None
        )
        return count >= min_count
    return check


def _has_sec_net_income(ctx: dict[str, Any]) -> bool:
    reasoning = ctx.get("reasoning") or {}
    if not isinstance(reasoning, dict):
        return False
    sec = reasoning.get("sec_earnings")
    if not isinstance(sec, dict):
        return False
    count = sum(
        1
        for row in sec.get("quarterly_history") or []
        if isinstance(row, dict) and row.get("net_income") is not None
    )
    return count >= 2


def _has_yields(ctx: dict[str, Any]) -> bool:
    metrics = ctx.get("metrics") or []
    if not metrics:
        return False
    m = metrics[0]
    fcf_y = getattr(m, "free_cash_flow_yield", None)
    pe = getattr(m, "price_to_earnings_ratio", None)
    try:
        if fcf_y is not None and float(fcf_y) > 0:
            return True
    except (TypeError, ValueError):
        pass
    try:
        if pe is not None and float(pe) > 0:
            return True
    except (TypeError, ValueError):
        pass
    return False


def _has_roe_history(ctx: dict[str, Any]) -> bool:
    count = 0
    for m in ctx.get("metrics") or []:
        val = getattr(m, "return_on_equity", None)
        if val is not None:
            count += 1
    return count >= 2


def _has_debt_history(ctx: dict[str, Any]) -> bool:
    count = 0
    for m in ctx.get("metrics") or []:
        if getattr(m, "debt_to_equity", None) is not None:
            count += 1
    return count >= 2


# Named investor desks that route through run_legendary_agent (or share its
# data shape). Generic "*legendary" charts are offered to all of them so every
# investor produces visualizations, not just Jim Simons and Warren Buffett.
LEGENDARY_INVESTOR_IDS: frozenset[str] = frozenset(
    f"{key}_agent"
    for key in (
        "aswath_damodaran",
        "ben_graham",
        "bill_ackman",
        "cathie_wood",
        "charlie_munger",
        "michael_burry",
        "mohnish_pabrai",
        "nassim_taleb",
        "peter_lynch",
        "phil_fisher",
        "rakesh_jhunjhunwala",
        "stanley_druckenmiller",
        "george_soros",
        "jim_simons",
        "howard_marks",
        "seth_klarman",
        "john_templeton",
        "joel_greenblatt",
        "ray_dalio",
        "paul_tudor_jones",
        "carl_icahn",
        "li_lu",
        "masayoshi_son",
        "supply_chain_cartographer",
        "opportunity_cost",
        "ripple_desk",
        "bastion_moat",
        "david_einhorn",
        "unknown_unknowns",
        "warren_buffett",
    )
)

LEGENDARY_WILDCARD = "*legendary"


SPECS: tuple[ChartSpec, ...] = (
    # Jim Simons
    ChartSpec(
        id="simons_return_distribution",
        label="Daily return distribution",
        description="Histogram of daily returns with mean overlay — exposes skew and tails.",
        agent_ids=("jim_simons_agent",),
        builder=_builder("build_return_distribution"),
        min_data=_has_prices(30),
    ),
    ChartSpec(
        id="simons_rolling_volatility",
        label="Rolling annualized volatility",
        description="20-day rolling vol path. Quants want stable regimes, not spikes.",
        agent_ids=("jim_simons_agent",),
        builder=_builder("build_rolling_volatility"),
        min_data=_has_prices(40),
    ),
    ChartSpec(
        id="simons_momentum_scatter",
        label="Reversal vs momentum scatter",
        description="Plots short-window return against cumulative return to spot reversal regimes.",
        agent_ids=("jim_simons_agent",),
        builder=_builder("build_momentum_scatter"),
        min_data=_has_prices(50),
    ),
    ChartSpec(
        id="simons_weekly_heatmap",
        label="Weekly return heatmap",
        description="Color grid of rolling weekly returns — regime shifts pop visually.",
        agent_ids=("jim_simons_agent",),
        builder=_builder("build_weekly_returns_heatmap"),
        min_data=_has_prices(60),
    ),
    ChartSpec(
        id="simons_qq_plot",
        label="Return normality (Q-Q)",
        description="Quantile-quantile plot vs a normal — fat tails and skew stand out.",
        agent_ids=("jim_simons_agent",),
        builder=_builder("build_qq_plot"),
        min_data=_has_prices(40),
    ),
    # Technical analyst
    ChartSpec(
        id="technical_price_ma",
        label="Price with 50/200 SMA",
        description="Trend-following picture: price relative to short and long moving averages.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_price_ma"),
        min_data=_has_prices(60),
    ),
    ChartSpec(
        id="technical_rsi",
        label="14-period RSI",
        description="Momentum oscillator with overbought/oversold thresholds.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_rsi_panel"),
        min_data=_has_prices(30),
    ),
    ChartSpec(
        id="technical_strategy_heatmap",
        label="Strategy ensemble panel",
        description="Each technical strategy's signal and confidence side-by-side.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_strategy_heatmap"),
        min_data=_has_technical_blocks,
    ),
    ChartSpec(
        id="technical_bollinger",
        label="Bollinger bands",
        description="Price riding the 20-day band — squeeze and breakout zones.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_bollinger_bands"),
        min_data=_has_prices(40),
    ),
    ChartSpec(
        id="technical_macd",
        label="MACD panel",
        description="MACD line, signal, and histogram — momentum inflection points.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_macd_panel"),
        min_data=_has_prices(50),
    ),
    ChartSpec(
        id="technical_atr",
        label="Average true range",
        description="14-day ATR path — volatility expansion and contraction.",
        agent_ids=("technical_analyst_agent",),
        builder=_builder("build_atr_panel"),
        min_data=_has_prices(35),
    ),
    # Fundamentals analyst
    ChartSpec(
        id="fundamentals_revenue_eps",
        label="Quarterly revenue & EPS",
        description="Recent quarters of revenue and EPS from the latest SEC filings.",
        agent_ids=("fundamentals_analyst_agent",),
        builder=_builder("build_revenue_eps_bars"),
        min_data=_has_quarterly_history,
    ),
    ChartSpec(
        id="fundamentals_signal_pillars",
        label="Fundamental pillars",
        description="Bullish/bearish reading for profitability, growth, health, and ratios.",
        agent_ids=("fundamentals_analyst_agent",),
        builder=_builder("build_signal_pillars"),
        min_data=_has_pillars,
    ),
    ChartSpec(
        id="fundamentals_sec_net_income",
        label="Quarterly net income",
        description="SEC-filed net income by quarter — earnings power at a glance.",
        agent_ids=("fundamentals_analyst_agent",),
        builder=_builder("build_sec_net_income"),
        min_data=_has_sec_net_income,
    ),
    ChartSpec(
        id="fundamentals_growth_bars",
        label="Growth rate snapshot",
        description="Revenue, earnings, and book-value growth side-by-side.",
        agent_ids=("fundamentals_analyst_agent",),
        builder=_builder("build_growth_metrics_bars"),
        min_data=_has_growth_metrics,
    ),
    ChartSpec(
        id="fundamentals_debt_trend",
        label="Leverage & liquidity",
        description="Debt-to-equity trend with current-ratio overlay.",
        agent_ids=("fundamentals_analyst_agent",),
        builder=_builder("build_debt_trend"),
        min_data=_has_debt_history,
    ),
    # Warren Buffett
    ChartSpec(
        id="buffett_fcf_trend",
        label="Free cash flow & margin",
        description="Owner-earnings proxy: FCF dollars and FCF / revenue across periods.",
        agent_ids=("warren_buffett_agent",),
        builder=_builder("build_fcf_trend"),
        min_data=_has_line_items(3),
    ),
    ChartSpec(
        id="buffett_roe_debt",
        label="ROE vs debt-to-equity",
        description="Quality vs leverage trade-off — Buffett's first filter.",
        agent_ids=("warren_buffett_agent",),
        builder=_builder("build_roe_debt"),
        min_data=_has_metrics(2),
    ),
    ChartSpec(
        id="buffett_intrinsic_value",
        label="Margin of safety",
        description="Intrinsic value vs market cap — visualizes the gap.",
        agent_ids=("warren_buffett_agent",),
        builder=_builder("build_intrinsic_value_bar"),
        min_data=_has_intrinsic,
    ),
    # Generic investor charts — offered to every legendary desk.
    ChartSpec(
        id="investor_cumulative_return",
        label="Cumulative return",
        description="Total return of the price tape over the analyzed window.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_cumulative_return"),
        min_data=_has_prices(20),
    ),
    ChartSpec(
        id="investor_drawdown",
        label="Drawdown curve",
        description="Underwater plot showing peak-to-trough pain — downside risk.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_drawdown_curve"),
        min_data=_has_prices(30),
    ),
    ChartSpec(
        id="investor_price_volume",
        label="Price & volume",
        description="Closing price with traded volume — liquidity and trend context.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_price_volume"),
        min_data=_has_prices(20),
    ),
    ChartSpec(
        id="investor_valuation_multiples",
        label="Valuation multiples",
        description="Current P/E, P/B, P/S, EV/EBITDA, and PEG side-by-side.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_valuation_multiples"),
        min_data=_has_valuation_multiple,
    ),
    ChartSpec(
        id="investor_margin_trend",
        label="Margin trend",
        description="Gross, operating, and net margins across recent periods.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_margin_trend"),
        min_data=_has_metrics(2),
    ),
    ChartSpec(
        id="investor_revenue_growth",
        label="Revenue & growth",
        description="Revenue trajectory with period-over-period growth overlay.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_revenue_growth"),
        min_data=_has_revenue_history(2),
    ),
    ChartSpec(
        id="investor_price_channel",
        label="20-day price channel",
        description="Rolling high/low envelope around the tape — breakout context.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_price_channel"),
        min_data=_has_prices(40),
    ),
    ChartSpec(
        id="investor_bollinger",
        label="Bollinger bands",
        description="Volatility bands around price — mean-reversion vs trend.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_bollinger_bands"),
        min_data=_has_prices(40),
    ),
    ChartSpec(
        id="investor_roe_trend",
        label="ROE trend",
        description="Return on equity across recent reporting periods.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_roe_trend"),
        min_data=_has_roe_history,
    ),
    ChartSpec(
        id="investor_net_income",
        label="Net income trend",
        description="Reported net income by period — earnings durability.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_net_income_trend"),
        min_data=_has_net_income_items(3),
    ),
    ChartSpec(
        id="investor_yield_spread",
        label="Owner yield comparison",
        description="FCF yield vs earnings yield — cash vs accounting returns.",
        agent_ids=(LEGENDARY_WILDCARD,),
        builder=_builder("build_yield_spread"),
        min_data=_has_yields,
    ),
)


_BY_ID: dict[str, ChartSpec] = {s.id: s for s in SPECS}


def canonical_registry_agent_id(agent_id: str) -> str:
    """Normalize floor node ids to registry keys.

    LangGraph passes unique room ids such as ``warren_buffett_a1b2c3`` while
    chart specs are registered under ``warren_buffett_agent``. Already-canonical
    ids (``technical_analyst_agent``) pass through unchanged.
    """
    raw = (agent_id or "").strip()
    if not raw:
        return raw
    parts = raw.split("_")
    if len(parts) >= 2:
        last = parts[-1]
        if len(last) == 6 and _FLOOR_SUFFIX.match(last):
            return f"{'_'.join(parts[:-1])}_agent"
    if raw.endswith("_agent"):
        return raw
    return f"{raw}_agent"


def catalog_for(agent_id: str) -> list[ChartSpec]:
    """Return chart specs for a given agent id.

    Includes specs explicitly bound to the agent plus generic "*legendary"
    charts when the agent is a named investor desk.
    """
    registry_id = canonical_registry_agent_id(agent_id)
    is_legendary = registry_id in LEGENDARY_INVESTOR_IDS
    out: list[ChartSpec] = []
    for s in SPECS:
        if registry_id in s.agent_ids:
            out.append(s)
        elif is_legendary and LEGENDARY_WILDCARD in s.agent_ids:
            out.append(s)
    return out


def spec_by_id(spec_id: str) -> ChartSpec | None:
    return _BY_ID.get(spec_id)


def eligible_specs(agent_id: str, ctx: dict[str, Any]) -> list[ChartSpec]:
    """Catalog filtered by each spec's min_data guard."""
    out: list[ChartSpec] = []
    for spec in catalog_for(agent_id):
        try:
            if spec.min_data(ctx):
                out.append(spec)
        except Exception:
            continue
    return out
