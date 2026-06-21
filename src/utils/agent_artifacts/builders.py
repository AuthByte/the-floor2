"""Concrete matplotlib chart builders, one function per ChartSpec."""

from __future__ import annotations

import math
import statistics
from typing import Any

import numpy as np

from src.utils.agent_artifacts.render import (
    AMBER,
    BRASS,
    BRASS_DIM,
    DEFAULT_FIG_SIZE,
    GRID,
    INK_700,
    INK_800,
    MUTED,
    PHOS,
    PHOS_DIM,
    PHOS_GLOW,
    SIREN,
    SIREN_DIM,
    TEXT,
    WIRE_300,
    WIRE_400,
    apply_floor_style,
    new_figure,
    signal_color,
    style_chart_title,
    style_legend,
    style_twin_axis,
)


def _closes(prices: list[Any]) -> list[float]:
    sorted_prices = sorted(prices, key=lambda p: getattr(p, "time", "") or "")
    return [
        float(getattr(p, "close"))
        for p in sorted_prices
        if getattr(p, "close", None) is not None
    ]


def _returns(closes: list[float]) -> list[float]:
    return [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes))
        if closes[i - 1] > 0
    ]


def _nan_series(values: list[float | None]) -> list[float]:
    return [float("nan") if v is None else float(v) for v in values]


def _ema(values: list[float], span: int) -> list[float | None]:
    if not values:
        return []
    alpha = 2 / (span + 1)
    out: list[float | None] = [values[0]]
    for v in values[1:]:
        prev = out[-1]
        out.append(alpha * v + (1 - alpha) * (prev if prev is not None else v))
    return out


def _ohlc(prices: list[Any]) -> tuple[list[float], list[float], list[float]]:
    sorted_prices = sorted(prices, key=lambda p: getattr(p, "time", "") or "")
    highs, lows, closes = [], [], []
    for p in sorted_prices:
        close = getattr(p, "close", None)
        if close is None:
            continue
        closes.append(float(close))
        highs.append(float(getattr(p, "high", close) or close))
        lows.append(float(getattr(p, "low", close) or close))
    return highs, lows, closes


def _safe(metric: Any, attr: str) -> float | None:
    val = getattr(metric, attr, None)
    if val is None:
        return None
    try:
        v = float(val)
        return None if math.isnan(v) else v
    except (TypeError, ValueError):
        return None


# ---------- Jim Simons ----------------------------------------------------


