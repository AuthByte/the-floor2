"""Smoke tests for agent chart builders.

Each builder is exercised with the minimum fixture it needs and asserted
to produce a non-empty PNG. We exercise builders directly so the test does
not require the LLM dependency stack.
"""

from __future__ import annotations

import random
from types import SimpleNamespace

import pytest

from src.utils.agent_artifacts.builders import (
    build_atr_panel,
    build_bollinger_bands,
    build_cumulative_return,
    build_debt_trend,
    build_drawdown_curve,
    build_fcf_trend,
    build_growth_metrics_bars,
    build_intrinsic_value_bar,
    build_macd_panel,
    build_margin_trend,
    build_momentum_scatter,
    build_net_income_trend,
    build_price_channel,
    build_price_ma,
    build_price_volume,
    build_qq_plot,
    build_return_distribution,
    build_revenue_eps_bars,
    build_revenue_growth,
    build_roe_debt,
    build_roe_trend,
    build_rolling_volatility,
    build_rsi_panel,
    build_sec_net_income,
    build_signal_pillars,
    build_strategy_heatmap,
    build_valuation_multiples,
    build_weekly_returns_heatmap,
    build_yield_spread,
)
from src.utils.agent_artifacts.registry import canonical_registry_agent_id, eligible_specs
from src.utils.agent_artifacts.render import figure_to_png_bytes


def _make_prices(n: int = 220, seed: int = 7) -> list[SimpleNamespace]:
    rng = random.Random(seed)
    prices = []
    close = 100.0
    for i in range(n):
        close = max(1.0, close * (1 + rng.uniform(-0.02, 0.025)))
        prices.append(
            SimpleNamespace(
                time=f"2024-01-{i:03d}",
                close=close,
                volume=rng.randint(500_000, 5_000_000),
            )
        )
    return prices


def _make_metrics(n: int = 4) -> list[SimpleNamespace]:
    out = []
    for i in range(n):
        out.append(
            SimpleNamespace(
                return_on_equity=0.12 + 0.01 * i,
                debt_to_equity=0.4 + 0.02 * i,
                gross_margin=0.42 - 0.005 * i,
                operating_margin=0.18,
                net_margin=0.12,
                revenue_growth=0.10,
                earnings_growth=0.08,
                free_cash_flow_yield=0.05,
                price_to_earnings_ratio=24.0 + i,
                price_to_book_ratio=6.5,
                price_to_sales_ratio=5.2,
                enterprise_value_to_ebitda_ratio=18.0,
                peg_ratio=1.4,
            )
        )
    return out


def _make_line_items(n: int = 6) -> list[SimpleNamespace]:
    return [
        SimpleNamespace(
            free_cash_flow=1_000_000_000 + i * 50_000_000,
            revenue=10_000_000_000 + i * 200_000_000,
            net_income=1_500_000_000,
            operating_income=2_000_000_000,
            earnings_per_share=2.5,
        )
        for i in range(n)
    ]


def _technical_reasoning() -> dict[str, dict]:
    return {
        "trend_following": {"signal": "bullish", "confidence": 72},
        "mean_reversion": {"signal": "neutral", "confidence": 50},
        "momentum": {"signal": "bullish", "confidence": 65},
        "volatility": {"signal": "bearish", "confidence": 55},
        "statistical_arbitrage": {"signal": "neutral", "confidence": 48},
    }


def _fundamentals_reasoning() -> dict:
    return {
        "profitability_signal": {"signal": "bullish", "details": "ROE 18%"},
        "growth_signal": {"signal": "bullish", "details": "Revenue +12%"},
        "financial_health_signal": {"signal": "neutral", "details": "D/E 0.6"},
        "price_ratios_signal": {"signal": "bearish", "details": "P/E 32"},
        "sec_earnings": {
            "headline": "Beat on revenue",
            "quarterly_history": [
                {"fiscal_period": "Q4-24", "revenue": 12_500_000_000, "eps": 2.4},
                {"fiscal_period": "Q3-24", "revenue": 11_800_000_000, "eps": 2.2},
                {"fiscal_period": "Q2-24", "revenue": 11_000_000_000, "eps": 2.0},
                {"fiscal_period": "Q1-24", "revenue": 10_200_000_000, "eps": 1.8},
            ],
        },
    }


