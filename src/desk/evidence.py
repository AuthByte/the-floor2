"""Evidence ledger: one fetch per ticker, numbered facts, and factor scores.

Facts are the only numbers agents are allowed to cite. Each fact has a stable id
(``F01``…) so LLM theses can reference evidence and the engine can verify the
citations. Factors condense facts into eight scores in ``[-1, +1]`` with a
coverage ratio so thin data never masquerades as conviction.
"""

from __future__ import annotations

import math
import statistics
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from src.tools.providers.keys import keys_from_state

FACTORS = (
    "value",
    "quality",
    "growth",
    "momentum",
    "safety",
    "stability",
    "sentiment",
    "insider",
)

FACTOR_LABELS = {
    "value": "Value",
    "quality": "Quality",
    "growth": "Growth",
    "momentum": "Momentum",
    "safety": "Balance sheet",
    "stability": "Price stability",
    "sentiment": "News tone",
    "insider": "Insider flow",
}

LINE_ITEMS = [
    "revenue",
    "net_income",
    "free_cash_flow",
    "outstanding_shares",
    "shareholders_equity",
    "total_debt",
    "cash_and_equivalents",
]

PRICE_LOOKBACK_DAYS = 400


@dataclass
class Fact:
    id: str
    key: str
    label: str
    value: float
    unit: str  # "pct", "x", "usd", "ratio", "count"
    factor: str | None
    asof: str | None = None

    def display(self) -> str:
        if self.unit == "pct":
            return f"{self.value * 100:.1f}%"
        if self.unit == "x":
            return f"{self.value:.1f}x"
        if self.unit == "usd":
            if abs(self.value) >= 1e9:
                return f"${self.value / 1e9:.1f}B"
            return f"${self.value:,.2f}"
        if self.unit == "count":
            return f"{self.value:.0f}"
        return f"{self.value:.2f}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "key": self.key,
            "label": self.label,
            "value": self.value,
            "display": self.display(),
            "factor": self.factor,
            "asof": self.asof,
        }


@dataclass
class FactorScore:
    name: str
    score: float  # [-1, +1]
    coverage: float  # [0, 1] — share of inputs that were available
    drivers: list[str] = field(default_factory=list)  # fact ids

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "score": round(self.score, 3),
            "coverage": round(self.coverage, 2),
            "drivers": self.drivers,
        }


@dataclass
class EvidenceLedger:
    ticker: str
    end_date: str
    price: float | None
    facts: list[Fact]
    factors: dict[str, FactorScore]
    fair_value: dict[str, float] | None  # {"low", "mid", "high"} per share
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    def fact(self, key: str) -> Fact | None:
        return next((f for f in self.facts if f.key == key), None)

    def value(self, key: str) -> float | None:
        f = self.fact(key)
        return f.value if f else None

    def fact_ids(self) -> set[str]:
        return {f.id for f in self.facts}

    def factor_score(self, name: str) -> float:
        fs = self.factors.get(name)
        return fs.score if fs else 0.0

    def as_table(self) -> str:
        """Compact pipe table the LLM reads; one fact per line."""
        lines = ["id  | fact | value | factor | as of"]
        for f in self.facts:
            lines.append(f"{f.id} | {f.label} | {f.display()} | {f.factor or '-'} | {f.asof or '-'}")
        return "\n".join(lines)

    def factor_table(self) -> str:
        lines = ["factor | score (-1..+1) | coverage | drivers"]
        for name in FACTORS:
            fs = self.factors.get(name)
            if not fs:
                continue
            lines.append(
                f"{FACTOR_LABELS[name]} | {fs.score:+.2f} | {fs.coverage:.0%} | {', '.join(fs.drivers) or '-'}"
            )
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticker": self.ticker,
            "end_date": self.end_date,
            "price": self.price,
            "facts": [f.to_dict() for f in self.facts],
            "factors": {k: v.to_dict() for k, v in self.factors.items()},
            "fair_value": self.fair_value,
        }


# ---------------------------------------------------------------------------
# Run-scoped cache. Analysts run in parallel graph branches; the first one to
# ask for a ticker builds the ledger and the rest wait on the same lock.
# ---------------------------------------------------------------------------

_LEDGERS: dict[tuple[str, str], EvidenceLedger] = {}
_LOCKS: dict[tuple[str, str], threading.Lock] = {}
_GLOBAL_LOCK = threading.Lock()


def reset_evidence() -> None:
    with _GLOBAL_LOCK:
        _LEDGERS.clear()
        _LOCKS.clear()


