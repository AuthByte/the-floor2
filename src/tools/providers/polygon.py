"""Polygon.io / Massive market data (https://polygon.io/)."""

from __future__ import annotations

import logging
from datetime import datetime

from src.data.models import FinancialMetrics, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://api.polygon.io"


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    if not api_key:
        return []
    url = (
        f"{BASE}/v2/aggs/ticker/{ticker.upper()}/range/1/day/"
        f"{start_date}/{end_date}?adjusted=true&sort=asc&limit=50000&apiKey={api_key}"
    )
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        rows = resp.json().get("results") or []
        out: list[Price] = []
        for row in rows:
            ts = row.get("t")
            day = datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d") if ts else end_date
            out.append(
                Price(
                    open=float(row["o"]),
                    close=float(row["c"]),
                    high=float(row["h"]),
                    low=float(row["l"]),
                    volume=int(row.get("v", 0) or 0),
                    time=day,
                )
            )
        return out
    except Exception as exc:
        logger.debug("Polygon prices failed for %s: %s", ticker, exc)
        return []


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    if not api_key:
        return []
    url = f"{BASE}/vX/reference/financials?ticker={ticker.upper()}&limit=1&apiKey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return []
    try:
        results = resp.json().get("results") or []
        if not results:
            return []
        row = results[0]
        fin = row.get("financials", {})
        income = fin.get("income_statement", {})
        balance = fin.get("balance_sheet", {})
        cashflow = fin.get("cash_flow_statement", {})

        def _val(block: dict, key: str) -> float | None:
            item = block.get(key, {})
            v = item.get("value") if isinstance(item, dict) else item
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        net_income = _val(income, "net_income_loss")
        equity = _val(balance, "equity")
        debt = _val(balance, "liabilities") or _val(balance, "long_term_debt")
        fcf = _val(cashflow, "net_cash_flow_from_operating_activities")
        return [
            FinancialMetrics(
                ticker=ticker,
                report_period=row.get("end_date") or end_date,
                period=period,
                currency="USD",
                debt_to_equity=(debt / equity) if debt is not None and equity and equity > 0 else None,
                net_margin=None,
                earnings_per_share=None,
                free_cash_flow_per_share=None,
                free_cash_flow_yield=None,
            )
        ]
    except Exception as exc:
        logger.debug("Polygon financials failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    if not api_key:
        return None
    url = f"{BASE}/v3/reference/tickers/{ticker.upper()}?apiKey={api_key}"
    resp = make_api_request(url)
    if resp.status_code != 200:
        return None
    try:
        cap = resp.json().get("results", {}).get("market_cap")
        return float(cap) if cap else None
    except (TypeError, ValueError):
        return None
