"""Lightweight news sentiment inference when providers omit scores."""

from __future__ import annotations

_POSITIVE = (
    "beat",
    "beats",
    "surge",
    "soar",
    "record",
    "upgrade",
    "upgraded",
    "strong",
    "growth",
    "profit",
    "bullish",
    "outperform",
    "raises guidance",
    "raised guidance",
)
_NEGATIVE = (
    "miss",
    "misses",
    "fall",
    "falls",
    "drop",
    "plunge",
    "cut",
    "cuts",
    "downgrade",
    "downgraded",
    "weak",
    "loss",
    "losses",
    "lawsuit",
    "investigation",
    "recall",
    "bearish",
    "underperform",
    "lowers guidance",
    "lowered guidance",
)


def infer_sentiment_from_title(title: str | None) -> str | None:
    if not title:
        return None
    t = title.lower()
    pos = sum(1 for w in _POSITIVE if w in t)
    neg = sum(1 for w in _NEGATIVE if w in t)
    if pos > neg and pos > 0:
        return "positive"
    if neg > pos and neg > 0:
        return "negative"
    return None
