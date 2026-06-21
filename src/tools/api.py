import datetime
import logging
import os
import pandas as pd

from src.data.cache import get_cache
from src.data.models import (
    CompanyNews,
    EarningsDigest,
    FinancialMetrics,
    InsiderTrade,
    LineItem,
    Price,
)
from src.tools.http import make_api_request
from src.tools.providers import fallback
from src.tools.providers.macro import fetch_combined_macro
from src.tools.providers.keys import resolve_api_keys

# Re-export for tests
_make_api_request = make_api_request

logger = logging.getLogger(__name__)
_cache = get_cache()


def get_prices(ticker: str, start_date: str, end_date: str, api_key: str = None) -> list[Price]:
    cache_key = f"{ticker}_{start_date}_{end_date}"
    if cached_data := _cache.get_prices(cache_key):
        return [Price(**price) for price in cached_data]

    prices, _src = fallback.get_prices(ticker, start_date, end_date, api_key)
    if prices:
        _cache.set_prices(cache_key, [p.model_dump() for p in prices])
    return prices


def get_financial_metrics(
    ticker: str,
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[FinancialMetrics]:
    cache_key = f"{ticker}_{period}_{end_date}_{limit}"
    if cached_data := _cache.get_financial_metrics(cache_key):
        return [FinancialMetrics(**metric) for metric in cached_data]

    metrics, _src = fallback.get_financial_metrics(ticker, end_date, period, limit, api_key)
    if not metrics:
        metrics = _synthesize_financial_metrics(ticker, end_date, period, api_key)
        if metrics:
            logger.info("financial_metrics %s via synthesized (%d rows)", ticker, len(metrics))
    if metrics:
        _cache.set_financial_metrics(cache_key, [m.model_dump() for m in metrics])
    return metrics


def _synthesize_financial_metrics(
    ticker: str,
    end_date: str,
    period: str,
    api_key: str | None,
) -> list[FinancialMetrics]:
    """Build metrics from yfinance + SEC line items when all API providers fail."""
    from src.tools.providers import yfinance_provider as yf

    metrics = yf.fetch_financial_metrics(ticker, end_date, period, 1)
    if metrics:
        return metrics

    line_names = [
        "revenue",
        "net_income",
        "operating_income",
        "earnings_per_share",
        "free_cash_flow",
        "total_debt",
        "shareholders_equity",
        "cash_and_equivalents",
        "ebitda",
    ]
    items, _ = fallback.search_line_items(ticker, line_names, end_date, period, 4, api_key)
    if not items:
        return []

    latest = items[0]
    cap, _ = fallback.get_market_cap(ticker, end_date, api_key)
    revenue = latest.revenue
    net_income = latest.net_income
    op_income = latest.operating_income
    eps = latest.earnings_per_share
    fcf = latest.free_cash_flow
    equity = latest.shareholders_equity

    net_margin = (net_income / revenue) if revenue and net_income is not None else None
    operating_margin = (op_income / revenue) if revenue and op_income is not None else None
    roe = (net_income / equity) if equity and net_income is not None else None
    pe = (cap / net_income) if cap and net_income and net_income > 0 else None

    row: dict = {name: None for name in FinancialMetrics.model_fields}
    row.update(
        {
            "ticker": ticker,
            "report_period": latest.report_period or end_date,
            "period": period,
            "currency": "USD",
            "market_cap": cap,
            "enterprise_value": (
                cap + (latest.total_debt or 0) - (getattr(latest, "cash_and_equivalents", None) or 0)
                if cap and latest.total_debt is not None
                else None
            ),
            "price_to_earnings_ratio": pe,
            "net_margin": net_margin,
            "operating_margin": operating_margin,
            "return_on_equity": roe,
            "earnings_per_share": eps,
            "free_cash_flow_per_share": (fcf / cap) if fcf and cap else None,
            "free_cash_flow_yield": (fcf / cap) if fcf and cap else None,
            "debt_to_equity": (
                latest.total_debt / equity
                if latest.total_debt is not None and equity and equity > 0
                else None
            ),
        }
    )
    return [FinancialMetrics(**row)]


def search_line_items(
    ticker: str,
    line_items: list[str],
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[LineItem]:
    items, _src = fallback.search_line_items(ticker, line_items, end_date, period, limit, api_key)
    return items


def get_insider_trades(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[InsiderTrade]:
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"
    if cached_data := _cache.get_insider_trades(cache_key):
        return [InsiderTrade(**trade) for trade in cached_data]

    trades, _src = fallback.get_insider_trades(ticker, end_date, start_date, limit, api_key)
    if trades:
        _cache.set_insider_trades(cache_key, [t.model_dump() for t in trades])
    return trades


def get_company_news(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[CompanyNews]:
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"
    if cached_data := _cache.get_company_news(cache_key):
        return [CompanyNews(**news) for news in cached_data]

    news, _src = fallback.get_company_news(ticker, end_date, start_date, limit, api_key)
    if news:
        _cache.set_company_news(cache_key, [n.model_dump() for n in news])
    return news


def get_market_cap(ticker: str, end_date: str, api_key: str = None) -> float | None:
    if end_date == datetime.datetime.now().strftime("%Y-%m-%d"):
        cap, _src = fallback.get_market_cap(ticker, end_date, api_key)
        return cap

    financial_metrics = get_financial_metrics(ticker, end_date, api_key=api_key)
    if financial_metrics and financial_metrics[0].market_cap:
        return financial_metrics[0].market_cap

    cap, _src = fallback.get_market_cap(ticker, end_date, api_key)
    return cap


def get_earnings_digest(
    ticker: str,
    end_date: str,
    *,
    state: dict | None = None,
    agent_id: str | None = None,
    use_llm: bool = True,
) -> EarningsDigest:
    """SEC EDGAR quarterly XBRL + latest earnings filing digest (optional LLM)."""
    from src.tools.providers.sec_edgar_earnings import fetch_earnings_digest

    return fetch_earnings_digest(
        ticker,
        end_date,
        state=state,
        agent_id=agent_id,
        use_llm=use_llm,
    )


def get_macro_context(end_date: str | None = None, api_key: str | dict | None = None) -> dict:
    """Latest FRED + BLS macro snapshot for agent prompts (cached)."""
    keys = resolve_api_keys(api_key)
    fred_key = keys.get("FRED_API_KEY")
    as_of = end_date or datetime.datetime.now().strftime("%Y-%m-%d")
    return fetch_combined_macro(as_of, fred_key)


def prices_to_df(prices: list[Price]) -> pd.DataFrame:
    df = pd.DataFrame([p.model_dump() for p in prices])
    df["Date"] = pd.to_datetime(df["time"])
    df.set_index("Date", inplace=True)
    numeric_cols = ["open", "close", "high", "low", "volume"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df.sort_index(inplace=True)
    return df


def get_price_data(ticker: str, start_date: str, end_date: str, api_key: str = None) -> pd.DataFrame:
    prices = get_prices(ticker, start_date, end_date, api_key=api_key)
    return prices_to_df(prices)
