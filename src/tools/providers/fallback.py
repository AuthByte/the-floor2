"""Orchestrate market-data providers with ordered fallbacks."""

from __future__ import annotations

import logging

from src.data.models import CompanyNews, FinancialMetrics, InsiderTrade, LineItem, Price
from src.tools.providers import eodhd as eod
from src.tools.providers import financial_datasets as fd
from src.tools.providers import alpha_vantage as av
from src.tools.providers import finnhub as fh
from src.tools.providers import fmp
from src.tools.providers import marketaux as ma
from src.tools.providers import polygon as poly
from src.tools.providers import sec_edgar as sec
from src.tools.providers import simfin as sf
from src.tools.providers import tiingo as tiingo
from src.tools.providers import twelvedata as td
from src.tools.providers import yfinance_provider as yf
from src.tools.providers.keys import resolve_api_keys

logger = logging.getLogger(__name__)


def get_prices(ticker: str, start_date: str, end_date: str, api_key=None) -> tuple[list[Price], str]:
    keys = resolve_api_keys(api_key)
    chain = [
        ("financial_datasets", lambda: fd.fetch_prices(ticker, start_date, end_date, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("polygon", lambda: poly.fetch_prices(ticker, start_date, end_date, keys.get("POLYGON_API_KEY"))),
        ("simfin", lambda: sf.fetch_prices(ticker, start_date, end_date, keys.get("SIMFIN_API_KEY"))),
        ("tiingo", lambda: tiingo.fetch_prices(ticker, start_date, end_date, keys.get("TIINGO_API_KEY"))),
        ("twelvedata", lambda: td.fetch_prices(ticker, start_date, end_date, keys.get("TWELVE_DATA_API_KEY"))),
        ("eodhd", lambda: eod.fetch_prices(ticker, start_date, end_date, keys.get("EODHD_API_KEY"))),
        ("yfinance", lambda: yf.fetch_prices(ticker, start_date, end_date)),
        ("alpha_vantage", lambda: av.fetch_prices(ticker, start_date, end_date, keys.get("ALPHA_VANTAGE_API_KEY"))),
        ("fmp", lambda: fmp.fetch_prices(ticker, start_date, end_date, keys.get("FMP_API_KEY"))),
        ("finnhub", lambda: fh.fetch_prices(ticker, start_date, end_date, keys.get("FINNHUB_API_KEY"))),
    ]
    return _first(chain, ticker, "prices")


def get_financial_metrics(
    ticker: str, end_date: str, period: str = "ttm", limit: int = 10, api_key=None
) -> tuple[list[FinancialMetrics], str]:
    keys = resolve_api_keys(api_key)
    chain = [
        ("financial_datasets", lambda: fd.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("eodhd", lambda: eod.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("EODHD_API_KEY"))),
        ("simfin", lambda: sf.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("SIMFIN_API_KEY"))),
        ("fmp", lambda: fmp.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("FMP_API_KEY"))),
        ("finnhub", lambda: fh.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("FINNHUB_API_KEY"))),
        ("twelvedata", lambda: td.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("TWELVE_DATA_API_KEY"))),
        ("tiingo", lambda: tiingo.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("TIINGO_API_KEY"))),
        ("polygon", lambda: poly.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("POLYGON_API_KEY"))),
        ("alpha_vantage", lambda: av.fetch_financial_metrics(ticker, end_date, period, limit, keys.get("ALPHA_VANTAGE_API_KEY"))),
        ("yfinance", lambda: yf.fetch_financial_metrics(ticker, end_date, period, limit)),
    ]
    return _merge_metrics(chain, ticker, end_date, period, limit)


