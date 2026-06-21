"""Financial Datasets provider (primary when key present)."""

from __future__ import annotations

import logging

from src.data.models import (
    CompanyNews,
    CompanyNewsResponse,
    FinancialMetrics,
    FinancialMetricsResponse,
    InsiderTrade,
    InsiderTradeResponse,
    LineItem,
    LineItemResponse,
    Price,
    PriceResponse,
    CompanyFactsResponse,
)
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)

BASE = "https://api.financialdatasets.ai"
FREE_TICKERS = frozenset({"AAPL", "GOOGL", "MSFT", "NVDA", "TSLA"})


def _headers(api_key: str | None) -> dict:
    return {"X-API-KEY": api_key} if api_key else {}


def _can_use(ticker: str, api_key: str | None) -> bool:
    return bool(api_key) or ticker.upper() in FREE_TICKERS


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not _can_use(ticker, api_key):
        return []
    url = (
        f"{BASE}/prices/?ticker={ticker}&interval=day&interval_multiplier=1"
        f"&start_date={start_date}&end_date={end_date}"
    )
    resp = make_api_request(url, _headers(api_key))
    if resp.status_code != 200:
        return []
    try:
        return PriceResponse(**resp.json()).prices
    except Exception as exc:
        logger.debug("FD prices parse failed for %s: %s", ticker, exc)
        return []


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    if not _can_use(ticker, api_key):
        return []
    url = (
        f"{BASE}/financial-metrics/?ticker={ticker}&report_period_lte={end_date}"
        f"&limit={limit}&period={period}"
    )
    resp = make_api_request(url, _headers(api_key))
    if resp.status_code != 200:
        return []
    try:
        return FinancialMetricsResponse(**resp.json()).financial_metrics
    except Exception as exc:
        logger.debug("FD metrics parse failed for %s: %s", ticker, exc)
        return []


def fetch_line_items(
    ticker: str, line_items: list[str], end_date: str, period: str, limit: int, api_key: str | None
) -> list[LineItem]:
    if not _can_use(ticker, api_key):
        return []
    body = {
        "tickers": [ticker],
        "line_items": line_items,
        "end_date": end_date,
        "period": period,
        "limit": limit,
    }
    resp = make_api_request(f"{BASE}/financials/search/line-items", _headers(api_key), method="POST", json_data=body)
    if resp.status_code != 200:
        return []
    try:
        return LineItemResponse(**resp.json()).search_results[:limit]
    except Exception as exc:
        logger.debug("FD line items parse failed for %s: %s", ticker, exc)
        return []


def fetch_insider_trades(
    ticker: str, end_date: str, start_date: str | None, limit: int, api_key: str | None
) -> list[InsiderTrade]:
    if not _can_use(ticker, api_key):
        return []
    all_trades: list[InsiderTrade] = []
    current_end = end_date
    while True:
        url = f"{BASE}/insider-trades/?ticker={ticker}&filing_date_lte={current_end}&limit={limit}"
        if start_date:
            url += f"&filing_date_gte={start_date}"
        resp = make_api_request(url, _headers(api_key))
        if resp.status_code != 200:
            break
        try:
            batch = InsiderTradeResponse(**resp.json()).insider_trades
        except Exception:
            break
        if not batch:
            break
        all_trades.extend(batch)
        if not start_date or len(batch) < limit:
            break
        current_end = min(t.filing_date for t in batch).split("T")[0]
        if current_end <= (start_date or ""):
            break
    return all_trades


def fetch_company_news(
    ticker: str, end_date: str, start_date: str | None, limit: int, api_key: str | None
) -> list[CompanyNews]:
    if not _can_use(ticker, api_key):
        return []
    all_news: list[CompanyNews] = []
    current_end = end_date
    while True:
        url = f"{BASE}/news/?ticker={ticker}&end_date={current_end}&limit={limit}"
        if start_date:
            url += f"&start_date={start_date}"
        resp = make_api_request(url, _headers(api_key))
        if resp.status_code != 200:
            break
        try:
            batch = CompanyNewsResponse(**resp.json()).news
        except Exception:
            break
        if not batch:
            break
        all_news.extend(batch)
        if not start_date or len(batch) < limit:
            break
        current_end = min(n.date for n in batch).split("T")[0]
        if current_end <= (start_date or ""):
            break
    return all_news


def fetch_market_cap_from_facts(ticker: str, api_key: str | None) -> float | None:
    if not _can_use(ticker, api_key):
        return None
    resp = make_api_request(f"{BASE}/company/facts/?ticker={ticker}", _headers(api_key))
    if resp.status_code != 200:
        return None
    try:
        return CompanyFactsResponse(**resp.json()).company_facts.market_cap
    except Exception:
        return None
