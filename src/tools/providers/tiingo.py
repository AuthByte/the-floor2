"""Tiingo (https://www.tiingo.com/)."""

from __future__ import annotations

import logging

from src.data.models import FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://api.tiingo.com"


def _headers(api_key: str | None) -> dict:
    return {"Authorization": f"Token {api_key}"} if api_key else {}


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not api_key:
        return []
    url = (
        f"{BASE}/tiingo/daily/{ticker.lower()}/prices"
        f"?startDate={start_date}&endDate={end_date}"
    )
    resp = make_api_request(url, headers=_headers(api_key))
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
        logger.debug("Tiingo prices failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    if not api_key:
        return None
    url = f"{BASE}/tiingo/daily/{ticker.lower()}"
    resp = make_api_request(url, headers=_headers(api_key))
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
        return data.get("marketCap")
    except Exception:
        return None


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    if not api_key:
        return []
    url = f"{BASE}/tiingo/fundamentals/{ticker.lower()}/daily?token={api_key}"
    resp = make_api_request(url, headers=_headers(api_key))
    if resp.status_code != 200:
        return []
    try:
        rows = resp.json()
        if not rows:
            return []
        row = rows[-1] if isinstance(rows, list) else rows
        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=str(row.get("date", end_date))[:10],
                period=period,
                currency="USD",
                market_cap=row.get("marketCap"),
                price_to_earnings_ratio=row.get("peRatio"),
                price_to_book_ratio=row.get("pbRatio"),
                debt_to_equity=row.get("debtToEquity"),
                return_on_equity=row.get("roe"),
            )
        ]
    except Exception as exc:
        logger.debug("Tiingo fundamentals failed for %s: %s", ticker, exc)
        return []