def get_evidence(state: dict[str, Any], ticker: str) -> EvidenceLedger:
    data = state.get("data") or {}
    end_date = str(data.get("end_date") or "")
    key = (ticker.upper(), end_date)
    with _GLOBAL_LOCK:
        if key in _LEDGERS:
            return _LEDGERS[key]
        lock = _LOCKS.setdefault(key, threading.Lock())
    with lock:
        if key in _LEDGERS:
            return _LEDGERS[key]
        ledger = build_evidence(ticker, end_date, keys_from_state(state), state)
        with _GLOBAL_LOCK:
            _LEDGERS[key] = ledger
        return ledger


def build_evidence(
    ticker: str,
    end_date: str,
    api_keys: Any,
    state: dict[str, Any] | None = None,
) -> EvidenceLedger:
    from src.tools.api import (
        get_company_news,
        get_financial_metrics,
        get_insider_trades,
        get_market_cap,
        get_prices,
        search_line_items,
    )

    price_start = _days_before(end_date, PRICE_LOOKBACK_DAYS)
    prices = _safe(lambda: get_prices(ticker, price_start, end_date, api_key=api_keys), [])
    metrics = _safe(lambda: get_financial_metrics(ticker, end_date, period="ttm", limit=8, api_key=api_keys), [])
    line_items = _safe(
        lambda: search_line_items(ticker, LINE_ITEMS, end_date, period="ttm", limit=8, api_key=api_keys), []
    )
    market_cap = _safe(lambda: get_market_cap(ticker, end_date, api_key=api_keys), None)
    news = _safe(lambda: get_company_news(ticker, end_date, limit=50, api_key=api_keys), [])

    insider_trades = None
    if state is not None:
        from src.agents._insider_utils import get_prefetched_insider_trades

        insider_trades = get_prefetched_insider_trades(state, ticker)
    if insider_trades is None:
        insider_trades = _safe(lambda: get_insider_trades(ticker, end_date, limit=100, api_key=api_keys), [])

    return assemble_ledger(
        ticker=ticker,
        end_date=end_date,
        prices=prices,
        metrics=metrics,
        line_items=line_items,
        market_cap=market_cap,
        news=news,
        insider_trades=insider_trades,
    )


