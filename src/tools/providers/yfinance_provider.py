"""Yahoo Finance via yfinance (no API key)."""

from __future__ import annotations

import logging
from datetime import datetime

from src.data.models import CompanyNews, FinancialMetrics, LineItem, Price

logger = logging.getLogger(__name__)


def fetch_prices(ticker: str, start_date: str, end_date: str) -> list[Price]:
    try:
        import yfinance as yf
    except ImportError:
        logger.debug("yfinance not installed")
        return []

    try:
        hist = yf.Ticker(ticker).history(start=start_date, end=end_date, auto_adjust=False)
        if hist is None or hist.empty:
            return []

        out: list[Price] = []
        for idx, row in hist.iterrows():
            ts = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
            day = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(idx)[:10]
            out.append(
                Price(
                    open=float(row["Open"]),
                    close=float(row["Close"]),
                    high=float(row["High"]),
                    low=float(row["Low"]),
                    volume=int(row.get("Volume", 0) or 0),
                    time=day,
                )
            )
        return out
    except Exception as exc:
        logger.debug("yfinance prices failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str) -> float | None:
    try:
        import yfinance as yf
    except ImportError:
        return None
    try:
        info = yf.Ticker(ticker).info or {}
        cap = info.get("marketCap") or info.get("enterpriseValue")
        return float(cap) if cap else None
    except Exception:
        return None


def fetch_financial_metrics(ticker: str, end_date: str, period: str, limit: int) -> list[FinancialMetrics]:
    try:
        import yfinance as yf
    except ImportError:
        return []
    try:
        import time

        t = yf.Ticker(ticker)
        info: dict = {}
        for attempt in range(3):
            info = t.info or {}
            if len(info) >= 5:
                break
            time.sleep(0.8 * (attempt + 1))
        if len(info) < 5:
            fast = getattr(t, "fast_info", None)
            if fast is not None:
                info = {
                    "currency": getattr(fast, "currency", None) or "USD",
                    "marketCap": getattr(fast, "market_cap", None),
                    "trailingPE": getattr(fast, "trailing_pe", None),
                    "priceToBook": getattr(fast, "price_to_book", None),
                }
        if not info:
            return []

        def pct(v):
            if v is None:
                return None
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        metric = FinancialMetrics(
            ticker=ticker,
            report_period=end_date,
            period=period,
            currency=str(info.get("currency", "USD")),
            market_cap=pct(info.get("marketCap")),
            enterprise_value=pct(info.get("enterpriseValue")),
            price_to_earnings_ratio=pct(info.get("trailingPE") or info.get("forwardPE")),
            price_to_book_ratio=pct(info.get("priceToBook")),
            price_to_sales_ratio=pct(info.get("priceToSalesTrailing12Months")),
            free_cash_flow_yield=(
                pct(info.get("freeCashflow")) / pct(info.get("marketCap"))
                if info.get("freeCashflow") and info.get("marketCap")
                else None
            ),
            gross_margin=pct(info.get("grossMargins")),
            operating_margin=pct(info.get("operatingMargins")),
            net_margin=pct(info.get("profitMargins")),
            return_on_equity=pct(info.get("returnOnEquity")),
            return_on_assets=pct(info.get("returnOnAssets")),
            debt_to_equity=pct(info.get("debtToEquity")),
            current_ratio=pct(info.get("currentRatio")),
            quick_ratio=pct(info.get("quickRatio")),
            revenue_growth=pct(info.get("revenueGrowth")),
            earnings_growth=pct(info.get("earningsGrowth")),
            earnings_per_share=pct(info.get("trailingEps")),
            book_value_per_share=pct(info.get("bookValue")),
            payout_ratio=pct(info.get("payoutRatio")),
        )
        return [metric]
    except Exception as exc:
        logger.debug("yfinance metrics failed for %s: %s", ticker, exc)
        return []


def fetch_line_items(ticker: str, line_items: list[str], end_date: str, period: str, limit: int) -> list[LineItem]:
    try:
        import yfinance as yf
    except ImportError:
        return []
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        mapping = {
            "revenue": info.get("totalRevenue"),
            "net_income": info.get("netIncomeToCommon"),
            "operating_income": info.get("operatingIncome"),
            "free_cash_flow": info.get("freeCashflow"),
            "operating_cash_flow": info.get("operatingCashflow"),
            "total_debt": info.get("totalDebt"),
            "shareholders_equity": info.get("totalStockholderEquity") or info.get("bookValue"),
            "cash_and_equivalents": info.get("totalCash"),
            "ebitda": info.get("ebitda"),
            "gross_profit": info.get("grossProfits"),
            "outstanding_shares": info.get("sharesOutstanding"),
            "earnings_per_share": info.get("trailingEps"),
        }
        payload = {k: mapping[k] for k in line_items if k in mapping and mapping[k] is not None}
        if not payload:
            return []
        item = LineItem(
            ticker=ticker,
            report_period=end_date,
            period=period,
            currency=str(info.get("currency", "USD")),
            **{k: float(v) for k, v in payload.items()},
        )
        return [item]
    except Exception as exc:
        logger.debug("yfinance line items failed for %s: %s", ticker, exc)
        return []


def fetch_company_news(ticker: str, limit: int) -> list[CompanyNews]:
    try:
        import yfinance as yf
    except ImportError:
        return []
    try:
        raw = yf.Ticker(ticker).news or []
        out: list[CompanyNews] = []
        for item in raw[:limit]:
            content = item.get("content") or item
            title = content.get("title") or item.get("title") or ""
            if not title:
                continue
            pub = content.get("pubDate") or content.get("displayTime") or item.get("providerPublishTime")
            if isinstance(pub, (int, float)):
                date = datetime.utcfromtimestamp(pub).strftime("%Y-%m-%d")
            else:
                date = str(pub)[:10] if pub else datetime.utcnow().strftime("%Y-%m-%d")
            out.append(
                CompanyNews(
                    ticker=ticker,
                    title=title,
                    author=content.get("provider", {}).get("displayName") if isinstance(content.get("provider"), dict) else None,
                    source=content.get("provider", {}).get("displayName", "Yahoo") if isinstance(content.get("provider"), dict) else "Yahoo",
                    date=date,
                    url=content.get("canonicalUrl", {}).get("url", "") if isinstance(content.get("canonicalUrl"), dict) else item.get("link", ""),
                )
            )
        return out
    except Exception as exc:
        logger.debug("yfinance news failed for %s: %s", ticker, exc)
        return []
