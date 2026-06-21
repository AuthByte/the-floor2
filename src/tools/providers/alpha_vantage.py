"""Alpha Vantage (free tier: https://www.alphavantage.co/support/#api-key)."""

from __future__ import annotations

import logging
from datetime import datetime

from src.data.models import CompanyNews, FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://www.alphavantage.co/query"


def _query(params: dict, api_key: str | None):
    if not api_key:
        return None
    from urllib.parse import urlencode

    q = {**params, "apikey": api_key}
    url = f"{BASE}?{urlencode(q)}"
    resp = make_api_request(url, timeout=45)
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    if not data or "Error Message" in data or "Note" in data:
        logger.debug("Alpha Vantage: %s", data.get("Error Message") or data.get("Note"))
        return None
    return data


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    data = _query({"function": "TIME_SERIES_DAILY", "symbol": ticker, "outputsize": "full"}, api_key)
    if not data:
        return []
    series = data.get("Time Series (Daily)", {})
    if not series:
        return []
    out: list[Price] = []
    for day, row in series.items():
        if day < start_date or day > end_date:
            continue
        out.append(
            Price(
                open=float(row["1. open"]),
                close=float(row["4. close"]),
                high=float(row["2. high"]),
                low=float(row["3. low"]),
                volume=int(float(row["5. volume"])),
                time=day,
            )
        )
    out.sort(key=lambda p: p.time)
    return out


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    data = _query({"function": "OVERVIEW", "symbol": ticker}, api_key)
    if not data or not data.get("Symbol"):
        return []
    try:
        def _f(key: str):
            val = data.get(key)
            if val in (None, "None", "-", ""):
                return None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=data.get("LatestQuarter") or end_date,
                period=period,
                currency=data.get("Currency") or "USD",
                market_cap=_f("MarketCapitalization"),
                enterprise_value=_f("EnterpriseValue"),
                price_to_earnings_ratio=_f("TrailingPE") or _f("PERatio"),
                price_to_book_ratio=_f("PriceToBookRatio"),
                price_to_sales_ratio=_f("PriceToSalesRatioTTM"),
                peg_ratio=_f("PEGRatio"),
                return_on_equity=_f("ReturnOnEquityTTM"),
                return_on_assets=_f("ReturnOnAssetsTTM"),
                revenue_growth=_f("QuarterlyRevenueGrowthYOY"),
                earnings_growth=_f("QuarterlyEarningsGrowthYOY"),
                earnings_per_share=_f("EPS"),
                book_value_per_share=_f("BookValue"),
            )
        ]
    except Exception as exc:
        logger.debug("Alpha Vantage metrics failed for %s: %s", ticker, exc)
        return []


def _map_sentiment(score: float | None, label: str | None) -> str | None:
    if label:
        low = label.lower()
        if "bullish" in low or "positive" in low:
            return "positive"
        if "bearish" in low or "negative" in low:
            return "negative"
        if "neutral" in low:
            return "neutral"
    if score is None:
        return None
    if score >= 0.15:
        return "positive"
    if score <= -0.15:
        return "negative"
    return "neutral"


def fetch_company_news(
    ticker: str, start_date: str, end_date: str, limit: int, api_key: str | None
) -> list[CompanyNews]:
    data = _query(
        {
            "function": "NEWS_SENTIMENT",
            "tickers": ticker,
            "time_from": start_date.replace("-", "") + "T0000",
            "time_to": end_date.replace("-", "") + "T2359",
            "limit": str(min(limit, 50)),
            "sort": "LATEST",
        },
        api_key,
    )
    if not data:
        return []
    out: list[CompanyNews] = []
    for row in data.get("feed", [])[:limit]:
        title = row.get("title", "")
        if not title:
            continue
        ticker_sent = None
        for ts in row.get("ticker_sentiment", []):
            if ts.get("ticker", "").upper() == ticker.upper():
                ticker_sent = ts
                break
        score = float(ticker_sent["ticker_sentiment_score"]) if ticker_sent else None
        label = ticker_sent.get("ticker_sentiment_label") if ticker_sent else row.get("overall_sentiment_label")
        pub = row.get("time_published", "")
        day = f"{pub[:4]}-{pub[4:6]}-{pub[6:8]}" if len(pub) >= 8 else end_date
        if day < start_date or day > end_date:
            continue
        out.append(
            CompanyNews(
                ticker=ticker,
                title=title,
                author=row.get("authors", [None])[0] if row.get("authors") else None,
                source=row.get("source", "Alpha Vantage"),
                date=day,
                url=row.get("url", ""),
                sentiment=_map_sentiment(score, label),
            )
        )
    return out


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    metrics = fetch_financial_metrics(ticker, datetime.utcnow().strftime("%Y-%m-%d"), "ttm", 1, api_key)
    return metrics[0].market_cap if metrics else None