def assemble_ledger(
    *,
    ticker: str,
    end_date: str,
    prices: list[Any],
    metrics: list[Any],
    line_items: list[Any],
    market_cap: float | None,
    news: list[Any],
    insider_trades: list[Any],
) -> EvidenceLedger:
    """Pure function: raw API rows in, ledger out. Separated for testing."""
    builder = _LedgerBuilder()
    m0 = metrics[0] if metrics else None
    m_asof = _attr(m0, "report_period")
    li0 = line_items[0] if line_items else None
    li_asof = _attr(li0, "report_period")

    # --- price tape -------------------------------------------------------
    closes, last_time = _closes(prices)
    price = closes[-1] if closes else None
    if price is not None:
        builder.add("price", "Last close", price, "usd", None, last_time)
    builder.add("ret_1m", "Return 1M", _ret(closes, 21), "pct", "momentum", last_time)
    builder.add("ret_3m", "Return 3M", _ret(closes, 63), "pct", "momentum", last_time)
    builder.add("ret_12m", "Return 12M", _ret(closes, 252), "pct", "momentum", last_time)
    builder.add("trend_200d", "Price vs 200D avg", _vs_sma(closes, 200), "pct", "momentum", last_time)
    builder.add("vol_ann", "Volatility (ann., 60D)", _vol(closes, 60), "pct", "stability", last_time)
    builder.add("max_dd", "Max drawdown (window)", _max_drawdown(closes), "pct", "stability", last_time)

    # --- valuation --------------------------------------------------------
    pe = _attr(m0, "price_to_earnings_ratio")
    builder.add("market_cap", "Market cap", market_cap or _attr(m0, "market_cap"), "usd", None, m_asof)
    builder.add("pe", "P/E", _positive(pe), "x", "value", m_asof)
    builder.add("earnings_yield", "Earnings yield", (1 / pe) if pe and pe > 0 else None, "pct", "value", m_asof)
    builder.add("fcf_yield", "FCF yield", _attr(m0, "free_cash_flow_yield"), "pct", "value", m_asof)
    builder.add("pb", "P/B", _positive(_attr(m0, "price_to_book_ratio")), "x", "value", m_asof)
    builder.add("ev_ebitda", "EV/EBITDA", _positive(_attr(m0, "enterprise_value_to_ebitda_ratio")), "x", "value", m_asof)
    builder.add("peg", "PEG", _positive(_attr(m0, "peg_ratio")), "x", "value", m_asof)

    # --- quality ----------------------------------------------------------
    builder.add("roic", "ROIC", _attr(m0, "return_on_invested_capital"), "pct", "quality", m_asof)
    builder.add("roe", "ROE", _attr(m0, "return_on_equity"), "pct", "quality", m_asof)
    builder.add("gross_margin", "Gross margin", _attr(m0, "gross_margin"), "pct", "quality", m_asof)
    builder.add("op_margin", "Operating margin", _attr(m0, "operating_margin"), "pct", "quality", m_asof)
    builder.add("margin_trend", "Op margin change (series)", _series_change(metrics, "operating_margin"), "pct", "quality", m_asof)

    # --- growth -----------------------------------------------------------
    builder.add("rev_growth", "Revenue growth", _attr(m0, "revenue_growth"), "pct", "growth", m_asof)
    builder.add("eps_growth", "EPS growth", _attr(m0, "earnings_per_share_growth"), "pct", "growth", m_asof)
    builder.add("fcf_growth", "FCF growth", _attr(m0, "free_cash_flow_growth"), "pct", "growth", m_asof)

    # --- balance sheet ----------------------------------------------------
    builder.add("debt_equity", "Debt / equity", _attr(m0, "debt_to_equity"), "ratio", "safety", m_asof)
    builder.add("current_ratio", "Current ratio", _attr(m0, "current_ratio"), "ratio", "safety", m_asof)
    builder.add("interest_cover", "Interest coverage", _attr(m0, "interest_coverage"), "x", "safety", m_asof)
    builder.add("dilution", "Share count change (series)", _line_change(line_items, "outstanding_shares"), "pct", "safety", li_asof)
    net_cash = None
    cash, debt = _attr(li0, "cash_and_equivalents"), _attr(li0, "total_debt")
    if cash is not None and debt is not None:
        net_cash = cash - debt
    builder.add("net_cash", "Net cash", net_cash, "usd", None, li_asof)

    # --- tone ---------------------------------------------------------------
    tone = _news_tone(news)
    if tone["total"]:
        builder.add("news_count", "Headlines (recent)", tone["total"], "count", None, end_date)
        builder.add("news_tone", "Net headline tone", tone["net"], "ratio", "sentiment", end_date)
    insider = _insider_flow(insider_trades, end_date)
    if insider["total"]:
        builder.add("insider_trades", "Insider trades (count)", insider["total"], "count", None, end_date)
        builder.add("insider_buy_ratio", "Insider buy ratio", insider["buy_ratio"], "pct", "insider", end_date)

    # --- fair value ---------------------------------------------------------
    fair_value = _fair_value(m0, li0, price)
    if fair_value and price:
        builder.add("fair_value_mid", "Desk fair value (mid)", fair_value["mid"], "usd", "value", m_asof)
        builder.add("fv_upside", "Upside to fair value", fair_value["mid"] / price - 1, "pct", "value", m_asof)

    facts = builder.facts
    factors = score_factors(facts)
    return EvidenceLedger(
        ticker=ticker.upper(),
        end_date=end_date,
        price=price,
        facts=facts,
        factors=factors,
        fair_value=fair_value,
        raw={"prices": prices, "metrics": metrics, "line_items": line_items, "news": news, "insider_trades": insider_trades, "market_cap": market_cap},
    )


# ---------------------------------------------------------------------------
# Factor scoring: piecewise-linear maps from "bad" to "good" thresholds.
# ---------------------------------------------------------------------------

# fact key -> (bad, good). Direction is implied: good may be lower than bad.
SCALES: dict[str, tuple[float, float]] = {
    "earnings_yield": (0.02, 0.08),
    "fcf_yield": (0.01, 0.07),
    "pb": (6.0, 1.2),
    "ev_ebitda": (25.0, 8.0),
    "peg": (3.0, 1.0),
    "fv_upside": (-0.30, 0.30),
    "roic": (0.05, 0.20),
    "roe": (0.05, 0.22),
    "gross_margin": (0.20, 0.60),
    "op_margin": (0.03, 0.25),
    "margin_trend": (-0.05, 0.05),
    "rev_growth": (-0.05, 0.25),
    "eps_growth": (-0.10, 0.25),
    "fcf_growth": (-0.10, 0.25),
    "ret_3m": (-0.10, 0.15),
    "ret_12m": (-0.20, 0.40),
    "trend_200d": (-0.10, 0.10),
    "debt_equity": (2.0, 0.3),
    "current_ratio": (0.8, 2.0),
    "interest_cover": (2.0, 15.0),
    "dilution": (0.05, -0.03),
    "vol_ann": (0.60, 0.18),
    "max_dd": (-0.50, -0.10),
    "news_tone": (-0.40, 0.40),
    "insider_buy_ratio": (0.10, 0.60),
}

