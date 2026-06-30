"""Structured interactive artifacts (JSON payloads for the React floor)."""

from __future__ import annotations

import re
from typing import Any

from src.utils.data_feed_keys import DATA_FEED_KEYS

INTERACTIVE_KINDS = frozenset(
    {
        "supply_chain_graph",
        "price_target_fan",
        "committee_dispersion",
        "risk_inventory_heatmap",
        "scenario_tornado",
        "moat_radar",
        "opportunity_frontier",
        "ripple_cascade",
        "dossier_board",
        "dcf_sensitivity",
        "valuation_football_field",
        "reverse_dcf",
        "graham_gauge",
        "taleb_risk_profile",
        "taleb_convexity",
        "damodaran_story_bridge",
        "damodaran_risk_premium",
        "sentiment_price_overlay",
        "growth_acceleration",
        "burry_contrarian",
        "dalio_regime",
        "insider_timeline",
        "insider_cluster_card",
    }
)

_NAMED_INVESTOR_KEYS: frozenset[str] | None = None


def _analyst_config() -> dict[str, Any]:
    from src.utils.analysts import ANALYST_CONFIG

    return ANALYST_CONFIG


def _named_investor_keys() -> frozenset[str]:
    global _NAMED_INVESTOR_KEYS
    if _NAMED_INVESTOR_KEYS is None:
        cfg = _analyst_config()
        _NAMED_INVESTOR_KEYS = frozenset(
            k
            for k, c in cfg.items()
            if c.get("type") == "analyst" and k not in DATA_FEED_KEYS
        )
    return _NAMED_INVESTOR_KEYS


def _artifact(
    *,
    artifact_id: str,
    kind: str,
    title: str,
    caption: str,
    data: dict[str, Any],
    graph: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": artifact_id,
        "kind": kind,
        "title": title,
        "caption": caption,
        "data": data,
    }
    if graph is not None:
        out["graph"] = graph
    return out


def strip_agent_suffix(agent_id: str) -> str:
    parts = agent_id.split("_")
    if len(parts) >= 2 and len(parts[-1]) == 6 and re.match(r"^[a-z0-9]+$", parts[-1]):
        return "_".join(parts[:-1])
    return agent_id


def _display_name(base_key: str) -> str:
    return _analyst_config().get(base_key, {}).get("display_name", base_key.replace("_", " ").title())


def build_risk_inventory_heatmap(ticker: str, inventory: list[dict[str, Any]]) -> dict[str, Any]:
    categories = [
        "geopolitical",
        "macro",
        "supply_chain",
        "competition",
        "technology",
        "regulatory",
        "financial",
        "demand",
    ]
    cells: list[dict[str, Any]] = []
    by_cat: dict[str, list[dict[str, Any]]] = {c: [] for c in categories}
    for item in inventory:
        cat = str(item.get("category") or "macro").lower()
        if cat not in by_cat:
            by_cat[cat] = []
        by_cat[cat].append(item)

    tag_severity = {
        "liquidity": 8,
        "leverage": 7,
        "regulation": 7,
        "supply": 6,
        "demand": 6,
        "competition": 5,
    }
    for cat, items in by_cat.items():
        if not items:
            continue
        sev = 4.0
        for it in items:
            for tag in it.get("tags") or []:
                sev = max(sev, float(tag_severity.get(str(tag).lower(), 4)))
        sev = min(10.0, sev + min(3, len(items) * 0.35))
        cells.append(
            {
                "category": cat,
                "severity": round(sev, 1),
                "count": len(items),
                "risks": [str(i.get("title", ""))[:80] for i in items[:4]],
            }
        )

    return _artifact(
        artifact_id="risk_inventory_heatmap",
        kind="risk_inventory_heatmap",
        title=f"{ticker} risk inventory heatmap",
        caption="Forge-stage risks by category and estimated severity.",
        data={"ticker": ticker, "categories": categories, "cells": cells},
    )