def build_return_distribution(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    rets = [r * 100 for r in _returns(closes)]
    fig, ax = new_figure()
    ax.hist(
        rets,
        bins=30,
        color=PHOS,
        edgecolor=PHOS_DIM,
        alpha=0.72,
        linewidth=0.4,
    )
    mean_r = statistics.fmean(rets) if rets else 0.0
    ax.axvline(0, color=WIRE_400, linewidth=0.65, linestyle=(0, (4, 3)), alpha=0.8)
    ax.axvline(mean_r, color=BRASS, linewidth=1.1, label=f"mean {mean_r:+.2f}%")
    style_chart_title(ax, "Daily return distribution", kicker="QUANT DESK")
    ax.set_xlabel("Daily return (%)")
    ax.set_ylabel("Frequency")
    style_legend(ax, loc="upper right")
    return fig


def build_rolling_volatility(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    rets = _returns(closes)
    window = 20
    if len(rets) < window + 1:
        window = max(5, len(rets) // 3)
    rolling = [
        statistics.pstdev(rets[i - window : i]) * math.sqrt(252) * 100
        for i in range(window, len(rets) + 1)
    ]
    fig, ax = new_figure()
    ax.plot(range(len(rolling)), rolling, color=PHOS_GLOW, linewidth=1.35)
    ax.fill_between(range(len(rolling)), rolling, color=PHOS, alpha=0.14)
    style_chart_title(ax, f"Rolling {window}-day annualized vol", kicker="QUANT DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Vol (%)")
    return fig


def build_momentum_scatter(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    rets = _returns(closes)
    win = 20
    if len(rets) < win * 2:
        win = max(5, len(rets) // 3)
    short, full = [], []
    for i in range(win, len(rets)):
        short.append(sum(rets[i - win : i]) * 100)
        full.append(sum(rets[: i + 1]) * 100)
    fig, ax = new_figure()
    if short:
        colors = [PHOS if s >= 0 else SIREN for s in short]
        ax.scatter(short, full, c=colors, s=22, alpha=0.78, edgecolors=INK_800, linewidths=0.35)
    ax.axhline(0, color=WIRE_400, linewidth=0.55, linestyle=(0, (4, 3)), alpha=0.75)
    ax.axvline(0, color=WIRE_400, linewidth=0.55, linestyle=(0, (4, 3)), alpha=0.75)
    style_chart_title(ax, f"{win}-day reversal vs momentum", kicker="QUANT DESK")
    ax.set_xlabel(f"{win}-day return (%)")
    ax.set_ylabel("Cumulative return (%)")
    return fig


# ---------- Technical analyst --------------------------------------------


def _prices_xy(prices: list[Any]) -> tuple[list[float], list[float]]:
    sorted_prices = sorted(prices, key=lambda p: getattr(p, "time", "") or "")
    closes = [
        float(getattr(p, "close"))
        for p in sorted_prices
        if getattr(p, "close", None) is not None
    ]
    return list(range(len(closes))), closes


def _sma(values: list[float], window: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(values)):
        if i + 1 < window:
            out.append(None)
        else:
            out.append(statistics.fmean(values[i + 1 - window : i + 1]))
    return out


def build_price_ma(ctx: dict[str, Any]):
    x, closes = _prices_xy(ctx.get("prices") or [])
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    fig, ax = new_figure()
    ax.plot(x, closes, color=WIRE_300, linewidth=1.15, label="close", alpha=0.95)
    ax.plot(x, sma50, color=PHOS, linewidth=1.05, label="SMA 50", alpha=0.95)
    ax.plot(x, sma200, color=BRASS, linewidth=1.0, label="SMA 200", alpha=0.9)
    style_chart_title(ax, "Price with moving averages", kicker="TECH DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Price")
    style_legend(ax, loc="upper left")
    return fig


def build_rsi_panel(ctx: dict[str, Any]):
    _, closes = _prices_xy(ctx.get("prices") or [])
    period = 14
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    rsi: list[float | None] = [None] * period
    for i in range(period, len(gains) + 1):
        avg_g = statistics.fmean(gains[i - period : i]) or 1e-9
        avg_l = statistics.fmean(losses[i - period : i]) or 1e-9
        rs = avg_g / avg_l
        rsi.append(100 - 100 / (1 + rs))
    fig, ax = new_figure()
    ax.plot(range(len(rsi)), rsi, color=BRASS, linewidth=1.25)
    ax.axhline(70, color=SIREN, linewidth=0.75, linestyle=(0, (5, 3)), alpha=0.85)
    ax.axhline(30, color=PHOS, linewidth=0.75, linestyle=(0, (5, 3)), alpha=0.85)
    ax.fill_between(range(len(rsi)), 30, 70, color=INK_700, alpha=0.55)
    ax.set_ylim(0, 100)
    style_chart_title(ax, f"{period}-period RSI", kicker="TECH DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("RSI")
    return fig


def build_strategy_heatmap(ctx: dict[str, Any]):
    reasoning: dict[str, Any] = ctx.get("reasoning") or {}
    rows: list[tuple[str, str, float]] = []
    for key in (
        "trend_following",
        "mean_reversion",
        "momentum",
        "volatility",
        "statistical_arbitrage",
    ):
        block = reasoning.get(key)
        if isinstance(block, dict):
            rows.append(
                (
                    key.replace("_", " ").title(),
                    str(block.get("signal", "neutral")),
                    float(block.get("confidence", 0) or 0),
                )
            )
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], max(3.2, 0.55 * len(rows) + 1.8)))
    apply_floor_style(fig, ax)
    ax.set_xlim(0, 100)
    ax.set_ylim(-0.5, len(rows) - 0.5)
    ax.invert_yaxis()
    for i, (label, sig, conf) in enumerate(rows):
        color = signal_color(sig)
        ax.barh(i, conf, color=color, alpha=0.82, height=0.52, edgecolor=INK_800, linewidth=0.4)
        ax.text(2, i, f"{label}  · {sig}", color=TEXT, fontsize=8.5, va="center", fontfamily="monospace")
        ax.text(max(conf + 2, 6), i, f"{conf:.0f}%", color=MUTED, fontsize=7.5, va="center")
    ax.set_yticks([])
    style_chart_title(ax, "Strategy ensemble", kicker="TECH DESK")
    ax.set_xlabel("Confidence (%)")
    return fig


# ---------- Fundamentals analyst -----------------------------------------


def _quarterly_history(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    reasoning = ctx.get("reasoning") or {}
    sec = reasoning.get("sec_earnings") if isinstance(reasoning, dict) else None
    if isinstance(sec, dict):
        hist = sec.get("quarterly_history") or []
        return [h for h in hist if isinstance(h, dict)]
    return []


def build_revenue_eps_bars(ctx: dict[str, Any]):
    hist = list(reversed(_quarterly_history(ctx)))
    labels = [h.get("fiscal_period") or h.get("period_end") or "" for h in hist]
    revenue = [float(h.get("revenue") or 0) / 1e9 for h in hist]
    eps = [float(h.get("eps") or 0) for h in hist]
    fig, ax = new_figure()
    x = np.arange(len(labels))
    ax.bar(x, revenue, color=PHOS, alpha=0.68, edgecolor=PHOS_DIM, linewidth=0.35, label="Revenue ($B)")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=28, ha="right", color=MUTED, fontsize=7.5, fontfamily="monospace")
    ax.set_ylabel("Revenue ($B)")
    ax2 = ax.twinx()
    ax2.plot(x, eps, color=BRASS, marker="o", markersize=4, linewidth=1.25, label="EPS")
    ax2.set_ylabel("EPS ($)", color=BRASS)
    style_twin_axis(ax2, BRASS)
    style_chart_title(ax, "Quarterly revenue & EPS", kicker="SEC DESK")
    return fig


def build_signal_pillars(ctx: dict[str, Any]):
    reasoning = ctx.get("reasoning") or {}
    pillars: list[tuple[str, str]] = []
    for key, block in reasoning.items():
        if key == "sec_earnings":
            continue
        if isinstance(block, dict) and "signal" in block:
            pillars.append((key.replace("_signal", "").replace("_", " "), str(block["signal"])))
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], max(3.4, 0.65 * len(pillars) + 1.6)))
    apply_floor_style(fig, ax)
    ax.set_xlim(-1, 1)
    ax.set_ylim(-0.5, len(pillars) - 0.5)
    ax.invert_yaxis()
    for i, (label, sig) in enumerate(pillars):
        val = 1 if sig == "bullish" else -1 if sig == "bearish" else 0
        color = signal_color(sig)
        if val == 0:
            ax.axhline(i, color=color, linewidth=2.2, alpha=0.55, xmin=0.42, xmax=0.58)
        else:
            ax.barh(i, val, color=color, alpha=0.82, height=0.52, edgecolor=INK_800, linewidth=0.4)
        ax.text(
            0.04 if val >= 0 else -0.04,
            i,
            f"{label.title()} · {sig}",
            color=TEXT,
            fontsize=8.5,
            va="center",
            ha="left" if val >= 0 else "right",
            fontfamily="monospace",
        )
    ax.axvline(0, color=GRID, linewidth=0.65, alpha=0.9)
    ax.set_xticks([-1, 0, 1])
    ax.set_xticklabels(["bearish", "neutral", "bullish"], color=MUTED, fontsize=7.5, fontfamily="monospace")
    ax.set_yticks([])
    style_chart_title(ax, "Fundamental pillars", kicker="SEC DESK")
    return fig


