"""Merge FRED + BLS macro snapshots for agent prompts."""

from __future__ import annotations

from src.tools.providers.bls import fetch_labor_snapshot
from src.tools.providers.fred import fetch_macro_snapshot


def fetch_combined_macro(end_date: str, fred_key: str | None) -> dict:
    fred = fetch_macro_snapshot(end_date, fred_key)
    bls = fetch_labor_snapshot(end_date)

    series = {**fred.get("series", {}), **bls.get("series", {})}
    headlines = [
        h
        for h in (
            fred.get("summary", {}).get("headline"),
            bls.get("summary", {}).get("headline"),
        )
        if h and "unavailable" not in h.lower() and "sparse" not in h.lower()
    ]
    available = bool(fred.get("available")) or bool(bls.get("available"))
    sources = [s for s in (fred.get("source"), bls.get("source")) if s and s != "none"]

    return {
        "as_of": end_date,
        "source": "+".join(sources) if sources else "none",
        "available": available,
        "fred": fred,
        "bls": bls,
        "series": series,
        "summary": {"headline": " | ".join(headlines) if headlines else "Macro data sparse"},
    }
