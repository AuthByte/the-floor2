"""Stage 4 — risk watchtower: live status snapshot and monthly deltas."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage

from src.graph.state import AgentState
from src.tools.providers.keys import keys_from_state
from src.utils.progress import progress
from src.utils.risk_pipeline import (
    RISK_WATCHTOWER_ID,
    ensure_risk_bucket,
    risk_pipeline_enabled,
)
from src.tools.api import get_company_news, get_prices


def _status_from_score(score: float) -> str:
    if score >= 0.62:
        return "high"
    if score >= 0.38:
        return "medium"
    return "low"


def _indicator_status(delta: float) -> str:
    if delta > 5:
        return "up"
    if delta < -5:
        return "down"
    return "flat"


def risk_watchtower_node(state: AgentState) -> dict[str, Any]:
    if not risk_pipeline_enabled(state):
        progress.update_status(RISK_WATCHTOWER_ID, None, "Skipped")
        return {"data": {}}

    data = state["data"]
    tickers = data.get("tickers") or []
    end_date = data.get("end_date", "")
    start_date = data.get("start_date", end_date)
    api_keys = keys_from_state(state)
    pipeline: dict[str, Any] = data.get("risk_pipeline") or {}
    baselines: dict[str, Any] = data.setdefault("risk_watchtower_baselines", {})

    for ticker in tickers:
        key = ticker.strip().upper()
        bucket = ensure_risk_bucket(state, key)
        inventory = bucket.get("inventory") or []
        research = bucket.get("research") or {}
        progress.update_status(RISK_WATCHTOWER_ID, key, "Scanning indicators")

        news = get_company_news(key, end_date, limit=40, api_key=api_keys)
        prices = get_prices(key, start_date=start_date, end_date=end_date, api_key=api_keys)
        vol = 0.0
        if prices and len(prices) > 5:
            rets = []
            for i in range(1, min(len(prices), 30)):
                p0 = getattr(prices[i], "close", None) or getattr(prices[i], "price", 0)
                p1 = getattr(prices[i - 1], "close", None) or getattr(prices[i - 1], "price", 0)
                if p0 and p1:
                    rets.append((float(p1) - float(p0)) / float(p0))
            if rets:
                mean = sum(rets) / len(rets)
                vol = (sum((r - mean) ** 2 for r in rets) / len(rets)) ** 0.5

        neg_news = sum(
            1
            for n in news
            if any(w in (getattr(n, "title", "") or "").lower() for w in ("risk", "ban", "probe", "war", "short"))
        )
        news_stress = min(1.0, neg_news / 12.0)

        monitoring: dict[str, Any] = {}
        prior = baselines.get(key) or {}

        for risk in inventory[:10]:
            rid = risk["id"]
            block = research.get(rid) or {}
            prob = float(block.get("blended_probability_pct") or 15) / 100.0
            sev = float(block.get("blended_severity_score") or 5) / 10.0
            score = min(1.0, prob * 0.55 + sev * 0.35 + news_stress * 0.25 + vol * 2.5)
            status = _status_from_score(score)

            prev_score = float((prior.get(rid) or {}).get("score", score))
            delta_pct = round((score - prev_score) * 100, 1)

            changes = [
                {
                    "indicator": "Negative headline velocity",
                    "delta_pct": round(news_stress * 100, 1),
                    "direction": _indicator_status(news_stress * 100 - 30),
                },
                {
                    "indicator": "Tape volatility (30d)",
                    "delta_pct": round(vol * 1000, 1),
                    "direction": _indicator_status(vol * 1000 - 15),
                },
            ]
            if risk.get("category") == "geopolitical":
                changes.append(
                    {
                        "indicator": "Geopolitical news mentions",
                        "delta_pct": round(neg_news * 2.5, 1),
                        "direction": _indicator_status(neg_news * 2.5 - 10),
                    }
                )

            monitoring[rid] = {
                "status": status,
                "score": round(score, 3),
                "changes_this_month": changes,
                "indicators": [
                    {"name": "Composite risk score", "value": round(score * 100, 1)},
                    {"name": "Research probability", "value": block.get("blended_probability_pct")},
                ],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

        bucket["monitoring"] = monitoring
        pipeline[key] = bucket
        baselines[key] = {rid: {"score": m["score"]} for rid, m in monitoring.items()}

        progress.update_status(
            RISK_WATCHTOWER_ID,
            key,
            "Done",
            analysis=json.dumps({"monitoring": monitoring}, default=str),
        )

    progress.update_status(RISK_WATCHTOWER_ID, None, "Watchtower updated")
    message = HumanMessage(
        content=json.dumps({"stage": "monitoring", "tickers": tickers}),
        name=RISK_WATCHTOWER_ID,
    )
    return {
        "messages": [message],
        "data": {"risk_pipeline": pipeline, "risk_watchtower_baselines": baselines},
    }