# ---------- Warren Buffett ----------------------------------------------


def _buffett_line_items(ctx: dict[str, Any]) -> list[Any]:
    return list(ctx.get("line_items") or [])


def build_fcf_trend(ctx: dict[str, Any]):
    items = list(reversed(_buffett_line_items(ctx)))
    fcf = [_safe(it, "free_cash_flow") for it in items]
    rev = [_safe(it, "revenue") for it in items]
    x = list(range(len(items)))
    yield_pct: list[float | None] = []
    for f, r in zip(fcf, rev, strict=False):
        if f is not None and r and r > 0:
            yield_pct.append((f / r) * 100)
        else:
            yield_pct.append(None)
    fig, ax = new_figure()
    ax.plot(
        x,
        [f / 1e9 if f is not None else None for f in fcf],
        color=PHOS,
        marker="o",
        markersize=4,
        linewidth=1.3,
        label="FCF ($B)",
    )
    ax.set_ylabel("Free cash flow ($B)")
    ax.set_xlabel("Periods (oldest → newest)")
    ax2 = ax.twinx()
    ax2.plot(x, yield_pct, color=BRASS, marker="s", markersize=3.5, linewidth=1.15, label="FCF / Revenue (%)")
    ax2.set_ylabel("FCF margin (%)", color=BRASS)
    style_twin_axis(ax2, BRASS)
    style_chart_title(ax, "Free cash flow & margin", kicker="OWNER EARNINGS")
    return fig


def build_roe_debt(ctx: dict[str, Any]):
    metrics = list(reversed(ctx.get("metrics") or []))
    if not metrics:
        return _empty_figure("ROE vs debt-to-equity unavailable")
    roe = [(_safe(m, "return_on_equity") or 0) * 100 for m in metrics]
    de = [_safe(m, "debt_to_equity") or 0 for m in metrics]
    x = list(range(len(metrics)))
    fig, ax = new_figure()
    ax.bar(x, roe, color=PHOS, alpha=0.68, edgecolor=PHOS_DIM, linewidth=0.35, label="ROE (%)")
    ax.set_ylabel("ROE (%)")
    ax.set_xlabel("Periods (oldest → newest)")
    ax2 = ax.twinx()
    ax2.plot(x, de, color=SIREN, marker="o", markersize=4, linewidth=1.2, label="Debt / Equity")
    ax2.set_ylabel("Debt / Equity", color=SIREN)
    style_twin_axis(ax2, SIREN)
    style_chart_title(ax, "ROE vs leverage", kicker="OWNER EARNINGS")
    return fig


