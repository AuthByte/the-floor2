"""Post-shift weather synthesis — one-screen committee climate per ticker."""

from __future__ import annotations

from typing import Any

from src.utils.analysts import ANALYST_CONFIG


def _strip_suffix(agent_id: str) -> str:
    parts = agent_id.split("_")
    if len(parts) >= 2 and len(parts[-1]) == 6 and parts[-1].isalnum():
        return "_".join(parts[:-1])
    if parts[-1] == "agent":
        return "_".join(parts[:-1])
    return agent_id


def _investor_opinions(
    analyst_signals: dict[str, Any],
    ticker: str,
) -> list[dict[str, Any]]:
    key = str(ticker).strip().upper()
    rows: list[dict[str, Any]] = []
    for agent_id, by_ticker in analyst_signals.items():
        entry = (by_ticker or {}).get(key)
        if not entry:
            continue
        base = _strip_suffix(agent_id)
        cfg = ANALYST_CONFIG.get(base, {})
        if base.endswith("_agent") and base not in ANALYST_CONFIG:
            continue
        signal = str(entry.get("signal") or "neutral").lower()
        try:
            conf = float(entry.get("confidence") or 0)
        except (TypeError, ValueError):
            conf = 0.0
        rows.append(
            {
                "agent_id": agent_id,
                "key": base,
                "name": cfg.get("display_name", base.replace("_", " ").title()),
                "signal": signal,
                "confidence": conf,
            }
        )
    return rows


def _fragility(opinions: list[dict[str, Any]]) -> tuple[float, str]:
    if not opinions:
        return 0.0, "No voices"
    bulls = sum(1 for o in opinions if o["signal"] == "bullish")
    bears = sum(1 for o in opinions if o["signal"] == "bearish")
    total = len(opinions)
    majority = max(bulls, bears, total - bulls - bears)
    ratio = majority / total if total else 1.0
    score = round((1.0 - ratio) * 100 + min(bulls, bears) * 4, 1)
    if score >= 55:
        label = "Fragile consensus"
    elif score >= 35:
        label = "Contested"
    elif score >= 18:
        label = "Mixed skies"
    else:
        label = "Settled lane"
    return score, label


def _condition(bulls: int, bears: int, neutrals: int, fragility: float) -> str:
    if fragility >= 55:
        return "stormy"
    if bulls > bears * 1.6 and bulls >= bears + 2:
        return "clearing"
    if bears > bulls * 1.6 and bears >= bulls + 2:
        return "overcast"
    if neutrals >= bulls and neutrals >= bears:
        return "hazy"
    return "variable"


def build_weather_report(
    *,
    ticker: str,
    analyst_signals: dict[str, Any],
    decision: dict[str, Any] | None = None,
    dossier: dict[str, Any] | None = None,
    risk_pipeline: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Synthesize committee weather for a single ticker."""
    key = str(ticker).strip().upper()
    opinions = _investor_opinions(analyst_signals, key)
    bulls = sum(1 for o in opinions if o["signal"] == "bullish")
    bears = sum(1 for o in opinions if o["signal"] == "bearish")
    neutrals = len(opinions) - bulls - bears
    fragility, fragility_label = _fragility(opinions)
    condition = _condition(bulls, bears, neutrals, fragility)

    sorted_by_conf = sorted(opinions, key=lambda o: o["confidence"], reverse=True)
    carried_by = [
        {"name": o["name"], "signal": o["signal"], "confidence": o["confidence"]}
        for o in sorted_by_conf[:3]
    ]

    disputes: list[dict[str, Any]] = []
    dossier = dossier or {}
    for d in (dossier.get("disputes") or [])[:4]:
        if not isinstance(d, dict):
            continue
        disputes.append(
            {
                "summary": str(d.get("summary") or d.get("topic") or "")[:200],
                "agents": d.get("agents") or d.get("claim_ids") or [],
            }
        )

    dominant_claim = ""
    claims = dossier.get("claims") or []
    if claims:
        top = max(claims, key=lambda c: float(c.get("confidence") or 0) if isinstance(c, dict) else 0)
        if isinstance(top, dict):
            dominant_claim = str(top.get("claim") or top.get("text") or "")[:240]

    boss_action = None
    boss_confidence = None
    if decision:
        boss_action = decision.get("action")
        boss_confidence = decision.get("confidence")

    key_risk = None
    if risk_pipeline:
        key_risk = (
            risk_pipeline.get("headline")
            or risk_pipeline.get("summary")
            or (risk_pipeline.get("watch_items") or [None])[0]
        )
        if isinstance(key_risk, dict):
            key_risk = key_risk.get("label") or key_risk.get("text")

    headline_parts: list[str] = []
    if bulls > bears:
        headline_parts.append(f"{bulls} bull vs {bears} bear")
    elif bears > bulls:
        headline_parts.append(f"{bears} bear vs {bulls} bull")
    else:
        headline_parts.append(f"Split desk ({bulls}/{bears}/{neutrals})")
    headline_parts.append(fragility_label.lower())
    headline = " · ".join(headline_parts)

    return {
        "ticker": key,
        "condition": condition,
        "headline": headline,
        "fragility": fragility,
        "fragility_label": fragility_label,
        "tally": {"bullish": bulls, "bearish": bears, "neutral": neutrals},
        "carried_by": carried_by,
        "top_disputes": disputes,
        "dominant_claim": dominant_claim,
        "boss_action": boss_action,
        "boss_confidence": boss_confidence,
        "key_risk": str(key_risk)[:200] if key_risk else None,
        "voice_count": len(opinions),
    }


def build_weather_reports(
    tickers: list[str],
    analyst_signals: dict[str, Any],
    decisions: dict[str, Any] | None = None,
    dossiers: dict[str, Any] | None = None,
    risk_pipeline: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    decisions = decisions or {}
    dossiers = dossiers or {}
    risk_pipeline = risk_pipeline or {}
    for raw in tickers:
        key = str(raw).strip().upper()
        if not key:
            continue
        out[key] = build_weather_report(
            ticker=key,
            analyst_signals=analyst_signals,
            decision=decisions.get(key),
            dossier=dossiers.get(key),
            risk_pipeline=risk_pipeline.get(key),
        )
    return out