def _assert_png(fig) -> None:
    data = figure_to_png_bytes(fig)
    assert isinstance(data, bytes)
    assert len(data) > 500
    assert data[:8] == b"\x89PNG\r\n\x1a\n"


# ---------- Builders ------------------------------------------------------


def test_return_distribution_renders():
    _assert_png(build_return_distribution({"prices": _make_prices(120)}))


def test_rolling_volatility_renders():
    _assert_png(build_rolling_volatility({"prices": _make_prices(120)}))


def test_momentum_scatter_renders():
    _assert_png(build_momentum_scatter({"prices": _make_prices(140)}))


def test_price_ma_renders():
    _assert_png(build_price_ma({"prices": _make_prices(220)}))


def test_rsi_renders():
    _assert_png(build_rsi_panel({"prices": _make_prices(80)}))


def test_strategy_heatmap_renders():
    _assert_png(build_strategy_heatmap({"reasoning": _technical_reasoning()}))


def test_revenue_eps_bars_renders():
    _assert_png(build_revenue_eps_bars({"reasoning": _fundamentals_reasoning()}))


def test_signal_pillars_renders():
    _assert_png(build_signal_pillars({"reasoning": _fundamentals_reasoning()}))


def test_fcf_trend_renders():
    _assert_png(build_fcf_trend({"line_items": _make_line_items()}))


def test_roe_debt_renders():
    _assert_png(build_roe_debt({"metrics": _make_metrics()}))


def test_intrinsic_value_renders():
    fig = build_intrinsic_value_bar(
        {
            "reasoning": {
                "intrinsic_value_analysis": {"intrinsic_value": 95_000_000_000},
                "market_cap": 80_000_000_000,
            }
        }
    )
    _assert_png(fig)


# ---------- Generic investor builders ------------------------------------


def test_cumulative_return_renders():
    _assert_png(build_cumulative_return({"prices": _make_prices(120)}))


def test_drawdown_curve_renders():
    _assert_png(build_drawdown_curve({"prices": _make_prices(120)}))


def test_price_volume_renders():
    _assert_png(build_price_volume({"prices": _make_prices(120)}))


def test_valuation_multiples_renders():
    _assert_png(build_valuation_multiples({"metrics": _make_metrics()}))


def test_margin_trend_renders():
    _assert_png(build_margin_trend({"metrics": _make_metrics()}))


def test_revenue_growth_renders():
    _assert_png(build_revenue_growth({"line_items": _make_line_items()}))


def test_bollinger_renders():
    _assert_png(build_bollinger_bands({"prices": _make_prices(120)}))


def test_macd_renders():
    _assert_png(build_macd_panel({"prices": _make_prices(120)}))


def test_atr_renders():
    _assert_png(build_atr_panel({"prices": _make_prices(80)}))


def test_price_channel_renders():
    _assert_png(build_price_channel({"prices": _make_prices(120)}))


def test_weekly_heatmap_renders():
    _assert_png(build_weekly_returns_heatmap({"prices": _make_prices(140)}))


def test_qq_plot_renders():
    _assert_png(build_qq_plot({"prices": _make_prices(120)}))


def test_roe_trend_renders():
    _assert_png(build_roe_trend({"metrics": _make_metrics()}))


def test_growth_metrics_bars_renders():
    _assert_png(build_growth_metrics_bars({"metrics": _make_metrics()}))


def test_net_income_trend_renders():
    _assert_png(build_net_income_trend({"line_items": _make_line_items()}))


def test_sec_net_income_renders():
    _assert_png(build_sec_net_income({"reasoning": _fundamentals_reasoning()}))


def test_debt_trend_renders():
    _assert_png(build_debt_trend({"metrics": _make_metrics()}))


def test_yield_spread_renders():
    _assert_png(build_yield_spread({"metrics": _make_metrics()}))


# ---------- Registry guards ----------------------------------------------