def build_intrinsic_value_bar(ctx: dict[str, Any]):
    reasoning = ctx.get("reasoning") or {}
    if isinstance(reasoning, str):
        return _empty_figure("Intrinsic value not in payload")
    iv_block = reasoning.get("intrinsic_value_analysis") if isinstance(reasoning, dict) else None
    market_cap = reasoning.get("market_cap") if isinstance(reasoning, dict) else None
    if not isinstance(iv_block, dict):
        return _empty_figure("Intrinsic value not in payload")
    iv = iv_block.get("intrinsic_value")
    if iv is None or market_cap is None:
        return _empty_figure("Intrinsic value or market cap missing")
    iv = float(iv) / 1e9
    mc = float(market_cap) / 1e9
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], DEFAULT_FIG_SIZE[1] * 0.85))
    labels = ["Market cap", "Intrinsic value"]
    values = [mc, iv]
    colors = [WIRE_400, PHOS if iv >= mc else SIREN]
    ax.bar(labels, values, color=colors, alpha=0.82, edgecolor=INK_800, linewidth=0.5, width=0.55)
    for i, v in enumerate(values):
        ax.text(
            i,
            v,
            f"${v:,.1f}B",
            ha="center",
            va="bottom",
            color=TEXT,
            fontsize=8.5,
            fontfamily="monospace",
        )
    style_chart_title(ax, "Margin of safety", kicker="OWNER EARNINGS")
    ax.set_ylabel("$B")
    ax.tick_params(axis="x", labelsize=8, colors=WIRE_300)
    return fig


# ---------- Generic investor charts (every legendary desk) ---------------


def build_cumulative_return(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    if len(closes) < 2:
        return _empty_figure("Not enough price history")
    base = closes[0] or 1.0
    cum = [(c / base - 1) * 100 for c in closes]
    fig, ax = new_figure()
    x = range(len(cum))
    line_color = PHOS if cum[-1] >= 0 else SIREN
    ax.plot(x, cum, color=line_color, linewidth=1.4)
    ax.fill_between(x, cum, color=line_color, alpha=0.12)
    ax.axhline(0, color=WIRE_400, linewidth=0.6, linestyle=(0, (4, 3)), alpha=0.8)
    style_chart_title(ax, f"Cumulative return ({cum[-1]:+.1f}%)", kicker="PRICE TAPE")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Return (%)")
    return fig


def build_drawdown_curve(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    if len(closes) < 2:
        return _empty_figure("Not enough price history")
    peak = closes[0]
    dd: list[float] = []
    for c in closes:
        peak = max(peak, c)
        dd.append((c / peak - 1) * 100 if peak > 0 else 0.0)
    fig, ax = new_figure()
    x = range(len(dd))
    ax.fill_between(x, dd, color=SIREN, alpha=0.18)
    ax.plot(x, dd, color=SIREN, linewidth=1.2)
    ax.axhline(0, color=WIRE_400, linewidth=0.6, alpha=0.8)
    trough = min(dd) if dd else 0.0
    style_chart_title(ax, f"Drawdown (max {trough:.1f}%)", kicker="RISK TAPE")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Drawdown (%)")
    return fig


def build_price_volume(ctx: dict[str, Any]):
    sorted_prices = sorted(ctx.get("prices") or [], key=lambda p: getattr(p, "time", "") or "")
    closes = [
        float(getattr(p, "close"))
        for p in sorted_prices
        if getattr(p, "close", None) is not None
    ]
    volumes = [
        float(getattr(p, "volume", 0) or 0)
        for p in sorted_prices
        if getattr(p, "close", None) is not None
    ]
    if len(closes) < 2:
        return _empty_figure("Not enough price history")
    x = list(range(len(closes)))
    fig, ax = new_figure()
    ax.plot(x, closes, color=WIRE_300, linewidth=1.25, label="close", zorder=3)
    ax.set_ylabel("Price")
    ax.set_xlabel("Trading days")
    ax2 = ax.twinx()
    ax2.bar(x, volumes, color=BRASS, alpha=0.22, width=1.0, zorder=1)
    ax2.set_ylabel("Volume", color=BRASS)
    style_twin_axis(ax2, BRASS)
    if volumes and max(volumes) > 0:
        ax2.set_ylim(0, max(volumes) * 3.0)
    style_chart_title(ax, "Price & volume", kicker="PRICE TAPE")
    return fig


def build_valuation_multiples(ctx: dict[str, Any]):
    metrics = ctx.get("metrics") or []
    m = metrics[0] if metrics else None
    pairs = [
        ("P/E", _safe(m, "price_to_earnings_ratio")),
        ("P/B", _safe(m, "price_to_book_ratio")),
        ("P/S", _safe(m, "price_to_sales_ratio")),
        ("EV/EBITDA", _safe(m, "enterprise_value_to_ebitda_ratio")),
        ("PEG", _safe(m, "peg_ratio")),
    ]
    pairs = [(k, v) for k, v in pairs if v is not None and v > 0]
    if not pairs:
        return _empty_figure("No valuation multiples")
    labels = [k for k, _ in pairs]
    vals = [v for _, v in pairs]
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], DEFAULT_FIG_SIZE[1] * 0.85))
    x = np.arange(len(labels))
    ax.bar(x, vals, color=BRASS, alpha=0.78, edgecolor=BRASS_DIM, linewidth=0.4, width=0.6)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, color=WIRE_300, fontsize=8, fontfamily="monospace")
    for i, v in enumerate(vals):
        ax.text(i, v, f"{v:.1f}", ha="center", va="bottom", color=TEXT, fontsize=8, fontfamily="monospace")
    style_chart_title(ax, "Valuation multiples", kicker="VALUATION")
    ax.set_ylabel("x")
    return fig


