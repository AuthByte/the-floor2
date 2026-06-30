"""Quant data client — Financial Datasets first, then project-wide provider fallbacks."""

from __future__ import annotations

import logging
from typing import Any

from src.tools.providers import fallback
from src.tools.providers.keys import resolve_api_keys
from src.tools.providers.sec_edgar import get_cik
from src.tools.providers.sec_edgar_earnings import (
    _fetch_quarterly_earnings,
    _pick_earnings_filings,
    _yoy_pct,
)
from v2.data.client import FDClient
from v2.data.models import EarningsData, EarningsRecord, Price

logger = logging.getLogger(__name__)


def _form_to_source_type(form: str | None) -> str:
    if not form:
        return "10-Q"
    base = form.split("/")[0].upper()
    if base.startswith("8-K"):
        return "8-K"
    if base.startswith("10-K"):
        return "10-K"
    if base.startswith("10-Q"):
        return "10-Q"
    if base.startswith("20-F"):
        return "20-F"
    return base


def _surprise_from_yoy(yoy: float | None) -> str | None:
    if yoy is None:
        return None
    if yoy > 0.01:
        return "BEAT"
    if yoy < -0.01:
        return "MISS"
    return "MEET"


def _nearest_filing_after(filings: list[dict], period_end: str) -> dict | None:
    best: dict | None = None
    best_delta: int | None = None
    for f in filings:
        fdate = f.get("filing_date")
        if not fdate or fdate < period_end:
            continue
        delta = _days_between(period_end, fdate)
        if best is None or (best_delta is not None and delta < best_delta):
            best = f
            best_delta = delta
    return best


def _days_between(start: str, end: str) -> int:
    from datetime import datetime

    a = datetime.strptime(start[:10], "%Y-%m-%d").date()
    b = datetime.strptime(end[:10], "%Y-%m-%d").date()
    return (b - a).days


def _earnings_history_from_sec(
    ticker: str,
    *,
    limit: int = 12,
    end_date: str = "",
) -> list[EarningsRecord]:
    """Build PEAD-compatible earnings records from SEC EDGAR (no FD key required)."""
    cik = get_cik(ticker)
    if not cik:
        return []

    quarters = _fetch_quarterly_earnings(ticker, limit=max(limit + 4, 10))
    if not quarters:
        return []

    as_of = end_date[:10] if end_date else quarters[0].period_end
    filings = _pick_earnings_filings(cik, as_of, limit=max(limit * 2, 8))

    records: list[EarningsRecord] = []
    seen: set[str] = set()

    for i, quarter in enumerate(quarters):
        if len(records) >= limit:
            break
        prior = quarters[i + 1] if i + 1 < len(quarters) else None
        eps_yoy = _yoy_pct(quarter.eps, prior.eps if prior else None)
        rev_yoy = _yoy_pct(quarter.revenue, prior.revenue if prior else None)
        surprise = _surprise_from_yoy(eps_yoy if eps_yoy is not None else rev_yoy)
        if surprise not in ("BEAT", "MISS"):
            continue

        period = quarter.period_end[:10]
        if period in seen:
            continue
        seen.add(period)

        filing = _nearest_filing_after(filings, period)
        filing_date = (filing or {}).get("filing_date") or period
        source_type = _form_to_source_type((filing or {}).get("form") or quarter.form)

        records.append(
            EarningsRecord(
                ticker=ticker.upper(),
                report_period=period,
                source_type=source_type,
                filing_date=filing_date[:10],
                filing_url=(filing or {}).get("url"),
                fiscal_period=quarter.fiscal_period,
                quarterly=EarningsData(
                    revenue=quarter.revenue,
                    earnings_per_share=quarter.eps,
                    eps_surprise=surprise,
                    revenue_surprise=_surprise_from_yoy(rev_yoy),
                ),
            )
        )

    if records:
        logger.info("earnings_history %s via sec_edgar (%d rows)", ticker, len(records))
    return records


class QuantDataClient:
    """FDClient-compatible surface for v2 quant models with multi-provider fallbacks."""

    def __init__(self, api_keys: dict[str, str | None] | str | None = None) -> None:
        if isinstance(api_keys, str):
            self._api_keys = resolve_api_keys(api_keys)
        else:
            self._api_keys = resolve_api_keys(api_keys)
        fd_key = self._api_keys.get("FINANCIAL_DATASETS_API_KEY")
        self._fd = FDClient(api_key=fd_key) if fd_key else None
        self.last_price_source: str = "none"
        self.last_earnings_source: str = "none"

    def __enter__(self) -> QuantDataClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        if self._fd:
            self._fd.close()

    def get_prices(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        interval: str = "day",
        interval_multiplier: int = 1,
    ) -> list[Price]:
        if self._fd:
            rows = self._fd.get_prices(
                ticker,
                start_date,
                end_date,
                interval=interval,
                interval_multiplier=interval_multiplier,
            )
            if rows:
                self.last_price_source = "financial_datasets"
                return rows

        prices, src = fallback.get_prices(ticker, start_date, end_date, self._api_keys)
        if prices:
            self.last_price_source = src
            logger.info("quant prices %s via %s (%d rows)", ticker, src, len(prices))
            return [Price(**p.model_dump()) for p in prices]
        self.last_price_source = "none"
        return []

    def get_earnings_history(self, ticker: str, limit: int = 12) -> list[EarningsRecord]:
        if self._fd:
            rows = self._fd.get_earnings_history(ticker, limit=limit)
            if rows:
                self.last_earnings_source = "financial_datasets"
                return rows

        end_date = self._api_keys.get("_END_DATE") or ""
        rows = _earnings_history_from_sec(ticker, limit=limit, end_date=end_date)
        self.last_earnings_source = "sec_edgar" if rows else "none"
        return rows

    def set_end_date(self, end_date: str) -> None:
        """PEAD SEC fallback uses the shift as-of date for filing windows."""
        self._api_keys["_END_DATE"] = end_date[:10] if end_date else ""
