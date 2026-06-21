"""FRED macroeconomic data (free API key: https://fred.stlouisfed.org/docs/api/api_key.html)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from src.tools.http import make_api_request

logger = logging.getLogger(__name__)

# series_id -> human label
MACRO_SERIES: dict[str, str] = {
    "FEDFUNDS": "Fed funds rate",
    "CPIAUCSL": "CPI (index)",
    "UNRATE": "Unemployment rate",
    "DGS10": "10Y Treasury yield",
    "T10Y2Y": "10Y-2Y yield spread",
    "VIXCLS": "VIX",
    "GDP": "Nominal GDP",
    "DCOILWTICO": "WTI crude oil",
    "BAMLH0A0HYM2": "High-yield OAS spread",
    "UMCSENT": "Consumer sentiment",
}

_macro_cache: dict[str, dict] = {}


def fetch_macro_snapshot(end_date: str | None = None, api_key: str | None = None) -> dict:
    """
    Return latest macro readings plus simple derived context.
    Cached per end_date for the process lifetime.
    """
    as_of = end_date or datetime.utcnow().strftime("%Y-%m-%d")
    cache_key = f"{as_of}:{api_key or 'no-key'}"
    if cache_key in _macro_cache:
        return _macro_cache[cache_key]

    if not api_key:
        snapshot = {
            "as_of": as_of,
            "source": "none",
            "available": False,
            "message": "Set FRED_API_KEY for macro data (free at fred.stlouisfed.org).",
            "series": {},
        }
        _macro_cache[cache_key] = snapshot
        return snapshot

    series_out: dict[str, dict] = {}
    for series_id, label in MACRO_SERIES.items():
        obs = _fetch_series(series_id, api_key, as_of)
        if obs:
            series_out[series_id] = {"label": label, **obs}

    snapshot = {
        "as_of": as_of,
        "source": "fred",
        "available": bool(series_out),
        "series": series_out,
        "summary": _build_summary(series_out),
    }
    _macro_cache[cache_key] = snapshot
    return snapshot


def _fetch_series(series_id: str, api_key: str, end_date: str) -> dict | None:
    start = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=730)).strftime("%Y-%m-%d")
    url = (
        "https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={api_key}&file_type=json"
        f"&observation_start={start}&observation_end={end_date}&sort_order=desc&limit=24"
    )
    resp = make_api_request(url, timeout=30)
    if resp.status_code != 200:
        logger.debug("FRED %s failed: %s", series_id, resp.status_code)
        return None
    try:
        observations = resp.json().get("observations", [])
        clean = [
            {"date": o["date"], "value": float(o["value"])}
            for o in observations
            if o.get("value") not in (None, ".", "")
        ]
        if not clean:
            return None
        latest = clean[0]
        prior = clean[1] if len(clean) > 1 else None
        yoy = None
        if len(clean) >= 13:
            try:
                yoy = (latest["value"] - clean[12]["value"]) / abs(clean[12]["value"])
            except (ZeroDivisionError, TypeError):
                yoy = None
        return {
            "latest_date": latest["date"],
            "latest_value": latest["value"],
            "prior_value": prior["value"] if prior else None,
            "change": (latest["value"] - prior["value"]) if prior else None,
            "yoy_change_pct": yoy,
            "history": clean[:6],
        }
    except Exception as exc:
        logger.debug("FRED parse failed for %s: %s", series_id, exc)
        return None


def _build_summary(series: dict[str, dict]) -> dict[str, str]:
    """Plain-English macro tags for LLM prompts."""
    tags: list[str] = []
    ff = series.get("FEDFUNDS", {}).get("latest_value")
    if ff is not None:
        tags.append(f"Fed funds ~{ff:.2f}%")
    un = series.get("UNRATE", {}).get("latest_value")
    if un is not None:
        tags.append(f"Unemployment {un:.1f}%")
    y10 = series.get("DGS10", {}).get("latest_value")
    if y10 is not None:
        tags.append(f"10Y yield {y10:.2f}%")
    spread = series.get("T10Y2Y", {}).get("latest_value")
    if spread is not None:
        tags.append(f"Yield curve spread {spread:.2f}% ({'inverted' if spread < 0 else 'positive'})")
    vix = series.get("VIXCLS", {}).get("latest_value")
    if vix is not None:
        tags.append(f"VIX {vix:.1f}")
    hy = series.get("BAMLH0A0HYM2", {}).get("latest_value")
    if hy is not None:
        tags.append(f"HY spread {hy:.2f}%")
    return {"headline": "; ".join(tags) if tags else "Macro data sparse"}