def _as_pct(series: list[float | None]) -> list[float | None]:
    return [(v * 100 if v is not None and abs(v) <= 2 else v) for v in series]


def build_margin_trend(ctx: dict[str, Any]):
    metrics = list(reversed(ctx.get("metrics") or []))
    if len(metrics) < 2:
        return _empty_figure("Not enough margin history")
    x = list(range(len(metrics)))
    gross = _as_pct([_safe(m, "gross_margin") for m in metrics])
    operating = _as_pct([_safe(m, "operating_margin") for m in metrics])
    net = _as_pct([_safe(m, "net_margin") for m in metrics])
    fig, ax = new_figure()
    ax.plot(x, gross, color=PHOS, marker="o", markersize=3.5, linewidth=1.2, label="Gross")
    ax.plot(x, operating, color=BRASS, marker="s", markersize=3.5, linewidth=1.2, label="Operating")
    ax.plot(x, net, color=WIRE_300, marker="^", markersize=3.5, linewidth=1.2, label="Net")
    style_chart_title(ax, "Margin trend", kicker="PROFITABILITY")
    ax.set_xlabel("Periods (oldest → newest)")
    ax.set_ylabel("Margin (%)")
    style_legend(ax, loc="best")
    return fig


def build_revenue_growth(ctx: dict[str, Any]):
    items = list(reversed(_buffett_line_items(ctx)))
    rev = [(_safe(it, "revenue") or None) for it in items]
    rev_b = [(r / 1e9 if r is not None else None) for r in rev]
    if len([r for r in rev_b if r is not None]) < 2:
        return _empty_figure("Not enough revenue history")
    x = np.arange(len(rev_b))
    fig, ax = new_figure()
    ax.bar(
        x,
        [r if r is not None else 0 for r in rev_b],
        color=PHOS,
        alpha=0.66,
        edgecolor=PHOS_DIM,
        linewidth=0.35,
        label="Revenue ($B)",
    )
    growth: list[float | None] = [None]
    for i in range(1, len(rev_b)):
        if rev_b[i] is not None and rev_b[i - 1]:
            growth.append((rev_b[i] / rev_b[i - 1] - 1) * 100)
        else:
            growth.append(None)
    ax.set_ylabel("Revenue ($B)")
    ax.set_xlabel("Periods (oldest → newest)")
    ax2 = ax.twinx()
    ax2.plot(x, growth, color=BRASS, marker="o", markersize=3.5, linewidth=1.15, label="YoY %")
    ax2.set_ylabel("Growth (%)", color=BRASS)
    style_twin_axis(ax2, BRASS)
    style_chart_title(ax, "Revenue & growth", kicker="GROWTH")
    return fig


# ---------- Extended technical & quant charts -----------------------------


def build_bollinger_bands(ctx: dict[str, Any]):
    x, closes = _prices_xy(ctx.get("prices") or [])
    window = 20
    if len(closes) < window + 5:
        return _empty_figure("Not enough price history for Bollinger bands")
    upper, lower, mid = [], [], []
    for i in range(len(closes)):
        if i + 1 < window:
            upper.append(None)
            lower.append(None)
            mid.append(None)
        else:
            window_slice = closes[i + 1 - window : i + 1]
            m = statistics.fmean(window_slice)
            std = statistics.pstdev(window_slice) if len(window_slice) > 1 else 0.0
            mid.append(m)
            upper.append(m + 2 * std)
            lower.append(m - 2 * std)
    fig, ax = new_figure()
    upper_plot = _nan_series(upper)
    lower_plot = _nan_series(lower)
    mid_plot = _nan_series(mid)
    ax.fill_between(x, upper_plot, lower_plot, color=BRASS, alpha=0.12, linewidth=0)
    ax.plot(x, closes, color=WIRE_300, linewidth=1.2, label="close", zorder=3)
    ax.plot(x, mid_plot, color=BRASS, linewidth=0.95, linestyle=(0, (4, 3)), label="SMA 20", alpha=0.9)
    ax.plot(x, upper_plot, color=PHOS_DIM, linewidth=0.75, alpha=0.85)
    ax.plot(x, lower_plot, color=SIREN_DIM, linewidth=0.75, alpha=0.85)
    style_chart_title(ax, "Bollinger bands (20, 2σ)", kicker="TECH DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Price")
    style_legend(ax, loc="upper left")
    return fig