def search_line_items(
    ticker: str, line_items: list[str], end_date: str, period: str = "ttm", limit: int = 10, api_key=None
) -> tuple[list[LineItem], str]:
    keys = resolve_api_keys(api_key)
    chain = [
        ("financial_datasets", lambda: fd.fetch_line_items(ticker, line_items, end_date, period, limit, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("simfin", lambda: sf.fetch_line_items(ticker, line_items, end_date, period, limit, keys.get("SIMFIN_API_KEY"))),
        ("fmp", lambda: fmp.fetch_line_items(ticker, line_items, end_date, period, limit, keys.get("FMP_API_KEY"))),
        ("sec_edgar", lambda: sec.fetch_line_items(ticker, line_items, end_date, period, limit)),
        ("yfinance", lambda: yf.fetch_line_items(ticker, line_items, end_date, period, limit)),
    ]
    return _merge_line_items(chain, ticker, line_items, end_date, period, limit)


def get_insider_trades(
    ticker: str, end_date: str, start_date: str | None = None, limit: int = 1000, api_key=None
) -> tuple[list[InsiderTrade], str]:
    keys = resolve_api_keys(api_key)
    chain = [
        ("financial_datasets", lambda: fd.fetch_insider_trades(ticker, end_date, start_date, limit, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("fmp", lambda: fmp.fetch_insider_trades(ticker, limit, keys.get("FMP_API_KEY"))),
        ("sec_edgar", lambda: sec.fetch_insider_trades(ticker, limit)),
    ]
    return _first(chain, ticker, "insider_trades")


def get_company_news(
    ticker: str, end_date: str, start_date: str | None = None, limit: int = 1000, api_key=None
) -> tuple[list[CompanyNews], str]:
    keys = resolve_api_keys(api_key)
    start = start_date or end_date
    chain = [
        ("financial_datasets", lambda: fd.fetch_company_news(ticker, end_date, start_date, limit, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("marketaux", lambda: ma.fetch_company_news(ticker, start, end_date, limit, keys.get("MARKETAUX_API_KEY"))),
        ("finnhub", lambda: fh.fetch_company_news(ticker, start, end_date, limit, keys.get("FINNHUB_API_KEY"))),
        ("alpha_vantage", lambda: av.fetch_company_news(ticker, start, end_date, limit, keys.get("ALPHA_VANTAGE_API_KEY"))),
        ("fmp", lambda: fmp.fetch_company_news(ticker, limit, keys.get("FMP_API_KEY"))),
        ("yfinance", lambda: yf.fetch_company_news(ticker, limit)),
    ]
    return _first(chain, ticker, "news")


def get_market_cap(ticker: str, end_date: str, api_key=None) -> tuple[float | None, str]:
    keys = resolve_api_keys(api_key)
    chain = [
        ("financial_datasets_facts", lambda: fd.fetch_market_cap_from_facts(ticker, keys.get("FINANCIAL_DATASETS_API_KEY"))),
        ("polygon", lambda: poly.fetch_market_cap(ticker, keys.get("POLYGON_API_KEY"))),
        ("simfin", lambda: sf.fetch_market_cap(ticker, keys.get("SIMFIN_API_KEY"))),
        ("yfinance", lambda: yf.fetch_market_cap(ticker)),
        ("eodhd", lambda: eod.fetch_market_cap(ticker, keys.get("EODHD_API_KEY"))),
        ("tiingo", lambda: tiingo.fetch_market_cap(ticker, keys.get("TIINGO_API_KEY"))),
        ("alpha_vantage", lambda: av.fetch_market_cap(ticker, keys.get("ALPHA_VANTAGE_API_KEY"))),
        ("fmp", lambda: fmp.fetch_market_cap(ticker, keys.get("FMP_API_KEY"))),
        ("finnhub", lambda: fh.fetch_market_cap(ticker, keys.get("FINNHUB_API_KEY"))),
    ]
    for name, fn in chain:
        try:
            val = fn()
            if val:
                logger.info("market_cap %s via %s", ticker, name)
                return val, name
        except Exception as exc:
            logger.debug("%s market_cap failed: %s", name, exc)

    metrics, src = get_financial_metrics(ticker, end_date, api_key=api_key)
    if metrics and metrics[0].market_cap:
        return metrics[0].market_cap, f"{src}_metrics"
    return None, "none"


def _first(chain, ticker: str, kind: str):
    for name, fn in chain:
        try:
            result = fn()
            if result:
                logger.info("%s %s via %s (%d rows)", kind, ticker, name, len(result))
                return result, name
        except Exception as exc:
            logger.debug("%s %s provider %s failed: %s", kind, ticker, name, exc)
    logger.warning("All providers failed for %s %s", kind, ticker)
    return [], "none"


def _merge_metrics(
    chain,
    ticker: str,
    end_date: str,
    period: str,
    limit: int,
) -> tuple[list[FinancialMetrics], str]:
    """Walk providers and fill missing metric fields from each source."""
    merged_rows: list[dict] = []
    sources: list[str] = []

    for name, fn in chain:
        try:
            rows = fn()
        except Exception as exc:
            logger.debug("financial_metrics %s provider %s failed: %s", ticker, name, exc)
            continue
        if not rows:
            continue
        sources.append(name)
        for i, row in enumerate(rows[:limit]):
            while len(merged_rows) <= i:
                base = {f: None for f in FinancialMetrics.model_fields}
                base.update(
                    {
                        "ticker": ticker,
                        "report_period": end_date,
                        "period": period,
                        "currency": "USD",
                    }
                )
                merged_rows.append(base)
            for field in FinancialMetrics.model_fields:
                val = getattr(row, field, None)
                if val is not None and merged_rows[i].get(field) is None:
                    merged_rows[i][field] = val
            if merged_rows[i].get("report_period") in (None, end_date) and row.report_period:
                merged_rows[i]["report_period"] = row.report_period
            if row.currency:
                merged_rows[i]["currency"] = row.currency

    if not merged_rows or not any(
        any(v is not None for k, v in row.items() if k not in ("ticker", "period", "currency", "report_period"))
        for row in merged_rows
    ):
        logger.warning("All providers failed for financial_metrics %s", ticker)
        return [], "none"

    src = "+".join(sources) if sources else "none"
    out = [FinancialMetrics(**row) for row in merged_rows[:limit]]
    logger.info("financial_metrics %s via %s (%d rows, merged)", ticker, src, len(out))
    return out, src


def _merge_line_items(
    chain,
    ticker: str,
    line_items: list[str],
    end_date: str,
    period: str,
    limit: int,
) -> tuple[list[LineItem], str]:
    """Merge line items across providers so gaps get filled from fallbacks."""
    merged_rows: list[dict] = []
    sources: list[str] = []

    for name, fn in chain:
        try:
            rows = fn()
        except Exception as exc:
            logger.debug("line_items %s provider %s failed: %s", ticker, name, exc)
            continue
        if not rows:
            continue
        sources.append(name)
        for i, row in enumerate(rows[:limit]):
            while len(merged_rows) <= i:
                merged_rows.append(
                    {
                        "ticker": ticker,
                        "report_period": end_date,
                        "period": period,
                        "currency": row.currency or "USD",
                        "fields": {},
                    }
                )
            bucket = merged_rows[i]["fields"]
            for li in line_items:
                if bucket.get(li) is None:
                    val = getattr(row, li, None)
                    if val is not None:
                        bucket[li] = val
            if merged_rows[i]["report_period"] == end_date and row.report_period:
                merged_rows[i]["report_period"] = row.report_period
            if row.currency:
                merged_rows[i]["currency"] = row.currency

    out: list[LineItem] = []
    for row in merged_rows[:limit]:
        fields = row["fields"]
        if not fields:
            continue
        out.append(
            LineItem(
                ticker=ticker,
                report_period=row["report_period"],
                period=period,
                currency=row["currency"],
                **fields,
            )
        )

    if not out:
        logger.warning("All providers failed for line_items %s", ticker)
        return [], "none"

    src = "+".join(sources) if sources else "none"
    logger.info("line_items %s via %s (%d rows, merged)", ticker, src, len(out))
    return out, src
