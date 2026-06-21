"""SEC EDGAR public data (free, no API key — User-Agent required)."""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from src.data.models import InsiderTrade, LineItem
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)

SEC_HEADERS = {
    "User-Agent": os.environ.get("SEC_EDGAR_USER_AGENT", "THE-FLOOR research@example.com"),
    "Accept-Encoding": "gzip, deflate",
}

GAAP_MAP = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "operating_income": ["OperatingIncomeLoss"],
    "free_cash_flow": ["FreeCashFlow"],
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "total_debt": ["LongTermDebt", "DebtInstrumentCarryingAmount"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],
    "current_assets": ["AssetsCurrent"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "shareholders_equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "cash_and_equivalents": ["CashAndCashEquivalentsAtCarryingValue"],
    "ebitda": ["EarningsBeforeInterestTaxesDepreciationAndAmortization"],
    "gross_profit": ["GrossProfit"],
    "earnings_per_share": ["EarningsPerShareBasic", "EarningsPerShareDiluted"],
    "book_value_per_share": ["BookValuePerShare"],
    "outstanding_shares": [
        "CommonStockSharesOutstanding",
        "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    "dividends_and_other_cash_distributions": [
        "PaymentsOfDividends",
        "DividendsCommonStock",
    ],
}


def get_cik(ticker: str) -> str | None:
    return _ticker_cik_map().get(ticker.upper())


def fetch_company_facts(ticker: str) -> dict | None:
    cik = get_cik(ticker)
    return _company_facts(cik) if cik else None


@lru_cache(maxsize=1)
def _ticker_cik_map() -> dict[str, str]:
    resp = make_api_request(
        "https://www.sec.gov/files/company_tickers.json",
        SEC_HEADERS,
        timeout=60,
    )
    if resp.status_code != 200:
        return {}
    try:
        data = resp.json()
        out: dict[str, str] = {}
        for entry in data.values():
            ticker = str(entry.get("ticker", "")).upper()
            cik = str(entry.get("cik_str", "")).zfill(10)
            if ticker:
                out[ticker] = cik
        return out
    except Exception as exc:
        logger.debug("SEC ticker map failed: %s", exc)
        return {}


def _company_facts(cik: str) -> dict | None:
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    resp = make_api_request(url, SEC_HEADERS, timeout=60)
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except Exception:
        return None


def _latest_gaap_value(facts: dict, tags: list[str]) -> tuple[str | None, float | None]:
    gaap = facts.get("facts", {}).get("us-gaap", {})
    for tag in tags:
        block = gaap.get(tag)
        if not block:
            continue
        units = block.get("units", {})
        for unit_values in units.values():
            if not unit_values:
                continue
            latest = max(unit_values, key=lambda x: x.get("end", ""))
            return latest.get("end"), float(latest.get("val"))
    return None, None


def fetch_line_items(ticker: str, line_items: list[str], end_date: str, period: str, limit: int) -> list[LineItem]:
    cik = _ticker_cik_map().get(ticker.upper())
    if not cik:
        return []
    facts = _company_facts(cik)
    if not facts:
        return []
    payload: dict = {}
    report_period = end_date
    for name in line_items:
        tags = GAAP_MAP.get(name, [])
        if not tags:
            continue
        dt, val = _latest_gaap_value(facts, tags)
        if val is not None:
            payload[name] = val
            if dt:
                report_period = dt
    if not payload:
        return []
    return [
        LineItem(
            ticker=ticker,
            report_period=report_period,
            period=period,
            currency="USD",
            **payload,
        )
    ]


def fetch_insider_trades(ticker: str, limit: int) -> list[InsiderTrade]:
    cik = _ticker_cik_map().get(ticker.upper())
    if not cik:
        return []
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    resp = make_api_request(url, SEC_HEADERS, timeout=60)
    if resp.status_code != 200:
        return []
    try:
        data = resp.json()
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        out: list[InsiderTrade] = []
        for form, fdate in zip(forms, dates):
            if form not in ("4", "4/A"):
                continue
            out.append(
                InsiderTrade(
                    ticker=ticker,
                    filing_date=fdate,
                    transaction_shares=0,
                    name="SEC Form 4",
                )
            )
            if len(out) >= limit:
                break
        return out
    except Exception as exc:
        logger.debug("SEC insider list failed for %s: %s", ticker, exc)
        return []