def scale(value: float, bad: float, good: float) -> float:
    if bad == good:
        return 0.0
    t = (value - bad) / (good - bad)
    return max(-1.0, min(1.0, 2 * t - 1))


def score_factors(facts: list[Fact]) -> dict[str, FactorScore]:
    by_factor: dict[str, list[tuple[float, str]]] = {f: [] for f in FACTORS}
    expected: dict[str, int] = {f: 0 for f in FACTORS}
    for key, factor in FACT_FACTOR.items():
        if key in SCALES:
            expected[factor] += 1
    for fact in facts:
        if fact.factor and fact.key in SCALES:
            bad, good = SCALES[fact.key]
            by_factor[fact.factor].append((scale(fact.value, bad, good), fact.id))

    out: dict[str, FactorScore] = {}
    for name in FACTORS:
        rows = by_factor[name]
        if not rows:
            out[name] = FactorScore(name=name, score=0.0, coverage=0.0, drivers=[])
            continue
        score = statistics.fmean(r[0] for r in rows)
        # Drivers: the facts pulling hardest in the direction of the score.
        ordered = sorted(rows, key=lambda r: -r[0] if score >= 0 else r[0])
        out[name] = FactorScore(
            name=name,
            score=score,
            coverage=min(1.0, len(rows) / max(1, expected[name])),
            drivers=[r[1] for r in ordered[:3]],
        )
    return out


