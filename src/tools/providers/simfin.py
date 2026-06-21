"""SimFin fundamentals & prices (https://simfin.com/)."""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from src.data.models import FinancialMetrics, LineItem, Price
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://backend.simfin.com/api/v3/companies"

PL_MAP = {
    "revenue": ("Revenue",),
    "net_income": ("Net Income",),
    "operating_income": ("Operating Income (Loss)", "Operating Income"),
    "gross_profit": ("Gross Profit",),
    "interest_expense": ("Interest Expense", "Interest Expense, net"),
    "ebitda": ("EBITDA",),
}
BS_MAP = {
    "total_debt": ("Total Debt", "Long Term Debt"),
    "shareholders_equity": ("Total Equity", "Shareholders' Equity", "Total Stockholders' Equity"),
    "total_assets": ("Total Assets",),
    "total_liabilities": ("Total Liabilities",),
    "current_assets": ("Total Current Assets",),
    "current_liabilities": ("Total Current Liabilities",),
    "cash_and_equivalents": ("Cash & Cash Equivalents", "Cash and Cash Equivalents"),
}
CF_MAP = {
    "free_cash_flow": ("Free Cash Flow",),
    "operating_cash_flow": ("Net Cash from Operating Activities",),
}

DERIVED_METRICS_MAP = {
    "net_margin": ("Net Profit Margin",),
    "operating_margin": ("Operating Margin",),
    "return_on_equity": ("Return on Equity", "Return on Equity (Adjusted)"),
    "return_on_assets": ("Return on Assets", "Return on Assets (Adjusted)"),
    "return_on_invested_capital": ("Return On Invested Capital",),
    "earnings_per_share": ("Earnings Per Share, Basic",),
    "debt_to_equity": ("Liabilities to Equity Ratio",),
    "current_ratio": ("Current Ratio",),
    "payout_ratio": ("Dividend Payout Ratio",),
    "free_cash_flow_yield": None,  # computed
}


def _headers(api_key: str | None) -> dict[str, str]:
    return {"Authorization": f"api-key {api_key}"} if api_key else {}


def _col_idx(columns: list[str], *names: str) -> int | None:
    lower = {c.lower(): i for i, c in enumerate(columns)}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    for i, col in enumerate(columns):
        cl = col.lower()
        for name in names:
            if name.lower() in cl:
                return i
    return None


def _val(row: list, idx: int | None) -> float | None:
    if idx is None or idx >= len(row):
        return None
    v = row[idx]
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _get(url: str, api_key: str | None, timeout: int = 45):
    if not api_key:
        return None
    resp = make_api_request(url, headers=_headers(api_key), timeout=timeout)
    if resp.status_code != 200:
        logger.debug("SimFin %s -> %s", url, resp.status_code)
        return None
    try:
        return resp.json()
    except Exception:
        return None


def _stmt_block(payload: list | dict, stype: str) -> tuple[list[str], list[list]] | None:
    if not payload:
        return None
    company = payload[0] if isinstance(payload, list) else payload
    for block in company.get("statements", []):
        if str(block.get("statement", "")).upper() == stype.upper():
            return block.get("columns", []), block.get("data", [])
    return None


def fetch_prices(ticker: str, start_date: str, end_date: str, api_key: str | None) -> list[Price]:
    params = urlencode({"ticker": ticker.upper(), "start": start_date, "end": end_date})
    data = _get(f"{BASE}/prices/compact?{params}", api_key)
    if not data:
        return []
    try:
        block = data[0] if isinstance(data, list) else data
        cols = block.get("columns", [])
        rows = block.get("data", [])
        i_date = _col_idx(cols, "Date")
        i_open = _col_idx(cols, "Opening Price")
        i_high = _col_idx(cols, "Highest Price")
        i_low = _col_idx(cols, "Lowest Price")
        i_close = _col_idx(cols, "Last Closing Price", "Adjusted Closing Price")
        i_vol = _col_idx(cols, "Trading Volume")
        if i_close is None:
            return []
        out: list[Price] = []
        for row in rows:
            day = str(row[i_date])[:10] if i_date is not None else end_date
            out.append(
                Price(
                    open=float(_val(row, i_open) or _val(row, i_close) or 0),
                    close=float(_val(row, i_close) or 0),
                    high=float(_val(row, i_high) or _val(row, i_close) or 0),
                    low=float(_val(row, i_low) or _val(row, i_close) or 0),
                    volume=int(_val(row, i_vol) or 0),
                    time=day,
                )
            )
        return out
    except Exception as exc:
        logger.debug("SimFin prices failed for %s: %s", ticker, exc)
        return []


def fetch_market_cap(ticker: str, api_key: str | None) -> float | None:
    params = urlencode({"ticker": ticker.upper()})
    data = _get(f"{BASE}/prices/compact?{params}", api_key)
    if not data:
        return None
    try:
        block = data[0] if isinstance(data, list) else data
        cols = block.get("columns", [])
        rows = block.get("data", [])
        if not rows:
            return None
        row = rows[-1]
        shares = _val(row, _col_idx(cols, "Common Shares Outstanding"))
        price = _val(row, _col_idx(cols, "Last Closing Price", "Adjusted Closing Price"))
        if shares and price:
            return shares * price
    except Exception:
        pass
    return None


