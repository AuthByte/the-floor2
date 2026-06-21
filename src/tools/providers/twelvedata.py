"""Twelve Data (https://twelvedata.com/)."""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from src.data.models import FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://api.twelvedata.com"


def _query(path: str, params: dict, api_key: str | None):
    if not api_key:
        return None
    q = {**params, "apikey": api_key}
    resp = make_api_request(f"{BASE}/{path}?{urlencode(q)}", timeout=45)
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    if data.get("status") == "error" or data.get("code"):
        logger.debug("Twelve Data error: %s", data.get("message"))
        return None
    return data


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    data = _query(
        "time_series",
        {
            "symbol": ticker,
            "interval": "1day",
            "start_date": start_date,
            "end_date": end_date,
            "outputsize": 5000,
        },
        api_key,
    )
    if not data:
        return []
    try:
        return [
            Price(
                open=float(row["open"]),
                close=float(row["close"]),
                high=float(row["high"]),
                low=float(row["low"]),
                volume=int(float(row.get("volume", 0) or 0)),
                time=str(row["datetime"])[:10],
            )
            for row in data.get("values", [])
        ]
    except Exception as exc:
        logger.debug("Twelve Data prices failed for %s: %s", ticker, exc)
        return []


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    data = _query("statistics", {"symbol": ticker}, api_key)
    if not data:
        return []
    try:
        stats = data.get("statistics", {})
        val = stats.get("valuations_metrics", {})
        fin = stats.get("financials", {})
        def _f(block: dict, key: str) -> float | None:
            v = block.get(key)
            try:
                return float(v) if v not in (None, "", "None") else None
            except (TypeError, ValueError):
                return None

        market_cap = _f(val, "market_capitalization")
        pe = _f(val, "trailing_pe") or _f(val, "forward_pe")
        pb = _f(val, "price_to_book_mrq")
        de = _f(fin, "total_debt_to_equity_mrq")
        roe = _f(fin, "return_on_equity_ttm")
        margin = _f(fin, "operating_margin_ttm")
        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=end_date,
                period=period,
                currency="USD",
                market_cap=market_cap,
                price_to_earnings_ratio=pe,
                price_to_book_ratio=pb,
                debt_to_equity=de,
                return_on_equity=roe,
                operating_margin=margin,
            )
        ]
    except Exception as exc:
        logger.debug("Twelve Data statistics failed for %s: %s", ticker, exc)
        return []