# Static mapping of fact key -> factor (mirrors the builder calls above).
FACT_FACTOR: dict[str, str] = {
    "ret_1m": "momentum",
    "ret_3m": "momentum",
    "ret_12m": "momentum",
    "trend_200d": "momentum",
    "vol_ann": "stability",
    "max_dd": "stability",
    "pe": "value",
    "earnings_yield": "value",
    "fcf_yield": "value",
    "pb": "value",
    "ev_ebitda": "value",
    "peg": "value",
    "fv_upside": "value",
    "fair_value_mid": "value",
    "roic": "quality",
    "roe": "quality",
    "gross_margin": "quality",
    "op_margin": "quality",
    "margin_trend": "quality",
    "rev_growth": "growth",
    "eps_growth": "growth",
    "fcf_growth": "growth",
    "debt_equity": "safety",
    "current_ratio": "safety",
    "interest_cover": "safety",
    "dilution": "safety",
    "news_tone": "sentiment",
    "insider_buy_ratio": "insider",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _LedgerBuilder:
    def __init__(self) -> None:
        self.facts: list[Fact] = []

    def add(self, key: str, label: str, value: Any, unit: str, factor: str | None, asof: Any) -> None:
        if value is None:
            return
        try:
            v = float(value)
        except (TypeError, ValueError):
            return
        if math.isnan(v) or math.isinf(v):
            return
        fid = f"F{len(self.facts) + 1:02d}"
        self.facts.append(Fact(fid, key, label, v, unit, factor, str(asof)[:10] if asof else None))


def _safe(fn, default):
    try:
        out = fn()
        return out if out is not None else default
    except Exception:
        return default


def _attr(obj: Any, name: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _positive(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def _days_before(end_date: str, days: int) -> str:
    try:
        end = datetime.strptime(end_date[:10], "%Y-%m-%d")
    except ValueError:
        end = datetime.utcnow()
    return (end - timedelta(days=days)).strftime("%Y-%m-%d")


def _closes(prices: list[Any]) -> tuple[list[float], str | None]:
    rows = sorted(prices or [], key=lambda p: str(_attr(p, "time") or ""))
    closes = [float(c) for p in rows if (c := _attr(p, "close")) is not None]
    last_time = str(_attr(rows[-1], "time"))[:10] if rows else None
    return closes, last_time


def _ret(closes: list[float], n: int) -> float | None:
    if len(closes) <= n:
        # Accept a slightly short window (>=80% of requested) rather than nothing.
        if len(closes) < max(2, int(n * 0.8)):
            return None
        base = closes[0]
    else:
        base = closes[-n - 1]
    return closes[-1] / base - 1 if base > 0 else None


def _vs_sma(closes: list[float], n: int) -> float | None:
    if len(closes) < n:
        return None
    sma = statistics.fmean(closes[-n:])
    return closes[-1] / sma - 1 if sma > 0 else None


def _vol(closes: list[float], n: int) -> float | None:
    window = closes[-(n + 1):]
    rets = [window[i] / window[i - 1] - 1 for i in range(1, len(window)) if window[i - 1] > 0]
    if len(rets) < 10:
        return None
    return statistics.pstdev(rets) * math.sqrt(252)


def _max_drawdown(closes: list[float]) -> float | None:
    if len(closes) < 10:
        return None
    peak, worst = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        if peak > 0:
            worst = min(worst, c / peak - 1)
    return worst


def _series_change(rows: list[Any], name: str) -> float | None:
    vals = [v for r in rows if (v := _attr(r, name)) is not None]
    if len(vals) < 2:
        return None
    return float(vals[0]) - float(vals[-1])


def _line_change(rows: list[Any], name: str) -> float | None:
    vals = [v for r in rows if (v := _attr(r, name)) is not None]
    if len(vals) < 2 or not vals[-1]:
        return None
    return float(vals[0]) / float(vals[-1]) - 1


POSITIVE_WORDS = ("beat", "upgrade", "record", "raises", "surge", "approval", "partnership", "buyback", "expands", "growth")
NEGATIVE_WORDS = ("miss", "downgrade", "lawsuit", "probe", "investigation", "recall", "layoff", "warning", "cuts", "fraud", "slump")


def _news_tone(news: list[Any]) -> dict[str, Any]:
    pos = neg = 0
    for item in news or []:
        sentiment = str(_attr(item, "sentiment") or "").lower()
        title = str(_attr(item, "title") or "").lower()
        if sentiment in ("positive", "bullish"):
            pos += 1
        elif sentiment in ("negative", "bearish"):
            neg += 1
        elif any(w in title for w in POSITIVE_WORDS):
            pos += 1
        elif any(w in title for w in NEGATIVE_WORDS):
            neg += 1
    total = len(news or [])
    return {"total": total, "net": (pos - neg) / total if total else 0.0}


def _insider_flow(trades: list[Any], end_date: str) -> dict[str, Any]:
    buys = sells = 0
    for t in trades or []:
        shares = _attr(t, "transaction_shares")
        if shares is None:
            continue
        if float(shares) > 0:
            buys += 1
        elif float(shares) < 0:
            sells += 1
    total = buys + sells
    return {"total": total, "buy_ratio": buys / total if total else 0.5}


DISCOUNT_RATE = 0.09
TERMINAL_GROWTH = 0.025


def _fair_value(m0: Any, li0: Any, price: float | None) -> dict[str, float] | None:
    """Two cheap, transparent anchors: a fading-growth FCF DCF and a growth-adjusted P/E."""
    estimates: list[float] = []
    growth = _attr(m0, "revenue_growth")
    g = max(-0.05, min(0.20, float(growth))) if growth is not None else 0.03

    fcf_ps = _attr(m0, "free_cash_flow_per_share")
    if fcf_ps is None:
        fcf, shares = _attr(li0, "free_cash_flow"), _attr(li0, "outstanding_shares")
        if fcf is not None and shares:
            fcf_ps = float(fcf) / float(shares)
    if fcf_ps and fcf_ps > 0:
        value, cash = 0.0, float(fcf_ps)
        for year in range(1, 6):
            cash *= 1 + g - (g - TERMINAL_GROWTH) * (year - 1) / 5
            value += cash / (1 + DISCOUNT_RATE) ** year
        terminal = cash * (1 + TERMINAL_GROWTH) / (DISCOUNT_RATE - TERMINAL_GROWTH)
        value += terminal / (1 + DISCOUNT_RATE) ** 5
        estimates.append(value)

    eps = _attr(m0, "earnings_per_share")
    if eps and eps > 0:
        fair_pe = 8.5 + 2 * max(0.0, min(15.0, g * 100))
        estimates.append(float(eps) * fair_pe)

    if not estimates:
        return None
    mid = statistics.median(estimates)
    if price and price > 0:
        # Keep anchors inside a sane band around spot; bad inputs shouldn't produce 20x targets.
        mid = max(price * 0.25, min(price * 4.0, mid))
    return {"low": round(mid * 0.8, 2), "mid": round(mid, 2), "high": round(mid * 1.2, 2)}
