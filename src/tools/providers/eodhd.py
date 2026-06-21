"""EOD Historical Data (https://eodhistoricaldata.com/)."""

from __future__ import annotations

import logging

from src.data.models import FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://eodhistoricaldata.com/api"


def _symbol(ticker: str) -> str:
    t = ticker.upper()
    return t if "." in t else f"{t}.US"


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not api_key:
        return []
    sym = _symbol(ticker)
    url = f"{BASE}/eod/{sym}?from={start_date}&to={end_date}&fmt=json&api_token={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        return [
            Price(
                open=float(row["open"]),
                close=float(row["close"]),
                high=float(row["high"]),
                low=float(row["low"]),
                volume=int(row.get("volume", 0) or 0),
                time=str(row["date"])[:10],
            )
            for row in resp.json()
        ]
    except Exception as exc:
        logger.debug("EODHD prices failed for %s: %s", ticker, exc)
        return []


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    if not api_key:
        return []
    sym = _symbol(ticker)
    url = f"{BASE}/fundamentals/{sym}?api_token={api_key}"
    resp = make_api_request(url, timeout=45)
    if resp.status_code != 200:
        return []
    try:
        data = resp.json()
        hi = data.get("Highlights", {}) or {}
        val = data.get("Valuation", {}) or {}
        tech = data.get("Technicals", {}) or {}

        def _f(key: str) -> float | None:
            v = hi.get(key) if key in hi else val.get(key) if key in val else tech.get(key)
            try:
                return float(v) if v not in (None, "", "None") else None
            except (TypeError, ValueError):
                return None

        market_cap = _f("MarketCapitalization")
        pe = _f("PERatio")
        pb = _f("PriceBookMRQ")
        de = _f("DebtEquity")
        roe = _f("ReturnOnEquityTTM")
        margin = _f("OperatingMarginTTM")
        ev_ebitda = _f("EnterpriseValueEbitda")
        fcf_yield = None
        if market_cap and _f("FreeCashFlow"):
            fcf_yield = _f("FreeCashFlow") / market_cap

        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=end_date,
                period=period,
                currency=str(data.get("General", {}).get("CurrencyCode", "USD")),
                market_cap=market_cap,
                enterprise_value=_f("EnterpriseValue"),
                price_to_earnings_ratio=pe,
                price_to_book_ratio=pb,
                enterprise_value_to_ebitda_ratio=ev_ebitda,
                free_cash_flow_yield=fcf_yield,
                debt_to_equity=de,
                return_on_equity=roe,
                operating_margin=margin,
                revenue_growth=_f("QuarterlyRevenueGrowthYOY"),
                earnings_growth=_f("QuarterlyEarningsGrowthYOY"),
                earnings_per_share=_f("EarningsShare"),
            )
        ]
    except Exception as exc:
        logger.debug("EODHD fundamentals failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    metrics = fetch_financial_metrics(ticker, "2020-01-01", "ttm", 1, api_key)
    return metrics[0].market_cap if metrics else None