def build_macd_panel(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    if len(closes) < 35:
        return _empty_figure("Not enough price history for MACD")
    ema12 = [v for v in _ema(closes, 12) if v is not None]
    ema26 = [v for v in _ema(closes, 26) if v is not None]
    n = min(len(ema12), len(ema26))
    macd_line = [ema12[i] - ema26[i] for i in range(n)]
    signal = [v for v in _ema(macd_line, 9) if v is not None]
    m = min(len(macd_line), len(signal))
    macd_line = macd_line[-m:]
    signal = signal[-m:]
    hist = [macd_line[i] - signal[i] for i in range(m)]
    x = range(m)
    fig, ax = new_figure()
    colors = [PHOS if h >= 0 else SIREN for h in hist]
    ax.bar(x, hist, color=colors, alpha=0.55, width=0.85, edgecolor="none")
    ax.plot(x, macd_line, color=WIRE_300, linewidth=1.15, label="MACD")
    ax.plot(x, signal, color=BRASS, linewidth=1.05, label="signal")
    ax.axhline(0, color=WIRE_400, linewidth=0.55, alpha=0.75)
    style_chart_title(ax, "MACD momentum", kicker="TECH DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("MACD")
    style_legend(ax, loc="upper left")
    return fig


def build_atr_panel(ctx: dict[str, Any]):
    highs, lows, closes = _ohlc(ctx.get("prices") or [])
    period = 14
    if len(closes) < period + 5:
        return _empty_figure("Not enough OHLC history for ATR")
    trs: list[float] = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    atr: list[float | None] = [None] * (period - 1)
    for i in range(period - 1, len(trs)):
        atr.append(statistics.fmean(trs[i + 1 - period : i + 1]))
    fig, ax = new_figure()
    valid = [v for v in atr if v is not None]
    x = range(len(atr))
    atr_plot = _nan_series(atr)
    ax.plot(x, atr_plot, color=AMBER, linewidth=1.25)
    ax.fill_between(x, atr_plot, color=AMBER, alpha=0.14)
    if valid:
        ax.axhline(statistics.fmean(valid[-min(60, len(valid)) :]), color=BRASS, linewidth=0.85, linestyle=(0, (5, 3)), label="recent avg")
    style_chart_title(ax, f"{period}-day average true range", kicker="TECH DESK")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("ATR ($)")
    style_legend(ax, loc="upper left")
    return fig


def build_price_channel(ctx: dict[str, Any]):
    x, closes = _prices_xy(ctx.get("prices") or [])
    window = 20
    if len(closes) < window + 5:
        return _empty_figure("Not enough price history for channel")
    upper, lower = [], []
    for i in range(len(closes)):
        if i + 1 < window:
            upper.append(None)
            lower.append(None)
        else:
            window_slice = closes[i + 1 - window : i + 1]
            upper.append(max(window_slice))
            lower.append(min(window_slice))
    fig, ax = new_figure()
    upper_plot = _nan_series(upper)
    lower_plot = _nan_series(lower)
    ax.fill_between(x, upper_plot, lower_plot, color=PHOS, alpha=0.1, linewidth=0)
    ax.plot(x, closes, color=WIRE_300, linewidth=1.25, label="close", zorder=3)
    ax.plot(x, upper_plot, color=PHOS, linewidth=0.85, alpha=0.8, label=f"{window}d high")
    ax.plot(x, lower_plot, color=SIREN, linewidth=0.85, alpha=0.8, label=f"{window}d low")
    style_chart_title(ax, f"{window}-day price channel", kicker="PRICE TAPE")
    ax.set_xlabel("Trading days")
    ax.set_ylabel("Price")
    style_legend(ax, loc="upper left")
    return fig


def build_weekly_returns_heatmap(ctx: dict[str, Any]):
    closes = _closes(ctx.get("prices") or [])
    if len(closes) < 50:
        return _empty_figure("Not enough price history for return heatmap")
    rets = _returns(closes)
    # Bucket into ~5-day windows (trading weeks).
    weeks: list[float] = []
    chunk = 5
    for i in range(0, len(rets), chunk):
        block = rets[i : i + chunk]
        if block:
            weeks.append((math.prod(1 + r for r in block) - 1) * 100)
    if len(weeks) < 6:
        return _empty_figure("Not enough weekly buckets")
    cols = 8
    rows = int(math.ceil(len(weeks) / cols))
    grid = np.full((rows, cols), np.nan)
    for i, val in enumerate(weeks):
        grid[i // cols, i % cols] = val
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], max(3.8, rows * 0.55 + 2.0)))
    apply_floor_style(fig, ax)
    im = ax.imshow(grid, aspect="auto", cmap="RdYlGn", vmin=-8, vmax=8, interpolation="nearest")
    ax.set_title("")
    style_chart_title(ax, "Weekly return heatmap", kicker="QUANT DESK")
    ax.set_xlabel("Week column")
    ax.set_ylabel("Row")
    cbar = fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    cbar.ax.tick_params(colors=WIRE_400, labelsize=7)
    cbar.set_label("Return (%)", color=WIRE_400, fontsize=8)
    return fig