def build_scenario_tornado(ticker: str, scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    drivers: list[dict[str, Any]] = []
    for sc in scenarios[:8]:
        impacts = sc.get("impacts") or {}
        downside = impacts.get("revenue_pct") or impacts.get("eps_pct") or impacts.get("valuation_pct")
        upside = impacts.get("upside_pct") or impacts.get("recovery_pct")
        try:
            down_f = float(downside) if downside is not None else -8.0
        except (TypeError, ValueError):
            down_f = -8.0
        try:
            up_f = float(upside) if upside is not None else abs(down_f) * 0.45
        except (TypeError, ValueError):
            up_f = abs(down_f) * 0.45
        drivers.append(
            {
                "label": str(sc.get("title") or sc.get("risk_id") or "Scenario")[:64],
                "downside_pct": round(down_f, 1),
                "upside_pct": round(up_f, 1),
                "probability_pct": float(sc.get("probability_pct") or 20),
            }
        )
    drivers.sort(key=lambda d: abs(d["downside_pct"]), reverse=True)

    return _artifact(
        artifact_id="scenario_tornado",
        kind="scenario_tornado",
        title=f"{ticker} scenario tornado",
        caption="Scenario Lab — downside vs upside drivers ranked by impact.",
        data={"ticker": ticker, "drivers": drivers},
    )


def build_moat_radar(ticker: str, analysis: dict[str, Any]) -> dict[str, Any]:
    switching = float((analysis.get("bastion_switching_costs") or {}).get("score") or 5)
    network = float((analysis.get("bastion_network_effects") or {}).get("score") or 5)
    durability = float((analysis.get("bastion_durability") or {}).get("score") or 5)
    composite = float(analysis.get("bastion_composite_moat") or analysis.get("score") or 5)
    brand = min(10.0, (switching + network) / 2 + 0.5)
    cost = min(10.0, durability * 0.85 + switching * 0.15)
    regulation = max(3.0, min(8.5, 11 - network * 0.35))

    axes = ["switching", "network", "brand", "cost", "regulation"]
    values = [round(switching, 1), round(network, 1), round(brand, 1), round(cost, 1), round(regulation, 1)]

    return _artifact(
        artifact_id="moat_radar",
        kind="moat_radar",
        title=f"{ticker} fortress index",
        caption="Bastion moat radar — structural advantage by dimension (0–10).",
        data={"ticker": ticker, "axes": axes, "values": values, "composite": round(composite, 1)},
    )


def build_opportunity_frontier(
    ticker: str,
    analysis: dict[str, Any],
    *,
    current_price: float | None = None,
) -> dict[str, Any]:
    rf = analysis.get("opportunity_risk_free_proxy")
    implied = analysis.get("opportunity_implied_earnings_yield")
    spread = analysis.get("opportunity_spread_vs_cash")
    rev_g = analysis.get("opportunity_revenue_growth")
    roe = analysis.get("opportunity_roe")

    def pct_yield(y: float | None) -> float:
        if y is None:
            return 5.0
        return round(y * 100 if abs(y) <= 1 else y, 2)

    focal_return = pct_yield(implied if implied is not None else 0.08)
    cash_return = pct_yield(float(rf) / 100.0 if rf and rf > 1 else rf)
    index_return = 10.0
    sector_return = round(
        (focal_return + (float(rev_g or 0) * 100 if rev_g and abs(rev_g) <= 1 else float(rev_g or 0) * 0.5)),
        2,
    )
    alt_return = round(focal_return + (float(spread or 0) * 100 if spread else 2), 2)

    points = [
        {"id": "focal", "label": ticker.upper(), "x": focal_return, "y": 6.5, "highlight": True},
        {"id": "cash", "label": "Cash / T-bills", "x": cash_return, "y": 1.5, "highlight": False},
        {"id": "spy", "label": "Index beta", "x": index_return, "y": 4.0, "highlight": False},
        {"id": "sector", "label": "Sector peers", "x": sector_return, "y": 5.0, "highlight": False},
        {"id": "alt", "label": "Higher-conviction alt", "x": alt_return, "y": 7.5, "highlight": False},
    ]
    if roe is not None:
        points[0]["y"] = min(9.5, max(3.0, float(roe) * 25 if abs(roe) <= 1 else float(roe) * 0.25))

    return _artifact(
        artifact_id="opportunity_frontier",
        kind="opportunity_frontier",
        title=f"{ticker} capital frontier",
        caption="Opportunity Cost — expected return vs risk proxy for focal name vs alternatives.",
        data={
            "ticker": ticker,
            "reference_price": current_price,
            "points": points,
            "x_label": "Expected return (%)",
            "y_label": "Quality / risk proxy",
        },
    )


def build_ripple_cascade(ticker: str, analysis: dict[str, Any]) -> dict[str, Any]:
    seed = analysis.get("ripple_chain_seed") or []
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    focal_id = f"step_0_{ticker.lower()}"
    nodes.append(
        {
            "id": focal_id,
            "label": ticker.upper(),
            "step": 0,
            "role": "focal",
            "effect": f"Consensus trade on {ticker.upper()}",
        }
    )
    prev_id = focal_id
    for i, step in enumerate(seed[:6], start=1):
        nid = f"step_{i}"
        label = str(step.get("beneficiary") or step.get("effect") or f"Ripple {i}")[:48]
        effect = str(step.get("effect") or "")[:120]
        role = "focal" if i == 0 else "ripple" if i < len(seed) else "beneficiary"
        nodes.append({"id": nid, "label": label, "step": i, "role": role, "effect": effect})
        edges.append({"source": prev_id, "target": nid, "relationship": "then"})
        prev_id = nid

    themes = analysis.get("ripple_theme_hits") or {}
    if themes:
        nodes.append(
            {
                "id": "themes",
                "label": "Theme concentration",
                "step": 99,
                "role": "meta",
                "effect": ", ".join(f"{k}({v})" for k, v in list(themes.items())[:4]),
            }
        )

    graph = {"focal_ticker": ticker.upper(), "nodes": nodes, "edges": edges}
    return _artifact(
        artifact_id="ripple_cascade",
        kind="ripple_cascade",
        title=f"{ticker} ripple cascade",
        caption="Ripple Desk — second- and third-order paths from the obvious trade.",
        data={"ticker": ticker},
        graph=graph,
    )


def build_insider_timeline(ticker: str, analysis: dict[str, Any]) -> dict[str, Any]:
    """Weekly net-share bars from largest buys metadata (desk artifact)."""
    largest = analysis.get("largest_buys") or []
    weeks: dict[str, float] = {}
    for row in largest:
        day = str(row.get("date") or "")[:10]
        if not day:
            continue
        week_key = day[:7]
        weeks[week_key] = weeks.get(week_key, 0.0) + float(row.get("shares") or 0)

    bars = [{"week": k, "net_shares": round(v, 2)} for k, v in sorted(weeks.items())]
    return _artifact(
        artifact_id="insider_timeline",
        kind="insider_timeline",
        title=f"{ticker} Form 4 timeline",
        caption="Insider Activity Desk — net shares by month from notable filings.",
        data={
            "ticker": ticker,
            "bars": bars,
            "cluster_score": analysis.get("cluster_score"),
            "net_shares_90d": analysis.get("net_shares_90d"),
        },
    )


def build_insider_cluster_card(ticker: str, analysis: dict[str, Any]) -> dict[str, Any]:
    """Table of largest insider buyers with title and value."""
    buyers = analysis.get("largest_buys") or []
    cluster_score = float(analysis.get("cluster_score") or 0)
    unique_buyers_30d = int(analysis.get("unique_buyers_30d") or 0)
    return _artifact(
        artifact_id="insider_cluster_card",
        kind="insider_cluster_card",
        title=f"{ticker} insider cluster",
        caption="Insider Activity Desk — coordinated buying signal from public Form 4 data.",
        data={
            "ticker": ticker,
            "cluster_score": cluster_score,
            "cluster_alert": cluster_score >= 7 and unique_buyers_30d >= 3,
            "unique_buyers_30d": unique_buyers_30d,
            "buyers": buyers,
            "disclaimer": (
                "Public SEC filings and licensed feeds only. "
                "Filing activity does not prove intent or future performance."
            ),
        },
    )


def _collect_investor_buckets(
    analyst_signals: dict[str, Any],
    ticker: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for agent_id, by_ticker in analyst_signals.items():
        base = strip_agent_suffix(agent_id)
        if base not in _named_investor_keys() and base not in {
            "supply_chain_cartographer",
            "opportunity_cost",
            "ripple_desk",
            "bastion_moat",
            "unknown_unknowns",
            "david_einhorn",
        }:
            continue
        bucket = (by_ticker or {}).get(ticker) if isinstance(by_ticker, dict) else None
        if not bucket or not isinstance(bucket, dict):
            continue
        if bucket.get("signal") is None:
            continue
        rows.append(
            {
                "agent_id": agent_id,
                "agent_key": base,
                "agent_name": _display_name(base),
                "signal": str(bucket.get("signal") or "neutral").lower(),
                "confidence": float(bucket.get("confidence") or 0),
                "price_target": bucket.get("price_target"),
                "time_horizon_months": bucket.get("time_horizon_months"),
                "upside_pct": bucket.get("upside_pct"),
            }
        )
    return rows


def build_price_target_fan(
    ticker: str,
    analyst_signals: dict[str, Any],
    *,
    reference_price: float | None = None,
) -> dict[str, Any] | None:
    targets: list[dict[str, Any]] = []
    for row in _collect_investor_buckets(analyst_signals, ticker):
        pt = row.get("price_target")
        if pt is None:
            continue
        try:
            price = float(pt)
        except (TypeError, ValueError):
            continue
        targets.append(
            {
                "agent": row["agent_name"],
                "agent_key": row["agent_key"],
                "price": price,
                "horizon_months": row.get("time_horizon_months"),
                "signal": row["signal"],
                "confidence": row["confidence"],
                "upside_pct": row.get("upside_pct"),
            }
        )
    if not targets:
        return None
    targets.sort(key=lambda t: t["price"])

    ref = reference_price
    if ref is None:
        prices = state_prices_from_signals(analyst_signals, ticker)
        ref = prices[0] if prices else None

    return _artifact(
        artifact_id="price_target_fan",
        kind="price_target_fan",
        title=f"{ticker} price target fan",
        caption="Legend floor — published targets and horizons vs reference price.",
        data={
            "ticker": ticker,
            "reference_price": ref,
            "targets": targets,
        },
    )


def state_prices_from_signals(analyst_signals: dict[str, Any], ticker: str) -> list[float]:
    out: list[float] = []
    for by_ticker in analyst_signals.values():
        if not isinstance(by_ticker, dict):
            continue
        bucket = by_ticker.get(ticker)
        if isinstance(bucket, dict):
            rp = bucket.get("reference_price")
            if rp is not None:
                try:
                    out.append(float(rp))
                except (TypeError, ValueError):
                    pass
    return out


def build_committee_dispersion(
    ticker: str,
    analyst_signals: dict[str, Any],
) -> dict[str, Any] | None:
    opinions = _collect_investor_buckets(analyst_signals, ticker)
    if not opinions:
        return None
    bullish = sum(1 for o in opinions if o["signal"] == "bullish")
    bearish = sum(1 for o in opinions if o["signal"] == "bearish")
    neutral = len(opinions) - bullish - bearish
    confidences = [o["confidence"] for o in opinions]
    spread = max(confidences) - min(confidences) if confidences else 0

    return _artifact(
        artifact_id="committee_dispersion",
        kind="committee_dispersion",
        title=f"{ticker} committee dispersion",
        caption=f"Bull/bear/neutral split across {len(opinions)} desks; confidence spread {spread:.0f} pts.",
        data={
            "ticker": ticker,
            "bullish": bullish,
            "bearish": bearish,
            "neutral": neutral,
            "confidence_spread": round(spread, 1),
            "confidence_avg": round(sum(confidences) / len(confidences), 1) if confidences else 0,
            "opinions": [
                {
                    "agent": o["agent_name"],
                    "signal": o["signal"],
                    "confidence": o["confidence"],
                }
                for o in sorted(opinions, key=lambda x: -x["confidence"])
            ],
        },
    )


def build_dossier_board(ticker: str, dossier: dict[str, Any]) -> dict[str, Any] | None:
    facts = list(dossier.get("facts") or [])
    claims = list(dossier.get("claims") or [])
    disputes = list(dossier.get("disputes") or [])
    if not facts and not claims and not disputes:
        return None

    pins: list[dict[str, Any]] = []
    for claim in claims[:12]:
        supports = claim.get("supports") or []
        pins.append(
            {
                "claim_id": claim.get("id"),
                "fact_ids": supports[:4],
                "agent": claim.get("agent"),
                "signal": claim.get("signal"),
            }
        )

    return _artifact(
        artifact_id="dossier_board",
        kind="dossier_board",
        title=f"{ticker} evidence board",
        caption="Claims pinned to dossier facts and live disputes.",
        data={
            "ticker": ticker,
            "facts": facts[:24],
            "claims": claims[:16],
            "disputes": disputes[:8],
            "pins": pins,
        },
    )


def build_shift_artifacts(
    *,
    ticker: str,
    analyst_signals: dict[str, Any],
    dossier: dict[str, Any] | None,
    reference_price: float | None = None,
) -> list[dict[str, Any]]:
    """Committee-level artifacts after the investor floor completes."""
    out: list[dict[str, Any]] = []
    fan = build_price_target_fan(ticker, analyst_signals, reference_price=reference_price)
    if fan:
        out.append(fan)
    dispersion = build_committee_dispersion(ticker, analyst_signals)
    if dispersion:
        out.append(dispersion)
    if dossier:
        board = build_dossier_board(ticker, dossier)
        if board:
            out.append(board)
    return out


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _dcf_equity_value(
    *,
    fcf_history: list[float],
    wacc: float,
    revenue_growth: float,
    market_cap: float,
) -> float:
    from src.agents.valuation import calculate_enhanced_dcf_value

    return calculate_enhanced_dcf_value(
        fcf_history=fcf_history,
        growth_metrics={},
        wacc=wacc,
        market_cap=market_cap,
        revenue_growth=revenue_growth,
    )


def build_dcf_sensitivity(
    ticker: str,
    *,
    fcf_history: list[float],
    wacc: float,
    revenue_growth: float,
    market_cap: float,
    current_price: float | None = None,
) -> dict[str, Any] | None:
    if not fcf_history or market_cap <= 0:
        return None
    wacc_steps = sorted({max(0.06, wacc * f) for f in (0.88, 1.0, 1.12)})
    growth_steps = sorted({max(0.01, revenue_growth * f) for f in (0.65, 1.0, 1.35)})
    cells: list[dict[str, Any]] = []
    for w in wacc_steps:
        for g in growth_steps:
            val = _dcf_equity_value(
                fcf_history=fcf_history,
                wacc=w,
                revenue_growth=g,
                market_cap=market_cap,
            )
            gap = (val - market_cap) / market_cap if val > 0 else None
            cells.append(
                {
                    "wacc_pct": round(w * 100, 1),
                    "growth_pct": round(g * 100, 1),
                    "equity_value": round(val),
                    "gap_pct": round(gap * 100, 1) if gap is not None else None,
                }
            )
    return _artifact(
        artifact_id="dcf_sensitivity",
        kind="dcf_sensitivity",
        title=f"{ticker} DCF sensitivity",
        caption="Equity value across WACC × growth — warmer cells = richer vs market cap.",
        data={
            "ticker": ticker,
            "market_cap": market_cap,
            "current_price": current_price,
            "cells": cells,
            "wacc_steps": [round(w * 100, 1) for w in wacc_steps],
            "growth_steps": [round(g * 100, 1) for g in growth_steps],
        },
    )


def build_reverse_dcf(
    ticker: str,
    *,
    fcf_history: list[float],
    wacc: float,
    market_cap: float,
) -> dict[str, Any] | None:
    if not fcf_history or market_cap <= 0:
        return None
    lo, hi = -0.05, 0.35
    for _ in range(24):
        mid = (lo + hi) / 2
        val = _dcf_equity_value(
            fcf_history=fcf_history,
            wacc=wacc,
            revenue_growth=mid,
            market_cap=market_cap,
        )
        if val < market_cap:
            lo = mid
        else:
            hi = mid
    implied = (lo + hi) / 2
    return _artifact(
        artifact_id="reverse_dcf",
        kind="reverse_dcf",
        title=f"{ticker} reverse DCF",
        caption="Implied revenue-growth rate that reconciles DCF to current market cap.",
        data={
            "ticker": ticker,
            "implied_growth_pct": round(implied * 100, 2),
            "wacc_pct": round(wacc * 100, 1),
            "market_cap": market_cap,
            "base_fcf": fcf_history[0] if fcf_history else None,
        },
    )


def build_valuation_football_field(
    ticker: str,
    *,
    method_values: dict[str, float],
    market_cap: float,
    current_price: float | None = None,
) -> dict[str, Any] | None:
    bars: list[dict[str, Any]] = []
    labels = {
        "dcf": "DCF",
        "owner_earnings": "Owner earnings",
        "ev_ebitda": "EV/EBITDA",
        "residual_income": "Residual income",
    }
    for key, label in labels.items():
        val = _safe_float(method_values.get(key))
        if val > 0:
            bars.append(
                {
                    "id": key,
                    "label": label,
                    "value": round(val),
                    "gap_pct": round((val - market_cap) / market_cap * 100, 1),
                }
            )
    if not bars:
        return None
    bars.sort(key=lambda b: b["value"])
    return _artifact(
        artifact_id="valuation_football_field",
        kind="valuation_football_field",
        title=f"{ticker} valuation range",
        caption="Football field — methodology fair values vs market cap.",
        data={
            "ticker": ticker,
            "market_cap": market_cap,
            "current_price": current_price,
            "bars": bars,
        },
    )


def build_valuation_analyst_artifacts(
    ticker: str,
    *,
    fcf_history: list[float],
    wacc: float,
    revenue_growth: float,
    market_cap: float,
    method_values: dict[str, float],
    current_price: float | None = None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for builder in (
        lambda: build_dcf_sensitivity(
            ticker,
            fcf_history=fcf_history,
            wacc=wacc,
            revenue_growth=revenue_growth or 0.05,
            market_cap=market_cap,
            current_price=current_price,
        ),
        lambda: build_reverse_dcf(
            ticker,
            fcf_history=fcf_history,
            wacc=wacc,
            market_cap=market_cap,
        ),
        lambda: build_valuation_football_field(
            ticker,
            method_values=method_values,
            market_cap=market_cap,
            current_price=current_price,
        ),
    ):
        art = builder()
        if art:
            out.append(art)
    return out


def build_graham_gauge(ticker: str, line_items: list[Any], market_cap: float) -> dict[str, Any] | None:
    if not line_items or not market_cap:
        return None
    latest = line_items[0]
    current_assets = _safe_float(getattr(latest, "current_assets", None))
    total_liabilities = _safe_float(getattr(latest, "total_liabilities", None))
    book_value_ps = _safe_float(getattr(latest, "book_value_per_share", None))
    eps = _safe_float(getattr(latest, "earnings_per_share", None))
    shares = _safe_float(getattr(latest, "outstanding_shares", None))
    if shares <= 0:
        return None
    price = market_cap / shares
    ncav = current_assets - total_liabilities
    ncav_ps = ncav / shares if shares else 0
    graham_number = (22.5 * eps * book_value_ps) ** 0.5 if eps > 0 and book_value_ps > 0 else None
    ncav_discount = (ncav_ps - price) / price if price > 0 else None
    graham_mos = (graham_number - price) / price if graham_number and price > 0 else None
    return _artifact(
        artifact_id="graham_gauge",
        kind="graham_gauge",
        title=f"{ticker} Graham screen",
        caption="Net-net working capital vs price and Graham number margin of safety.",
        data={
            "ticker": ticker,
            "price": round(price, 2),
            "ncav_per_share": round(ncav_ps, 2),
            "graham_number": round(graham_number, 2) if graham_number else None,
            "ncav_discount_pct": round(ncav_discount * 100, 1) if ncav_discount is not None else None,
            "graham_margin_pct": round(graham_mos * 100, 1) if graham_mos is not None else None,
            "net_net_hit": ncav > market_cap,
        },
    )


def build_taleb_risk_profile(ticker: str, analysis: dict[str, Any]) -> dict[str, Any] | None:
    axes = [
        ("Tail risk", analysis.get("tail_risk_analysis", {})),
        ("Antifragility", analysis.get("antifragility_analysis", {})),
        ("Convexity", analysis.get("convexity_analysis", {})),
        ("Fragility", analysis.get("fragility_analysis", {})),
        ("Vol regime", analysis.get("volatility_regime_analysis", {})),
        ("Skin in game", analysis.get("skin_in_game_analysis", {})),
    ]
    points: list[dict[str, Any]] = []
    for label, block in axes:
        if not isinstance(block, dict):
            continue
        score = _safe_float(block.get("score"))
        max_score = _safe_float(block.get("max_score"), 1) or 1
        points.append({"label": label, "score": round(score / max_score * 10, 1)})
    if not points:
        return None
    return _artifact(
        artifact_id="taleb_risk_profile",
        kind="taleb_risk_profile",
        title=f"{ticker} tail & fragility",
        caption="Normalized sub-scores — convexity up, fragility down is the ideal barbell.",
        data={"ticker": ticker, "points": points},
    )


def build_taleb_convexity(ticker: str, analysis: dict[str, Any]) -> dict[str, Any] | None:
    tail = analysis.get("tail_risk_analysis") if isinstance(analysis.get("tail_risk_analysis"), dict) else {}
    convex = analysis.get("convexity_analysis") if isinstance(analysis.get("convexity_analysis"), dict) else {}
    downside = min(8.0, max(2.0, 10 - _safe_float(tail.get("score"), 4)))
    upside = min(12.0, max(4.0, _safe_float(convex.get("score"), 4) + 4))
    return _artifact(
        artifact_id="taleb_convexity",
        kind="taleb_convexity",
        title=f"{ticker} convexity payoff",
        caption="Asymmetric exposure sketch — limited downside, open-ended upside.",
        data={
            "ticker": ticker,
            "downside_pct": -downside,
            "upside_pct": upside,
            "base_pct": 0,
        },
    )


def build_damodaran_story_bridge(ticker: str, analysis: dict[str, Any]) -> dict[str, Any] | None:
    growth = analysis.get("growth_analysis") if isinstance(analysis.get("growth_analysis"), dict) else {}
    risk = analysis.get("risk_analysis") if isinstance(analysis.get("risk_analysis"), dict) else {}
    intrinsic = analysis.get("intrinsic_val_analysis") if isinstance(analysis.get("intrinsic_val_analysis"), dict) else {}
    assumptions = intrinsic.get("assumptions") if isinstance(intrinsic.get("assumptions"), dict) else {}
    nodes = [
        {"id": "story", "label": "Story", "value": "Narrative & moat"},
        {
            "id": "growth",
            "label": "Growth",
            "value": str(growth.get("details", "—"))[:60],
        },
        {
            "id": "risk",
            "label": "Risk / β",
            "value": f"CoE {(_safe_float(risk.get('cost_of_equity')) * 100):.1f}%"
            if risk.get("cost_of_equity")
            else str(risk.get("details", "—"))[:40],
        },
        {
            "id": "cash",
            "label": "Cash flows",
            "value": f"FCFF {_safe_float(assumptions.get('base_fcff')):,.0f}"
            if assumptions.get("base_fcff")
            else "FCFF projection",
        },
        {
            "id": "value",
            "label": "Value",
            "value": f"${_safe_float(intrinsic.get('intrinsic_per_share')):.2f}/sh"
            if intrinsic.get("intrinsic_per_share")
            else "Intrinsic value",
        },
    ]
    return _artifact(
        artifact_id="damodaran_story_bridge",
        kind="damodaran_story_bridge",
        title=f"{ticker} story → numbers",
        caption="Damodaran bridge from narrative drivers to discounted cash-flow value.",
        data={"ticker": ticker, "nodes": nodes},
    )


def build_damodaran_risk_premium(ticker: str, analysis: dict[str, Any]) -> dict[str, Any] | None:
    risk = analysis.get("risk_analysis") if isinstance(analysis.get("risk_analysis"), dict) else {}
    beta = _safe_float(risk.get("beta"), 1.0)
    risk_free = 0.04
    historical_erp = 0.05
    cost_of_equity = _safe_float(risk.get("cost_of_equity"), risk_free + beta * historical_erp)
    implied_erp = (cost_of_equity - risk_free) / beta if beta > 0 else historical_erp
    return _artifact(
        artifact_id="damodaran_risk_premium",
        kind="damodaran_risk_premium",
        title=f"{ticker} risk premium",
        caption="Implied equity risk premium vs Damodaran long-run average.",
        data={
            "ticker": ticker,
            "beta": round(beta, 2),
            "risk_free_pct": round(risk_free * 100, 1),
            "historical_erp_pct": round(historical_erp * 100, 1),
            "implied_erp_pct": round(implied_erp * 100, 1),
            "cost_of_equity_pct": round(cost_of_equity * 100, 1),
        },
    )


def build_damodaran_artifacts(ticker: str, analysis: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for fn in (build_damodaran_story_bridge, build_damodaran_risk_premium):
        art = fn(ticker, analysis)
        if art:
            out.append(art)
    return out


def build_taleb_artifacts(ticker: str, analysis: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for fn in (build_taleb_risk_profile, build_taleb_convexity):
        art = fn(ticker, analysis)
        if art:
            out.append(art)
    return out


def _sentiment_score(label: str | None) -> float:
    s = (label or "neutral").lower()
    if s in ("positive", "bullish"):
        return 1.0
    if s in ("negative", "bearish"):
        return -1.0
    return 0.0


def build_sentiment_price_overlay(
    ticker: str,
    *,
    news: list[Any],
    prices: list[Any],
) -> dict[str, Any] | None:
    price_points: list[dict[str, Any]] = []
    for p in prices[-90:]:
        d = getattr(p, "time", None) or getattr(p, "date", None)
        c = getattr(p, "close", None)
        if d and c is not None:
            price_points.append({"date": str(d)[:10], "close": round(_safe_float(c), 2)})
    if not price_points:
        return None

    by_week: dict[str, list[float]] = {}
    for n in news:
        date = str(getattr(n, "date", ""))[:10]
        if not date:
            continue
        week = date[:7]
        by_week.setdefault(week, []).append(_sentiment_score(getattr(n, "sentiment", None)))

    sentiment_points = [
        {
            "period": w,
            "score": round(sum(scores) / len(scores), 2),
            "volume": len(scores),
        }
        for w, scores in sorted(by_week.items())
    ][-12:]

    return _artifact(
        artifact_id="sentiment_price_overlay",
        kind="sentiment_price_overlay",
        title=f"{ticker} sentiment × price",
        caption="Monthly headline sentiment score overlaid on recent price path.",
        data={
            "ticker": ticker,
            "prices": price_points,
            "sentiment": sentiment_points,
        },
    )


def build_growth_acceleration(ticker: str, metrics: list[Any]) -> dict[str, Any] | None:
    revs = [
        _safe_float(getattr(m, "revenue", None))
        for m in reversed(metrics)
        if getattr(m, "revenue", None)
    ]
    if len(revs) < 3:
        return None
    growth: list[float | None] = [None]
    accel: list[float | None] = [None, None]
    for i in range(1, len(revs)):
        if revs[i - 1] > 0:
            growth.append((revs[i] / revs[i - 1] - 1) * 100)
        else:
            growth.append(None)
    for i in range(2, len(growth)):
        if growth[i] is not None and growth[i - 1] is not None:
            accel.append(growth[i] - growth[i - 1])
        else:
            accel.append(None)
    periods = [f"T-{len(revs) - 1 - i}" for i in range(len(revs))]
    return _artifact(
        artifact_id="growth_acceleration",
        kind="growth_acceleration",
        title=f"{ticker} revenue acceleration",
        caption="YoY revenue growth and its second derivative (acceleration).",
        data={
            "ticker": ticker,
            "periods": periods,
            "revenue_growth_pct": [round(g, 1) if g is not None else None for g in growth],
            "acceleration_pct": [round(a, 1) if a is not None else None for a in accel],
        },
    )


def build_burry_contrarian(
    ticker: str,
    *,
    prices: list[Any],
    value_score: float,
    max_value_score: float,
    contrarian_score: float,
    max_contrarian_score: float,
) -> dict[str, Any] | None:
    closes = [_safe_float(getattr(p, "close", None)) for p in prices if getattr(p, "close", None)]
    if len(closes) < 10:
        return None
    start, end = closes[0], closes[-1]
    price_chg = (end - start) / start * 100 if start else 0
    fund_score = (value_score / max_value_score * 100) if max_value_score else 50
    contra = (contrarian_score / max_contrarian_score * 100) if max_contrarian_score else 50
    divergence = fund_score - price_chg
    return _artifact(
        artifact_id="burry_contrarian",
        kind="burry_contrarian",
        title=f"{ticker} contrarian divergence",
        caption="Fundamental value score vs price change — gap flags hated names.",
        data={
            "ticker": ticker,
            "price_change_pct": round(price_chg, 1),
            "value_score_pct": round(fund_score, 1),
            "contrarian_score_pct": round(contra, 1),
            "divergence": round(divergence, 1),
        },
    )


def build_dalio_regime(ticker: str, analysis: dict[str, Any], macro: dict[str, Any] | None = None) -> dict[str, Any] | None:
    macro = macro or {}
    balance = analysis.get("dalio_macro_balance") if isinstance(analysis.get("dalio_macro_balance"), dict) else {}
    vol = analysis.get("dalio_all_weather_volatility") if isinstance(analysis.get("dalio_all_weather_volatility"), dict) else {}
    growth = _safe_float(macro.get("gdp_growth") or macro.get("real_growth"), 0.02) * 100
    inflation = _safe_float(macro.get("inflation") or macro.get("cpi_yoy"), 0.025) * 100
    resilience = _safe_float(balance.get("score"), 5)
    vol_score = _safe_float(vol.get("score"), 5)
    quadrant = (
        "reflation"
        if growth > 2 and inflation > 2.5
        else "goldilocks"
        if growth > 2 and inflation <= 2.5
        else "stagflation"
        if growth <= 2 and inflation > 2.5
        else "deflation"
    )
    return _artifact(
        artifact_id="dalio_regime",
        kind="dalio_regime",
        title=f"{ticker} macro regime",
        caption="Growth × inflation quadrant with company all-weather resilience.",
        data={
            "ticker": ticker,
            "growth_pct": round(growth, 1),
            "inflation_pct": round(inflation, 1),
            "quadrant": quadrant,
            "resilience": round(resilience, 1),
            "volatility_fit": round(vol_score, 1),
        },
    )
