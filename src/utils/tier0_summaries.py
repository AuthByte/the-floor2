"""Human-readable Tier-0 summaries so Tier-1 agents digest structured desk output."""

from __future__ import annotations

from typing import Any

from src.utils.data_feed_keys import DATA_FEED_KEYS


def _pct(val: Any) -> str:
    try:
        f = float(val)
        if abs(f) <= 1.5:
            return f"{f:.1%}"
        return f"{f:.1f}%"
    except (TypeError, ValueError):
        return str(val)


def _block_summary(block: Any) -> str | None:
    if not isinstance(block, dict):
        return None
    parts: list[str] = []
    sig = block.get("signal")
    if sig:
        parts.append(str(sig))
    details = block.get("details") or block.get("detail")
    if details:
        parts.append(str(details)[:200])
    score = block.get("score")
    if score is not None and not details:
        parts.append(f"score {score}")
    metrics = block.get("metrics")
    if isinstance(metrics, dict) and metrics:
        metric_bits = []
        for k, v in list(metrics.items())[:6]:
            if v is not None:
                metric_bits.append(f"{k}={v}")
        if metric_bits:
            parts.append("; ".join(metric_bits))
    return " — ".join(parts) if parts else None


def format_tier0_summary(agent_key: str, payload: dict[str, Any]) -> str:
    """One-paragraph digest of a Tier-0 desk payload for briefings and dossiers."""
    if not isinstance(payload, dict):
        return "(no data)"

    existing = payload.get("thesis_summary")
    if isinstance(existing, str) and existing.strip() and not existing.strip().startswith("{"):
        return existing.strip()[:900]

    signal = payload.get("signal", "neutral")
    conf = payload.get("confidence")
    conf_s = f" ({conf}% confidence)" if conf is not None else ""
    reasoning = payload.get("reasoning")
    parts: list[str] = [f"Signal: {signal}{conf_s}."]

    if agent_key == "fundamentals_analyst" and isinstance(reasoning, dict):
        sec = reasoning.get("sec_earnings")
        if isinstance(sec, dict):
            bits = []
            if sec.get("headline"):
                bits.append(str(sec["headline"])[:220])
            if sec.get("eps_yoy_pct") is not None:
                bits.append(f"EPS YoY {_pct(sec['eps_yoy_pct'])}")
            if sec.get("revenue_yoy_pct") is not None:
                bits.append(f"rev YoY {_pct(sec['revenue_yoy_pct'])}")
            if sec.get("management_tone"):
                bits.append(f"tone {sec['management_tone']}")
            if bits:
                parts.append("SEC: " + "; ".join(bits))
        for pillar in ("profitability_signal", "growth_signal", "financial_health_signal", "valuation_signal"):
            line = _block_summary(reasoning.get(pillar))
            if line:
                parts.append(f"{pillar.replace('_signal', '')}: {line}")

    elif agent_key == "technical_analyst" and isinstance(reasoning, dict):
        for name in (
            "trend_following",
            "mean_reversion",
            "momentum",
            "volatility",
            "statistical_arbitrage",
        ):
            line = _block_summary(reasoning.get(name))
            if line:
                parts.append(f"{name.replace('_', ' ')}: {line}")

    elif agent_key in ("sentiment_analyst", "news_sentiment_analyst") and isinstance(reasoning, dict):
        for name in ("insider_trading", "news_sentiment", "combined_analysis", "article_breakdown"):
            line = _block_summary(reasoning.get(name))
            if line:
                parts.append(f"{name.replace('_', ' ')}: {line}")
        sources = payload.get("data_sources")
        if isinstance(sources, dict) and sources.get("news"):
            parts.append(f"news via {sources['news']}")

    elif agent_key == "growth_analyst" and isinstance(reasoning, dict):
        for name in (
            "historical_growth",
            "growth_valuation",
            "margin_expansion",
            "insider_conviction",
            "financial_health",
            "final_analysis",
        ):
            line = _block_summary(reasoning.get(name))
            if line:
                parts.append(f"{name.replace('_', ' ')}: {line}")

    elif agent_key == "valuation_analyst" and isinstance(reasoning, dict):
        for key, block in reasoning.items():
            if key.endswith("_analysis"):
                line = _block_summary(block)
                if line:
                    parts.append(f"{key.replace('_analysis', '')}: {line}")
        dcf = reasoning.get("dcf_scenario_analysis")
        if isinstance(dcf, dict):
            parts.append(
                "DCF scenarios: "
                + ", ".join(f"{k}={v}" for k, v in list(dcf.items())[:5])
            )

    elif agent_key.startswith("quant_"):
        meta = payload.get("metadata") or {}
        if meta.get("price_source"):
            parts.append(f"prices via {meta['price_source']}")
        if meta.get("earnings_source"):
            parts.append(f"earnings via {meta['earnings_source']}")
        if isinstance(reasoning, str) and reasoning.strip():
            parts.append(reasoning.strip()[:400])
    elif isinstance(reasoning, str) and reasoning.strip():
        parts.append(reasoning.strip()[:500])
    elif isinstance(reasoning, dict):
        for key, block in list(reasoning.items())[:8]:
            if key == "sec_earnings":
                continue
            line = _block_summary(block)
            if line:
                parts.append(f"{key}: {line}")

    digest = payload.get("data_digest")
    if isinstance(digest, str) and digest.strip():
        parts.append(digest.strip()[:300])

    text = " ".join(parts).strip()
    return text[:900] if text else f"Signal: {signal}{conf_s} (structured desk output captured)."