def build_qq_plot(ctx: dict[str, Any]):
    from scipy import stats

    closes = _closes(ctx.get("prices") or [])
    rets = _returns(closes)
    if len(rets) < 30:
        return _empty_figure("Not enough returns for Q-Q plot")
    sorted_rets = sorted(rets)
    n = len(sorted_rets)
    mean_r = statistics.fmean(rets)
    std_r = statistics.pstdev(rets) or 1e-9
    sample = [(r - mean_r) / std_r for r in sorted_rets]
    theoretical = [float(stats.norm.ppf((i - 0.5) / n)) for i in range(1, n + 1)]
    fig, ax = new_figure()
    ax.scatter(theoretical, sample, c=PHOS, s=22, alpha=0.75, edgecolors=INK_800, linewidths=0.35)
    lim = max(abs(min(sample + theoretical)), abs(max(sample + theoretical)), 2.5)
    ax.plot([-lim, lim], [-lim, lim], color=WIRE_400, linewidth=0.75, linestyle=(0, (4, 3)), alpha=0.8)
    style_chart_title(ax, "Return normality (Q-Q)", kicker="QUANT DESK")
    ax.set_xlabel("Theoretical quantiles")
    ax.set_ylabel("Sample quantiles")
    return fig


# ---------- Extended fundamentals & investor charts -----------------------


def build_roe_trend(ctx: dict[str, Any]):
    metrics = list(reversed(ctx.get("metrics") or []))
    roe = [_safe(m, "return_on_equity") for m in metrics]
    roe_pct = [(v * 100 if v is not None and abs(v) <= 2 else v) for v in roe]
    if len([v for v in roe_pct if v is not None]) < 2:
        return _empty_figure("Not enough ROE history")
    x = list(range(len(roe_pct)))
    fig, ax = new_figure()
    ax.plot(x, roe_pct, color=PHOS, marker="o", markersize=4.5, linewidth=1.35)
    ax.fill_between(x, roe_pct, color=PHOS, alpha=0.1)
    style_chart_title(ax, "Return on equity trend", kicker="QUALITY")
    ax.set_xlabel("Periods (oldest → newest)")
    ax.set_ylabel("ROE (%)")
    return fig


def build_growth_metrics_bars(ctx: dict[str, Any]):
    metrics = ctx.get("metrics") or []
    m = metrics[0] if metrics else None
    pairs = [
        ("Revenue", _safe(m, "revenue_growth")),
        ("Earnings", _safe(m, "earnings_growth")),
        ("Book value", _safe(m, "book_value_growth")),
    ]
    scaled: list[tuple[str, float]] = []
    for label, val in pairs:
        if val is None:
            continue
        pct = val * 100 if abs(val) <= 2 else val
        scaled.append((label, pct))
    if not scaled:
        return _empty_figure("No growth metrics available")
    labels = [k for k, _ in scaled]
    vals = [v for _, v in scaled]
    colors = [PHOS if v >= 0 else SIREN for v in vals]
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], DEFAULT_FIG_SIZE[1] * 0.85))
    x = np.arange(len(labels))
    ax.bar(x, vals, color=colors, alpha=0.78, edgecolor=INK_800, linewidth=0.4, width=0.55)
    ax.axhline(0, color=WIRE_400, linewidth=0.6, alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, color=WIRE_300, fontsize=8.5, fontfamily="monospace")
    for i, v in enumerate(vals):
        ax.text(i, v, f"{v:+.1f}%", ha="center", va="bottom" if v >= 0 else "top", color=TEXT, fontsize=8.5, fontfamily="monospace")
    style_chart_title(ax, "Growth rates", kicker="GROWTH")
    ax.set_ylabel("YoY (%)")
    return fig