def _fetch_statements(
    ticker: str,
    statements: str,
    api_key: str | None,
    *,
    period: str | None = None,
    ttm: bool = False,
    start: str | None = None,
    end: str | None = None,
) -> list | None:
    params: dict[str, str] = {"ticker": ticker.upper(), "statements": statements}
    if period:
        params["period"] = period
    if ttm:
        params["ttm"] = "true"
    if start:
        params["start"] = start
    if end:
        params["end"] = end
    return _get(f"{BASE}/statements/compact?{urlencode(params)}", api_key)


def fetch_financial_metrics(
    ticker: str, end_date: str, period: str, limit: int, api_key: str | None
) -> list[FinancialMetrics]:
    use_ttm = period == "ttm"
    stmt_period = "q1,q2,q3,q4,fy" if not use_ttm else None
    data = _fetch_statements(
        ticker,
        "derived",
        api_key,
        period=stmt_period,
        ttm=use_ttm,
        end=end_date,
    )
    table = _stmt_block(data, "DERIVED") if data else None
    if not table:
        return []
    cols, rows = table
    if not rows:
        return []

    i_report = _col_idx(cols, "Report Date")
    sorted_rows = sorted(rows, key=lambda r: str(r[i_report]) if i_report is not None else "", reverse=True)

    out: list[FinancialMetrics] = []
    currency = "USD"
    if isinstance(data, list) and data:
        currency = data[0].get("currency", "USD") or "USD"

    cap = fetch_market_cap(ticker, api_key)

    for row in sorted_rows[:limit]:
        payload: dict = {name: None for name in FinancialMetrics.model_fields}
        payload.update(
            {
                "ticker": ticker,
                "report_period": str(row[i_report])[:10] if i_report is not None else end_date,
                "period": period,
                "currency": currency,
            }
        )
        i_fcf = _col_idx(cols, "Free Cash Flow")
        fcf = _val(row, i_fcf)
        for field, col_names in DERIVED_METRICS_MAP.items():
            if not col_names:
                continue
            payload[field] = _val(row, _col_idx(cols, *col_names))
        if cap and fcf:
            payload["free_cash_flow_yield"] = fcf / cap
            payload["market_cap"] = cap
        i_ebitda = _col_idx(cols, "EBITDA")
        ebitda = _val(row, i_ebitda)
        if cap and ebitda and ebitda > 0:
            ev = cap + (_val(row, _col_idx(cols, "Total Debt")) or 0)
            payload["enterprise_value_to_ebitda_ratio"] = ev / ebitda
        out.append(FinancialMetrics(**payload))
    return out


def fetch_line_items(
    ticker: str, line_items: list[str], end_date: str, period: str, limit: int, api_key: str | None
) -> list[LineItem]:
    stmt_period = "q1,q2,q3,q4" if period != "annual" else "fy"
    data = _fetch_statements(ticker, "pl,bs,cf", api_key, period=stmt_period, end=end_date)
    if not data:
        return []

    pl = _stmt_block(data, "PL")
    bs = _stmt_block(data, "BS")
    cf = _stmt_block(data, "CF")
    if not pl:
        return []

    pl_cols, pl_rows = pl
    bs_cols, bs_rows = (bs or ([], []))
    cf_cols, cf_rows = (cf or ([], []))

    i_report = _col_idx(pl_cols, "Report Date")
    pl_sorted = sorted(
        pl_rows,
        key=lambda r: str(r[i_report]) if i_report is not None else "",
        reverse=True,
    )[:limit]

    currency = "USD"
    if isinstance(data, list) and data:
        currency = data[0].get("currency", "USD") or "USD"

    out: list[LineItem] = []
    for pl_row in pl_sorted:
        report = str(pl_row[i_report])[:10] if i_report is not None else end_date
        bs_row = next(
            (r for r in bs_rows if i_report is not None and str(r[i_report])[:10] == report),
            bs_rows[0] if bs_rows else None,
        )
        cf_row = next(
            (r for r in cf_rows if i_report is not None and str(r[i_report])[:10] == report),
            cf_rows[0] if cf_rows else None,
        )
        payload: dict = {}
        for name in line_items:
            val = None
            if name in PL_MAP and pl_row is not None:
                val = _val(pl_row, _col_idx(pl_cols, *PL_MAP[name]))
            if val is None and name in BS_MAP and bs_row is not None:
                val = _val(bs_row, _col_idx(bs_cols, *BS_MAP[name]))
            if val is None and name in CF_MAP and cf_row is not None:
                val = _val(cf_row, _col_idx(cf_cols, *CF_MAP[name]))
            if val is not None:
                payload[name] = val
        if payload:
            out.append(
                LineItem(
                    ticker=ticker,
                    report_period=report,
                    period=period,
                    currency=currency,
                    **payload,
                )
            )
    return out