def test_canonical_registry_agent_id_maps_floor_nodes():
    assert canonical_registry_agent_id("warren_buffett_a1b2c3") == "warren_buffett_agent"
    assert canonical_registry_agent_id("technical_analyst_agent") == "technical_analyst_agent"
    assert canonical_registry_agent_id("jim_simons_x9y8z7") == "jim_simons_agent"


def test_eligible_specs_accepts_floor_room_ids():
    ctx = {
        "ticker": "AAPL",
        "prices": _make_prices(220),
        "reasoning": _technical_reasoning(),
    }
    room_id = "technical_analyst_a1b2c3"
    ids = {s.id for s in eligible_specs(room_id, ctx)}
    assert "technical_price_ma" in ids


def test_eligible_specs_filters_on_min_data():
    ctx_full = {
        "ticker": "AAPL",
        "prices": _make_prices(220),
        "reasoning": _technical_reasoning(),
    }
    techs = eligible_specs("technical_analyst_agent", ctx_full)
    assert {s.id for s in techs} >= {"technical_price_ma", "technical_rsi", "technical_strategy_heatmap"}

    ctx_empty = {"ticker": "AAPL", "prices": [], "reasoning": {}}
    assert eligible_specs("technical_analyst_agent", ctx_empty) == []


def test_eligible_specs_uses_quarterly_history_for_fundamentals():
    ctx = {"ticker": "AAPL", "reasoning": _fundamentals_reasoning()}
    ids = {s.id for s in eligible_specs("fundamentals_analyst_agent", ctx)}
    assert "fundamentals_revenue_eps" in ids
    assert "fundamentals_signal_pillars" in ids


def test_eligible_specs_for_buffett():
    ctx = {
        "metrics": _make_metrics(),
        "line_items": _make_line_items(),
        "reasoning": {
            "intrinsic_value_analysis": {"intrinsic_value": 95_000_000_000},
            "market_cap": 80_000_000_000,
        },
    }
    ids = {s.id for s in eligible_specs("warren_buffett_agent", ctx)}
    # Buffett keeps his bespoke charts AND inherits the generic investor charts.
    assert {"buffett_fcf_trend", "buffett_roe_debt", "buffett_intrinsic_value"} <= ids
    assert "investor_valuation_multiples" in ids


def test_legendary_investors_get_generic_charts():
    """Any named investor desk should be offered the generic chart catalog."""
    ctx = {
        "ticker": "AAPL",
        "prices": _make_prices(120),
        "metrics": _make_metrics(),
        "line_items": _make_line_items(),
    }
    for agent_id in ("ben_graham_agent", "cathie_wood_agent", "ray_dalio_agent"):
        ids = {s.id for s in eligible_specs(agent_id, ctx)}
        assert {
            "investor_cumulative_return",
            "investor_drawdown",
            "investor_price_volume",
            "investor_valuation_multiples",
            "investor_margin_trend",
            "investor_revenue_growth",
        } <= ids, f"{agent_id} missing generic charts: {ids}"


# ---------- Custom chart sandbox ------------------------------------------


def test_sandbox_rejects_unsafe_code():
    from src.utils.agent_artifacts.sandbox import UnsafeChartCodeError, validate_chart_code

    with pytest.raises(UnsafeChartCodeError):
        validate_chart_code("open('/etc/passwd')")
    with pytest.raises(UnsafeChartCodeError):
        validate_chart_code("import os\nfig = None")