def build_net_income_trend(ctx: dict[str, Any]):
    items = list(reversed(_buffett_line_items(ctx)))
    ni = [(_safe(it, "net_income") or 0) / 1e9 for it in items]
    if len([v for v in ni if v]) < 2:
        return _empty_figure("Not enough net income history")
    x = np.arange(len(ni))
    colors = [PHOS if v >= 0 else SIREN for v in ni]
    fig, ax = new_figure()
    ax.bar(x, ni, color=colors, alpha=0.72, edgecolor=INK_800, linewidth=0.35, width=0.65)
    ax.axhline(0, color=WIRE_400, linewidth=0.6, alpha=0.8)
    style_chart_title(ax, "Net income by period", kicker="EARNINGS")
    ax.set_xlabel("Periods (oldest → newest)")
    ax.set_ylabel("Net income ($B)")
    return fig


def build_sec_net_income(ctx: dict[str, Any]):
    hist = list(reversed(_quarterly_history(ctx)))
    if len(hist) < 2:
        return _empty_figure("No quarterly net income in SEC data")
    labels = [h.get("fiscal_period") or h.get("period_end") or "" for h in hist]
    ni = [float(h.get("net_income") or 0) / 1e9 for h in hist]
    x = np.arange(len(labels))
    colors = [PHOS if v >= 0 else SIREN for v in ni]
    fig, ax = new_figure()
    ax.bar(x, ni, color=colors, alpha=0.72, edgecolor=INK_800, linewidth=0.35, width=0.65)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=28, ha="right", color=MUTED, fontsize=7.5, fontfamily="monospace")
    style_chart_title(ax, "Quarterly net income (SEC)", kicker="SEC DESK")
    ax.set_ylabel("Net income ($B)")
    return fig


def build_debt_trend(ctx: dict[str, Any]):
    metrics = list(reversed(ctx.get("metrics") or []))
    de = [_safe(m, "debt_to_equity") for m in metrics]
    cr = [_safe(m, "current_ratio") for m in metrics]
    if len([v for v in de if v is not None]) < 2:
        return _empty_figure("Not enough leverage history")
    x = list(range(len(metrics)))
    fig, ax = new_figure()
    ax.plot(x, de, color=SIREN, marker="o", markersize=4, linewidth=1.25, label="Debt / Equity")
    ax.set_ylabel("Debt / Equity", color=SIREN)
    ax.tick_params(axis="y", labelcolor=SIREN)
    if any(v is not None for v in cr):
        ax2 = ax.twinx()
        ax2.plot(x, cr, color=BRASS, marker="s", markersize=3.5, linewidth=1.1, label="Current ratio")
        ax2.set_ylabel("Current ratio", color=BRASS)
        style_twin_axis(ax2, BRASS)
    style_chart_title(ax, "Leverage & liquidity", kicker="BALANCE SHEET")
    ax.set_xlabel("Periods (oldest → newest)")
    return fig


def build_yield_spread(ctx: dict[str, Any]):
    metrics = ctx.get("metrics") or []
    m = metrics[0] if metrics else None
    fcf_y = _safe(m, "free_cash_flow_yield")
    pe = _safe(m, "price_to_earnings_ratio")
    earn_y = (1 / pe * 100) if pe and pe > 0 else None
    pairs = [("FCF yield", fcf_y * 100 if fcf_y and abs(fcf_y) <= 1 else fcf_y), ("Earnings yield", earn_y)]
    pairs = [(k, v) for k, v in pairs if v is not None and v > 0]
    if not pairs:
        return _empty_figure("No yield metrics available")
    labels = [k for k, _ in pairs]
    vals = [v for _, v in pairs]
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], DEFAULT_FIG_SIZE[1] * 0.85))
    x = np.arange(len(labels))
    ax.bar(x, vals, color=[PHOS, BRASS][: len(vals)], alpha=0.78, edgecolor=INK_800, linewidth=0.4, width=0.5)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, color=WIRE_300, fontsize=8.5, fontfamily="monospace")
    for i, v in enumerate(vals):
        ax.text(i, v, f"{v:.1f}%", ha="center", va="bottom", color=TEXT, fontsize=8.5, fontfamily="monospace")
    style_chart_title(ax, "Owner yield comparison", kicker="YIELD")
    ax.set_ylabel("Yield (%)")
    return fig


def _empty_figure(message: str):
    fig, ax = new_figure(figsize=(DEFAULT_FIG_SIZE[0], DEFAULT_FIG_SIZE[1] * 0.65))
    style_chart_title(ax, "No data", kicker="DESK ARTIFACT")
    ax.text(
        0.5,
        0.45,
        message,
        color=MUTED,
        fontsize=9,
        ha="center",
        va="center",
        transform=ax.transAxes,
        fontfamily="monospace",
    )
    ax.set_xticks([])
    ax.set_yticks([])
    return fig
