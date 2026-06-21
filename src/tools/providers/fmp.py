"""Financial Modeling Prep (free tier: https://site.financialmodelingprep.com/)."""

from __future__ import annotations

import logging

from src.data.models import CompanyNews, FinancialMetrics, InsiderTrade, LineItem, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://financialmodelingprep.com/api/v3"


def _key(api_key: str | None) -> str | None:
    return api_key


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not api_key:
        return []
    url = f"{BASE}/historical-price-full/{ticker}?from={start_date}&to={end_date}&apikey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        rows = resp.json().get("historical", [])
        out: list[Price] = []
        for row in reversed(rows):
            out.append(
                Price(
                    open=float(row["open"]),
                    close=float(row["close"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    volume=int(row.get("volume", 0)),
                    time=row["date"],
                )
            )
        return out
    except Exception as exc:
        logger.debug("FMP prices failed for %s: %s", ticker, exc)
        return []


def fetch_financial_metrics(ticker: str, end_date: str, period: str, limit: int, api_key: str | None) -> list[FinancialMetrics]:
    if not api_key:
        return []
    endpoint = "key-metrics-ttm" if period == "ttm" else "key-metrics"
    url = f"{BASE}/{endpoint}/{ticker}?limit={limit}&apikey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        rows = resp.json() if isinstance(resp.json(), list) else [resp.json()]
        out: list[FinancialMetrics] = []
        for row in rows[:limit]:
            out.append(
                FinancialMetrics(
                    ticker=ticker,
                    report_period=row.get("date", end_date),
                    period=period,
                    currency="USD",
                    market_cap=row.get("marketCap"),
                    enterprise_value=row.get("enterpriseValue"),
                    price_to_earnings_ratio=row.get("peRatio"),
                    price_to_book_ratio=row.get("pbRatio"),
                    price_to_sales_ratio=row.get("priceToSalesRatio"),
                    enterprise_value_to_ebitda_ratio=row.get("enterpriseValueOverEBITDA"),
                    free_cash_flow_yield=row.get("freeCashFlowYield"),
                    return_on_equity=row.get("roe"),
                    return_on_assets=row.get("returnOnAssets"),
                    current_ratio=row.get("currentRatio"),
                    debt_to_equity=row.get("debtToEquity"),
                    earnings_per_share=row.get("netIncomePerShare"),
                    book_value_per_share=row.get("bookValuePerShare"),
                )
            )
        return out
    except Exception as exc:
        logger.debug("FMP metrics failed for %s: %s", ticker, exc)
        return []


def fetch_line_items(ticker: str, line_items: list[str], end_date: str, period: str, limit: int, api_key: str | None) -> list[LineItem]:
    if not api_key:
        return []
    fmp_map = {
        "revenue": ("income-statement", "revenue"),
        "net_income": ("income-statement", "netIncome"),
        "operating_income": ("income-statement", "operatingIncome"),
        "earnings_per_share": ("income-statement", "eps"),
        "ebitda": ("income-statement", "ebitda"),
        "gross_profit": ("income-statement", "grossProfit"),
        "interest_expense": ("income-statement", "interestExpense"),
        "total_debt": ("balance-sheet-statement", "totalDebt"),
        "shareholders_equity": ("balance-sheet-statement", "totalStockholdersEquity"),
        "total_assets": ("balance-sheet-statement", "totalAssets"),
        "current_assets": ("balance-sheet-statement", "totalCurrentAssets"),
        "current_liabilities": ("balance-sheet-statement", "totalCurrentLiabilities"),
        "cash_and_equivalents": ("balance-sheet-statement", "cashAndCashEquivalents"),
        "free_cash_flow": ("cash-flow-statement", "freeCashFlow"),
        "operating_cash_flow": ("cash-flow-statement", "operatingCashFlow"),
    }
    needed = {name: fmp_map[name] for name in line_items if name in fmp_map}
    if not needed:
        return []

    by_date: dict[str, dict] = {}
    for name, (stmt, field) in needed.items():
        url = f"{BASE}/{stmt}/{ticker}?limit={limit}&apikey={api_key}"
        resp = make_api_request(url)
        if resp.status_code != 200:
            continue
        try:
            for row in resp.json()[:limit]:
                day = row.get("date", end_date)
                bucket = by_date.setdefault(day, {})
                if row.get(field) is not None:
                    bucket[name] = row[field]
                bucket["_currency"] = row.get("reportedCurrency", "USD")
        except Exception as exc:
            logger.debug("FMP line items %s/%s failed for %s: %s", stmt, field, ticker, exc)

    out: list[LineItem] = []
    for day in sorted(by_date.keys(), reverse=True)[:limit]:
        payload = by_date[day]
        currency = payload.pop("_currency", "USD")
        if not payload:
            continue
        out.append(
            LineItem(
                ticker=ticker,
                report_period=day,
                period=period,
                currency=currency,
                **payload,
            )
        )
    return out


def fetch_company_news(ticker: str, limit: int, api_key: str | None) -> list[CompanyNews]:
    if not api_key:
        return []
    url = f"{BASE}/stock_news?tickers={ticker}&limit={limit}&apikey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        return [
            CompanyNews(
                ticker=ticker,
                title=row.get("title", ""),
                source=row.get("site", "FMP"),
                date=(row.get("publishedDate") or "")[:10],
                url=row.get("url", ""),
            )
            for row in resp.json()[:limit]
            if row.get("title")
        ]
    except Exception as exc:
        logger.debug("FMP news failed for %s: %s", ticker, exc)
        return []


def fetch_insider_trades(ticker: str, limit: int, api_key: str | None) -> list[InsiderTrade]:
    if not api_key:
        return []
    url = f"{BASE}/insider-trading?symbol={ticker}&limit={limit}&apikey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        out: list[InsiderTrade] = []
        for row in resp.json()[:limit]:
            shares = row.get("securitiesTransacted") or row.get("securitiesOwned") or 0
            out.append(
                InsiderTrade(
                    ticker=ticker,
                    name=row.get("reportingName"),
                    title=row.get("typeOfOwner"),
                    transaction_date=(row.get("transactionDate") or "")[:10],
                    transaction_shares=float(shares) if row.get("acquistionOrDisposition") == "A" else -float(shares),
                    transaction_price_per_share=row.get("price"),
                    filing_date=(row.get("filingDate") or row.get("transactionDate") or "")[:10],
                )
            )
        return out
    except Exception as exc:
        logger.debug("FMP insider failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    if not api_key:
        return None
    url = f"{BASE}/profile/{ticker}?apikey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
        row = data[0] if isinstance(data, list) and data else data
        return row.get("mktCap") or row.get("marketCap")
    except Exception:
        return None
