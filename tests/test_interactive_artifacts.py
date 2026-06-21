"""Tests for structured interactive artifact builders."""

from src.utils.interactive_artifacts import (
    build_committee_dispersion,
    build_dossier_board,
    build_graham_gauge,
    build_growth_acceleration,
    build_moat_radar,
    build_opportunity_frontier,
    build_price_target_fan,
    build_risk_inventory_heatmap,
    build_ripple_cascade,
    build_scenario_tornado,
    build_shift_artifacts,
    build_taleb_risk_profile,
    build_valuation_football_field,
)


def test_risk_inventory_heatmap():
    art = build_risk_inventory_heatmap(
        "CELH",
        [
            {"title": "Supply squeeze", "category": "supply_chain", "tags": ["supply"]},
            {"title": "Rate shock", "category": "macro", "tags": ["liquidity"]},
        ],
    )
    assert art["kind"] == "risk_inventory_heatmap"
    assert len(art["data"]["cells"]) == 2


def test_scenario_tornado():
    art = build_scenario_tornado(
        "CELH",
        [
            {
                "title": "Demand miss",
                "probability_pct": 25,
                "impacts": {"revenue_pct": -12, "upside_pct": 6},
            }
        ],
    )
    assert art["kind"] == "scenario_tornado"
    assert art["data"]["drivers"][0]["downside_pct"] == -12.0


def test_moat_radar():
    art = build_moat_radar(
        "CELH",
        {
            "bastion_switching_costs": {"score": 7},
            "bastion_network_effects": {"score": 6},
            "bastion_durability": {"score": 8},
            "bastion_composite_moat": 7.1,
        },
    )
    assert art["kind"] == "moat_radar"
    assert len(art["data"]["values"]) == 5


def test_opportunity_frontier():
    art = build_opportunity_frontier(
        "CELH",
        {
            "opportunity_risk_free_proxy": 4.5,
            "opportunity_implied_earnings_yield": 0.06,
            "opportunity_spread_vs_cash": 0.015,
            "opportunity_revenue_growth": 0.12,
            "opportunity_roe": 0.18,
        },
        current_price=42,
    )
    assert art["kind"] == "opportunity_frontier"
    assert any(p["highlight"] for p in art["data"]["points"])


def test_ripple_cascade():
    art = build_ripple_cascade(
        "NVDA",
        {
            "ripple_chain_seed": [
                {"step": 1, "effect": "GPU demand", "beneficiary": "NVDA"},
                {"step": 2, "effect": "Power draw", "beneficiary": "Utilities"},
            ],
        },
    )
    assert art["kind"] == "ripple_cascade"
    assert len(art["graph"]["nodes"]) >= 3


def test_persona_artifacts():
    graham = build_graham_gauge("XYZ", [], 0)
    assert graham is None

    fan = build_valuation_football_field(
        "CELH",
        method_values={"dcf": 5e9, "ev_ebitda": 4.5e9},
        market_cap=4e9,
    )
    assert fan is not None
    assert len(fan["data"]["bars"]) == 2

    taleb = build_taleb_risk_profile(
        "CELH",
        {
            "tail_risk_analysis": {"score": 4, "max_score": 8},
            "fragility_analysis": {"score": 2, "max_score": 8},
        },
    )
    assert taleb is not None

    growth = build_growth_acceleration("CELH", [])
    assert growth is None


def test_shift_artifacts_bundle():
    signals = {
        "warren_buffett_abc123": {
            "CELH": {
                "signal": "bullish",
                "confidence": 72,
                "price_target": 55,
                "time_horizon_months": 18,
                "reference_price": 42,
            }
        },
        "michael_burry_def456": {
            "CELH": {"signal": "bearish", "confidence": 65, "price_target": 28},
        },
    }
    dossier = {
        "facts": [{"id": "f0", "label": "Revenue", "value": "$1.2B"}],
        "claims": [
            {
                "id": "c0",
                "agent": "warren_buffett",
                "signal": "bullish",
                "confidence": 72,
                "text": "Strong brand moat.",
                "supports": ["f0"],
                "contradicts": [],
            }
        ],
        "disputes": [],
    }
    arts = build_shift_artifacts(
        ticker="CELH",
        analyst_signals=signals,
        dossier=dossier,
        reference_price=42,
    )
    kinds = {a["kind"] for a in arts}
    assert "price_target_fan" in kinds
    assert "committee_dispersion" in kinds
    assert "dossier_board" in kinds

    fan = build_price_target_fan("CELH", signals, reference_price=42)
    assert fan is not None
    assert len(fan["data"]["targets"]) == 2

    board = build_dossier_board("CELH", dossier)
    assert board is not None
    assert board["data"]["claims"]