def extract_data_digest(agent_key: str, payload: dict[str, Any]) -> str | None:
    """Short inventory of what data the desk actually consumed."""
    sources = payload.get("data_sources")
    if not isinstance(sources, dict) or not sources:
        return None
    bits = [f"{k}={v}" for k, v in sources.items() if v]
    if not bits:
        return None
    return "Data sources: " + ", ".join(bits)


from src.utils.agent_tiers import QUANT_KEYS


def enrich_tier0_signals(analyst_signals: dict[str, Any]) -> None:
    """Attach thesis_summary + data_digest on every Tier-0 payload (in-place)."""
    from src.utils.tier0_briefing import extract_base_agent_key

    for agent_id, per_ticker in analyst_signals.items():
        base = extract_base_agent_key(agent_id)
        if base not in DATA_FEED_KEYS or not isinstance(per_ticker, dict):
            continue
        for ticker, payload in per_ticker.items():
            if not isinstance(payload, dict):
                continue
            payload["thesis_summary"] = format_tier0_summary(base, payload)
            digest = extract_data_digest(base, payload)
            if digest:
                payload["data_digest"] = digest


def enrich_quant_signals(analyst_signals: dict[str, Any]) -> None:
    from src.utils.tier0_briefing import extract_base_agent_key

    for agent_id, per_ticker in analyst_signals.items():
        base = extract_base_agent_key(agent_id)
        if base not in QUANT_KEYS or not isinstance(per_ticker, dict):
            continue
        for payload in per_ticker.values():
            if not isinstance(payload, dict):
                continue
            if payload.get("confidence") is None and payload.get("conviction") is not None:
                try:
                    payload["confidence"] = round(min(abs(float(payload["conviction"])), 1.0) * 100)
                except (TypeError, ValueError):
                    pass
            payload["thesis_summary"] = format_tier0_summary(base, payload)


def macro_briefing_appendix(macro: dict[str, Any] | None) -> str:
    if not macro or not macro.get("available"):
        return ""
    summary = macro.get("summary") or {}
    headline = summary.get("headline") if isinstance(summary, dict) else str(summary)
    series = macro.get("series") or {}
    tags: list[str] = []
    for name, point in list(series.items())[:8]:
        if not isinstance(point, dict):
            continue
        latest = point.get("latest")
        chg = point.get("change_pct") or point.get("yoy_pct")
        if latest is not None:
            tag = f"{name}={latest}"
            if chg is not None:
                tag += f" ({_pct(chg)} chg)"
            tags.append(tag)
    lines = ["**Macro backdrop (FRED + BLS)**"]
    if headline:
        lines.append(str(headline)[:400])
    if tags:
        lines.append("Key series: " + "; ".join(tags))
    src = macro.get("source")
    if src and src != "none":
        lines.append(f"Sources: {src}")
    return "\n".join(lines)