def test_sandbox_runs_simple_custom_chart():
    from src.utils.agent_artifacts.render import figure_to_png_bytes
    from src.utils.agent_artifacts.sandbox import run_custom_chart

    code = """
fig, ax = new_figure()
closes = prices_df["close"].tolist() if not prices_df.empty else []
ax.plot(closes, color=PHOS, linewidth=1.2)
style_chart_title(ax, f"{ctx.get('ticker')} lens", kicker="CUSTOM DESK")
"""
    fig = run_custom_chart(code, {"ticker": "AAPL", "prices": _make_prices(80)})
    png = figure_to_png_bytes(fig)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_attach_artifacts_includes_custom_slot(tmp_path, monkeypatch):
    from src.utils.agent_artifacts import publish, set_run_artifact_root
    from src.utils.agent_artifacts.plan import _fallback_plan
    from src.utils.agent_artifacts.types import CustomChartDraft

    monkeypatch.setattr(publish, "ARTIFACT_ROOT", tmp_path)
    monkeypatch.setattr(
        publish,
        "plan_charts",
        lambda **kwargs: _fallback_plan(kwargs["eligible"], kwargs["ticker"]),
    )
    custom_code = """
fig, ax = new_figure()
ax.plot(prices_df["close"], color=PHOS)
style_chart_title(ax, "Custom AAPL", kicker="CUSTOM DESK")
"""
    monkeypatch.setattr(
        publish,
        "plan_custom_chart",
        lambda **kwargs: CustomChartDraft(
            title="Agent custom view",
            caption="Bespoke price lens for this ticker.",
            code=custom_code,
        ),
    )
    set_run_artifact_root("testrun")
    try:
        out = publish.attach_artifacts(
            agent_id="technical_analyst_a1b2c3",
            investor_name="Technical Analyst",
            ticker="AAPL",
            state=None,
            metrics_ctx={"ticker": "AAPL", "prices": _make_prices(80)},
            reasoning_payload=_technical_reasoning(),
        )
    finally:
        set_run_artifact_root(None)

    ids = {a["id"] for a in out}
    assert "agent_custom_chart" in ids
    assert any(a["url"].endswith("agent_custom_chart.png") for a in out)


# ---------- Top-level publisher path -------------------------------------


def test_attach_artifacts_writes_png_and_returns_metadata(tmp_path, monkeypatch):
    """`attach_artifacts` plans → renders → saves PNGs and returns URL metadata.

    The LLM planner is bypassed via the deterministic fallback so the test
    never touches network code.
    """
    from src.utils.agent_artifacts import publish, set_run_artifact_root
    from src.utils.agent_artifacts.plan import _fallback_plan

    monkeypatch.setattr(publish, "ARTIFACT_ROOT", tmp_path)
    monkeypatch.setattr(
        publish,
        "plan_charts",
        lambda **kwargs: _fallback_plan(kwargs["eligible"], kwargs["ticker"]),
    )
    monkeypatch.setattr(publish, "plan_custom_chart", lambda **kwargs: None)
    set_run_artifact_root("testrun")
    try:
        out = publish.attach_artifacts(
            agent_id="technical_analyst_agent",
            investor_name="Technical Analyst",
            ticker="AAPL",
            state=None,
            metrics_ctx={"ticker": "AAPL", "prices": _make_prices(220)},
            reasoning_payload=_technical_reasoning(),
        )
    finally:
        set_run_artifact_root(None)

    assert out, "expected at least one rendered artifact"
    for art in out:
        assert art["url"].startswith("/artifacts/testrun/technical_analyst_agent/AAPL/")
    files = list(
        (tmp_path / "testrun" / "technical_analyst_agent" / "AAPL").glob("*.png")
    )
    assert files, "no PNG files written to artifact root"


def test_attach_artifacts_skips_when_no_data(tmp_path, monkeypatch):
    from src.utils.agent_artifacts import publish, set_run_artifact_root
    from src.utils.agent_artifacts.plan import _fallback_plan

    monkeypatch.setattr(publish, "ARTIFACT_ROOT", tmp_path)
    monkeypatch.setattr(
        publish,
        "plan_charts",
        lambda **kwargs: _fallback_plan(kwargs["eligible"], kwargs["ticker"]),
    )
    monkeypatch.setattr(publish, "plan_custom_chart", lambda **kwargs: None)
    set_run_artifact_root("testrun")
    try:
        out = publish.attach_artifacts(
            agent_id="jim_simons_agent",
            investor_name="Jim Simons",
            ticker="AAPL",
            state=None,
            metrics_ctx={"ticker": "AAPL", "prices": []},
            reasoning_payload={},
        )
    finally:
        set_run_artifact_root(None)
    assert out == []
