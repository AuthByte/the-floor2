"""Compile Tier-0 desk outputs into briefings for Tier-1 investors."""

from __future__ import annotations

import re
from typing import Any

from src.utils.data_feed_keys import DATA_FEED_KEYS, TIER0_DESK_NAMES


def extract_base_agent_key(unique_id: str) -> str:
    parts = unique_id.split("_")
    if len(parts) >= 2:
        last_part = parts[-1]
        if len(last_part) == 6 and re.match(r"^[a-z0-9]+$", last_part):
            return "_".join(parts[:-1])
    if unique_id.endswith("_agent"):
        return unique_id[: -len("_agent")]
    return unique_id


def build_tier0_briefings(
    analyst_signals: dict[str, Any],
    tickers: list[str],
) -> dict[str, str]:
    """Return per-ticker markdown briefings from completed Tier-0 signals."""
    by_ticker: dict[str, list[dict[str, Any]]] = {t: [] for t in tickers}

    for agent_id, per_ticker in analyst_signals.items():
        base = extract_base_agent_key(agent_id)
        if base not in DATA_FEED_KEYS or not isinstance(per_ticker, dict):
            continue
        desk = TIER0_DESK_NAMES.get(base, base.replace("_", " ").title())
        for ticker in tickers:
            payload = per_ticker.get(ticker)
            if not payload or not isinstance(payload, dict):
                continue
            summary = payload.get("thesis_summary") or payload.get("reasoning") or ""
            if isinstance(summary, dict):
                summary = str(summary)
            summary = str(summary).strip()
            if len(summary) > 700:
                summary = summary[:697] + "..."
            by_ticker.setdefault(ticker, []).append(
                {
                    "desk": desk,
                    "signal": payload.get("signal", "neutral"),
                    "confidence": payload.get("confidence"),
                    "summary": summary or "(no summary)",
                }
            )

    out: dict[str, str] = {}
    for ticker, entries in by_ticker.items():
        if not entries:
            continue
        lines = [f"### {ticker} — Tier-0 desk briefings"]
        for e in entries:
            conf = e.get("confidence")
            conf_s = f", {conf}% confidence" if conf is not None else ""
            lines.append(
                f"- **{e['desk']}** — {e['signal']}{conf_s}: {e['summary']}"
            )
        out[ticker] = "\n".join(lines)
    return out


def tier0_briefing_for_ticker(state: dict[str, Any] | None, ticker: str) -> str:
    if not state:
        return ""
    data = state.get("data") or {}
    briefings = data.get("tier0_briefings") or {}
    block = briefings.get(ticker.upper()) or briefings.get(ticker)
    if block:
        return str(block)
    if not data.get("tier0_complete"):
        return ""
    return build_tier0_briefings(data.get("analyst_signals") or {}, [ticker]).get(ticker, "")
