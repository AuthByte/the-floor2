"""BLS Public Data API v1 (no registration): https://www.bls.gov/developers/api_signature.htm."""

from __future__ import annotations

import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
URL = "https://api.bls.gov/publicAPI/v1/timeseries/data/"

# series_id -> human label
LABOR_SERIES: dict[str, str] = {
    "LNS14000000": "Unemployment rate",
    "CUUR0000SA0": "CPI all items (U.S.)",
    "CES0000000001": "Total nonfarm employment (000s)",
    "CES0500000003": "Avg hourly earnings, private",
    "WPU00000000": "PPI all commodities",
}

_bls_cache: dict[str, dict] = {}


def fetch_labor_snapshot(end_date: str | None = None) -> dict:
    """Latest BLS labor/inflation readings (v1, no API key)."""
    as_of = end_date or datetime.utcnow().strftime("%Y-%m-%d")
    if as_of in _bls_cache:
        return _bls_cache[as_of]

    end_year = int(as_of[:4])
    start_year = max(end_year - 3, end_year - 10)
    payload = {
        "seriesid": list(LABOR_SERIES.keys()),
        "startyear": str(start_year),
        "endyear": str(end_year),
    }
    import requests

    try:
        resp = requests.post(
            URL,
            data=json.dumps(payload),
            headers={"Content-type": "application/json"},
            timeout=45,
        )
    except Exception as exc:
        logger.debug("BLS request failed: %s", exc)
        snapshot = _empty(as_of, f"BLS request failed: {exc}")
        _bls_cache[as_of] = snapshot
        return snapshot

    if resp.status_code != 200:
        snapshot = _empty(as_of, f"BLS HTTP {resp.status_code}")
        _bls_cache[as_of] = snapshot
        return snapshot

    try:
        body = resp.json()
    except Exception as exc:
        snapshot = _empty(as_of, f"BLS parse error: {exc}")
        _bls_cache[as_of] = snapshot
        return snapshot

    if body.get("status") != "REQUEST_SUCCEEDED":
        msg = (body.get("message") or ["BLS request failed"])[0]
        snapshot = _empty(as_of, msg)
        _bls_cache[as_of] = snapshot
        return snapshot

    series_out: dict[str, dict] = {}
    for block in body.get("Results", {}).get("series", []):
        sid = block.get("seriesID")
        if not sid:
            continue
        monthly = [
            row
            for row in block.get("data", [])
            if row.get("period", "").startswith("M") and row.get("value") not in (None, "-", "")
        ]
        if not monthly:
            continue
        latest = monthly[0]
        prior = monthly[1] if len(monthly) > 1 else None
        try:
            val = float(latest["value"])
            prior_val = float(prior["value"]) if prior else None
        except (TypeError, ValueError):
            continue
        yoy = None
        if len(monthly) >= 13:
            try:
                yoy = (val - float(monthly[12]["value"])) / abs(float(monthly[12]["value"]))
            except (ZeroDivisionError, TypeError, ValueError):
                yoy = None
        series_out[sid] = {
            "label": LABOR_SERIES.get(sid, sid),
            "latest_date": f"{latest['year']}-{latest['period'][1:]}",
            "latest_value": val,
            "prior_value": prior_val,
            "change": (val - prior_val) if prior_val is not None else None,
            "yoy_change_pct": yoy,
            "history": [
                {"date": f"{r['year']}-{r['period'][1:]}", "value": float(r["value"])}
                for r in monthly[:6]
                if r.get("value") not in (None, "-", "")
            ],
        }

    snapshot = {
        "as_of": as_of,
        "source": "bls",
        "available": bool(series_out),
        "series": series_out,
        "summary": _build_summary(series_out),
    }
    _bls_cache[as_of] = snapshot
    return snapshot


def _empty(as_of: str, message: str) -> dict:
    return {
        "as_of": as_of,
        "source": "bls",
        "available": False,
        "message": message,
        "series": {},
        "summary": {"headline": "BLS data unavailable"},
    }


def _build_summary(series: dict[str, dict]) -> dict[str, str]:
    tags: list[str] = []
    un = series.get("LNS14000000", {}).get("latest_value")
    if un is not None:
        tags.append(f"BLS unemployment {un:.1f}%")
    cpi = series.get("CUUR0000SA0", {})
    if cpi.get("latest_value") is not None:
        yoy = cpi.get("yoy_change_pct")
        if yoy is not None:
            tags.append(f"BLS CPI index {cpi['latest_value']:.1f} (YoY {yoy * 100:.1f}%)")
        else:
            tags.append(f"BLS CPI index {cpi['latest_value']:.1f}")
    wages = series.get("CES0500000003", {}).get("latest_value")
    if wages is not None:
        tags.append(f"Avg hourly earnings ${wages:.2f}")
    ppi = series.get("WPU00000000", {}).get("yoy_change_pct")
    if ppi is not None:
        tags.append(f"PPI YoY {ppi * 100:.1f}%")
    return {"headline": "; ".join(tags) if tags else "BLS labor data sparse"}
