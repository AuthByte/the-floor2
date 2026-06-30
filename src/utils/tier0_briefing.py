"""Compile Tier-0 desk outputs into briefings for Tier-1 investors."""

from __future__ import annotations

import re
from typing import Any

from src.utils.data_feed_keys import DATA_FEED_KEYS, QUANT_DESK_NAMES, TIER0_DESK_NAMES
from src.utils.tier0_summaries import format_tier0_summary


def extract_base_agent_key(unique_id: str) -> str:
    parts = unique_id.split("_")
    if len(parts) >= 2:
        last_part = parts[-1]
        if len(last_part) == 6 and re.match(r"^[a-z0-9]+$", last_part):
            return "_".join(parts[:-1])
    if unique_id.endswith("_agent"):
        return unique_id[: -len("_agent")]
    return unique_id


def build_desk_briefings(
    analyst_signals: dict[str, Any],
    tickers: list[str],
    *,
    desk_keys: frozenset[str],
    desk_names: dict[str, str],
    heading: str,
) -> dict[str, str]:
    """Return per-ticker markdown briefings from completed desk signals."""
    by_ticker: dict[str, list[dict[str, Any]]] = {t: [] for t in tickers}

    for agent_id, per_ticker in analyst_signals.items():
        base = extract_base_agent_key(agent_id)
        if base not in desk_keys or not isinstance(per_ticker, dict):
            continue
        desk = desk_names.get(base, base.replace("_", " ").title())
        for ticker in tickers:
            payload = per_ticker.get(ticker)
            if not payload or not isinstance(payload, dict):
                continue
            summary = payload.get("thesis_summary") or format_tier0_summary(base, payload)
            if isinstance(summary, dict):
                summary = str(summary)
            summary = str(summary).strip()
            digest = payload.get("data_digest")
            if digest and isinstance(digest, str) and digest not in summary:
                summary = f"{summary} {digest}".strip()
            if len(summary) > 700:
                summary = summary[:697] + "..."
            conf = payload.get("confidence")
            if conf is None and payload.get("conviction") is not None:
                try:
                    conf = round(min(abs(float(payload["conviction"])), 1.0) * 100)
                except (TypeError, ValueError):
                    conf = None
            by_ticker.setdefault(ticker, []).append(
                {
                    "desk": desk,
                    "signal": payload.get("signal", "neutral"),
                    "confidence": conf,
                    "summary": summary or "(no summary)",
                }
            )

    out: dict[str, str] = {}
    for ticker, entries in by_ticker.items():
        if not entries:
            continue
        lines = [f"### {ticker} — {heading}"]
        for e in entries:
            conf = e.get("confidence")
            conf_s = f", {conf}% confidence" if conf is not None else ""
            lines.append(
                f"- **{e['desk']}** — {e['signal']}{conf_s}: {e['summary']}"
            )
        out[ticker] = "\n".join(lines)
    return out


def build_tier0_briefings(
    analyst_signals: dict[str, Any],
    tickers: list[str],
) -> dict[str, str]:
    """Return per-ticker markdown briefings from completed Tier-0 signals."""
    return build_desk_briefings(
        analyst_signals,
        tickers,
        desk_keys=DATA_FEED_KEYS,
        desk_names=TIER0_DESK_NAMES,
        heading="Tier-0 desk briefings",
    )


def build_quant_briefings(
    analyst_signals: dict[str, Any],
    tickers: list[str],
) -> dict[str, str]:
    from src.utils.agent_tiers import QUANT_KEYS

    return build_desk_briefings(
        analyst_signals,
        tickers,
        desk_keys=QUANT_KEYS,
        desk_names=QUANT_DESK_NAMES,
        heading="Quant desk signals",
    )


def tier0_briefing_for_ticker(state: dict[str, Any] | None, ticker: str) -> str:
    if not state:
        return ""
    data = state.get("data") or {}
    parts: list[str] = []
    for key in ("tier0_briefings", "quant_briefings"):
        block = (data.get(key) or {}).get(ticker.upper()) or (data.get(key) or {}).get(ticker)
        if block:
            parts.append(str(block))
    if parts:
        return "\n\n".join(parts)
    if not data.get("tier0_complete"):
        return ""
    signals = data.get("analyst_signals") or {}
    tier0 = build_tier0_briefings(signals, [ticker]).get(ticker, "")
    quant = build_quant_briefings(signals, [ticker]).get(ticker, "")
    return "\n\n".join(p for p in (tier0, quant) if p)
