"""Finnhub (free tier: https://finnhub.io/)."""

from __future__ import annotations

import logging
from datetime import datetime

from src.data.models import CompanyNews, FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://finnhub.io/api/v1"


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not api_key:
        return []
    start_ts = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp())
    end_ts = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp())
    url = f"{BASE}/stock/candle?symbol={ticker}&resolution=D&from={start_ts}&to={end_ts}&token={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        data = resp.json()
        if data.get("s") != "ok":
            return []
        out: list[Price] = []
        for i, ts in enumerate(data.get("t", [])):
            out.append(
                Price(
                    open=float(data["o"][i]),
                    close=float(data["c"][i]),
                    high=float(data["h"][i]),
                    low=float(data["l"][i]),
                    volume=int(data["v"][i]),
                    time=datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"),
                )
            )
        return out
    except Exception as exc:
        logger.debug("Finnhub prices failed for %s: %s", ticker, exc)
        return []


def fetch_company_news(ticker: str, start_date: str, end_date: str, limit: int, api_key: str | None) -> list[CompanyNews]:
    if not api_key:
        return []
    url = f"{BASE}/company-news?symbol={ticker}&from={start_date}&to={end_date}&token={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        return [
            CompanyNews(
                ticker=ticker,
                title=row.get("headline", ""),
                source=row.get("source", "Finnhub"),
                date=datetime.utcfromtimestamp(row.get("datetime", 0)).strftime("%Y-%m-%d"),
                url=row.get("url", ""),
            )
            for row in resp.json()[:limit]
            if row.get("headline")
        ]
    except Exception as exc:
        logger.debug("Finnhub news failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    if not api_key:
        return None
    url = f"{BASE}/stock/metric?symbol={ticker}&metric=all&token={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return None
    try:
        metric = resp.json().get("metric", {})
        return metric.get("marketCapitalization")
    except Exception:
        return None


def fetch_financial_metrics(ticker: str, end_date: str, period: str, limit: int, api_key: str | None) -> list[FinancialMetrics]:
    if not api_key:
        return []
    url = f"{BASE}/stock/metric?symbol={ticker}&metric=all&token={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        m = resp.json().get("metric", {})
        if not m:
            return []
        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=end_date,
                period=period,
                currency="USD",
                market_cap=m.get("marketCapitalization"),
                price_to_earnings_ratio=m.get("peBasicExclExtraTTM"),
                price_to_book_ratio=m.get("pbQuarterly"),
                price_to_sales_ratio=m.get("psTTM"),
                return_on_equity=m.get("roeTTM"),
                return_on_assets=m.get("roaTTM"),
                current_ratio=m.get("currentRatioQuarterly"),
                debt_to_equity=m.get("totalDebt/totalEquityQuarterly"),
                revenue_growth=m.get("revenueGrowthQuarterlyYoy"),
                earnings_per_share=m.get("epsBasicExclExtraItemsTTM"),
            )
        ]
    except Exception as exc:
        logger.debug("Finnhub metrics failed for %s: %s", ticker, exc)
        return []
