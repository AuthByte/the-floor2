"""Conviction ensemble — the portfolio manager's arithmetic.

Every desk casts a vote ``direction × confidence × weight``. Net conviction and
agreement decide the action and how much of the risk desk's capacity to use.
The LLM only writes the rationale; it never picks the trade.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from src.utils.agent_tiers import QUANT_KEYS, SPECIALIST_KEYS
from src.utils.data_feed_keys import DATA_FEED_KEYS

Action = Literal["buy", "sell", "short", "cover", "hold"]

DEAD_BAND = 0.12  # |net| below this → hold
SHORT_BAR = 0.25  # opening a new short needs stronger agreement than trimming a long
FULL_SIZE_AT = 0.52  # |net| at which the full capacity is used
CONSULTED_BOOST = 1.25

DIRECTION = {"bullish": 1, "bearish": -1, "neutral": 0}


def desk_weight(agent_id: str) -> float:
    from src.utils.consultation import extract_base_agent_key

    base = extract_base_agent_key(agent_id)
    if base in DATA_FEED_KEYS:
        return 0.6
    if base in QUANT_KEYS:
        return 0.8
    if base in SPECIALIST_KEYS:
        return 0.8
    return 1.0


@dataclass
class Tally:
    net: float  # [-1, +1]
    agreement: float  # [0, 1] — weight share on the winning side
    voters: int
    bulls: int
    bears: int
    neutrals: int
    top_for: list[str]
    top_against: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "net": round(self.net, 3),
            "agreement": round(self.agreement, 2),
            "voters": self.voters,
            "bulls": self.bulls,
            "bears": self.bears,
            "neutrals": self.neutrals,
        }


def tally(signals: dict[str, dict[str, Any]]) -> Tally:
    total_w = 0.0
    net = 0.0
    side_w = {1: 0.0, -1: 0.0, 0: 0.0}
    counts = {1: 0, -1: 0, 0: 0}
    scored: list[tuple[float, str]] = []
    for agent, payload in signals.items():
        sig = str(payload.get("sig") or payload.get("signal") or "").lower()
        if sig not in DIRECTION:
            continue
        conf = payload.get("conf", payload.get("confidence"))
        try:
            conf = max(0.0, min(100.0, float(conf))) / 100
        except (TypeError, ValueError):
            continue
        w = desk_weight(agent) * (CONSULTED_BOOST if payload.get("user_consulted") else 1.0)
        d = DIRECTION[sig]
        total_w += w
        net += d * conf * w
        side_w[d] += w
        counts[d] += 1
        scored.append((d * conf * w, agent))
    if total_w == 0:
        return Tally(0.0, 0.0, 0, 0, 0, 0, [], [])
    net /= total_w
    winning = 1 if net > 0 else -1 if net < 0 else 0
    agreement = side_w[winning] / total_w if winning else side_w[0] / total_w
    scored.sort()
    return Tally(
        net=net,
        agreement=agreement,
        voters=sum(counts.values()),
        bulls=counts[1],
        bears=counts[-1],
        neutrals=counts[0],
        top_for=[a for v, a in reversed(scored) if v > 0][:3],
        top_against=[a for v, a in scored if v < 0][:3],
    )


def size_fraction(net: float, agreement: float) -> float:
    raw = (abs(net) - DEAD_BAND) / (FULL_SIZE_AT - DEAD_BAND)
    raw = max(0.0, min(1.0, raw))
    return raw * (0.5 + 0.5 * agreement)


def decide(
    t: Tally,
    allowed: dict[str, int],
    position: dict[str, Any] | None,
) -> tuple[Action, int, float]:
    """Return (action, quantity, confidence) for one ticker."""
    pos = position or {}
    long_sh = int(pos.get("long", 0) or 0)
    short_sh = int(pos.get("short", 0) or 0)
    frac = size_fraction(t.net, t.agreement)
    conviction = min(1.0, abs(t.net) * 1.6) * (0.5 + 0.5 * t.agreement)
    confidence = round(100 * conviction)

    if abs(t.net) < DEAD_BAND or t.voters == 0:
        hold_conf = round(50 + 50 * (1 - abs(t.net) / DEAD_BAND)) if t.voters else 0
        return "hold", 0, float(hold_conf)

    if t.net > 0:
        if short_sh > 0 and allowed.get("cover"):
            return "cover", min(short_sh, allowed["cover"]), float(confidence)
        qty = int(allowed.get("buy", 0) * frac)
        if qty < 1 and allowed.get("buy", 0) >= 1 and frac > 0:
            qty = 1
        return ("buy", qty, float(confidence)) if qty > 0 else ("hold", 0, float(confidence))

    if long_sh > 0 and allowed.get("sell"):
        trim = max(1 / 3, frac)  # a bearish committee always trims at least a third
        qty = max(1, int(round(min(long_sh, allowed["sell"]) * trim)))
        return "sell", qty, float(confidence)
    if abs(t.net) >= SHORT_BAR and allowed.get("short"):
        qty = int(allowed["short"] * frac)
        if qty > 0:
            return "short", qty, float(confidence)
    return "hold", 0, float(confidence)


def fallback_rationale(ticker: str, action: Action, qty: int, t: Tally) -> str:
    split = f"{t.bulls}↑ {t.bears}↓ {t.neutrals}→"
    if action == "hold":
        return f"Net {t.net:+.2f} ({split}) — inside the no-trade band."
    return f"Net {t.net:+.2f} ({split}, {t.agreement:.0%} aligned) → {action} {qty}."
