"""Desk Engine: evidence ledger, lens priors, guardrails, and the conviction ensemble."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.desk.engine import LensVerdict, apply_guardrails, compute_prior, desk_price_target, fallback_verdict
from src.desk.ensemble import DEAD_BAND, decide, tally
from src.desk.evidence import assemble_ledger, scale
from src.desk.lenses import LENSES, Lens


def _prices(start: float, end: float, n: int = 260):
    step = (end - start) / (n - 1)
    return [SimpleNamespace(time=f"2025-{1 + i // 28 % 12:02d}-{1 + i % 28:02d}T{i:05d}", close=start + step * i) for i in range(n)]


def _metrics(**overrides):
    base = dict(
        report_period="2026-06-30",
        price_to_earnings_ratio=12.0,
        free_cash_flow_yield=0.07,
        price_to_book_ratio=1.5,
        enterprise_value_to_ebitda_ratio=8.0,
        peg_ratio=0.9,
        return_on_invested_capital=0.22,
        return_on_equity=0.25,
        gross_margin=0.6,
        operating_margin=0.25,
        revenue_growth=0.12,
        earnings_per_share_growth=0.15,
        free_cash_flow_growth=0.10,
        debt_to_equity=0.3,
        current_ratio=2.0,
        interest_coverage=20.0,
        free_cash_flow_per_share=6.0,
        earnings_per_share=8.0,
        market_cap=1e11,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _ledger(metrics=None, prices=None, **kw):
    return assemble_ledger(
        ticker="TEST",
        end_date="2026-09-30",
        prices=prices if prices is not None else _prices(80, 100),
        metrics=[metrics or _metrics()],
        line_items=[],
        market_cap=1e11,
        news=kw.get("news", []),
        insider_trades=kw.get("insider_trades", []),
    )


def test_scale_handles_inverted_ranges():
    assert scale(0.08, 0.02, 0.08) == pytest.approx(1.0)
    assert scale(0.02, 0.02, 0.08) == pytest.approx(-1.0)
    # lower-is-better (P/B): 1.2 is good, 6 is bad
    assert scale(1.2, 6.0, 1.2) == pytest.approx(1.0)
    assert scale(100, 6.0, 1.2) == -1.0


def test_ledger_ids_are_sequential_and_skip_missing():
    ledger = _ledger(metrics=_metrics(peg_ratio=None, interest_coverage=None))
    ids = [f.id for f in ledger.facts]
    assert ids == [f"F{i:02d}" for i in range(1, len(ids) + 1)]
    assert ledger.value("peg") is None
    assert ledger.value("roic") == pytest.approx(0.22)
    assert ledger.price == pytest.approx(100)


def test_strong_business_scores_positive_quality_and_value():
    ledger = _ledger()
    assert ledger.factors["quality"].score > 0.5
    assert ledger.factors["value"].score > 0.3
    assert ledger.factors["momentum"].score > 0
    assert ledger.fair_value and ledger.fair_value["low"] < ledger.fair_value["mid"] < ledger.fair_value["high"]


def test_missing_data_has_zero_coverage_not_conviction():
    ledger = assemble_ledger(
        ticker="EMPTY", end_date="2026-09-30", prices=[], metrics=[], line_items=[],
        market_cap=None, news=[], insider_trades=[],
    )
    prior = compute_prior(ledger, LENSES["warren_buffett"])
    assert prior.coverage == 0
    assert prior.signal == "neutral"
    assert prior.confidence <= 40


def test_contrarian_and_momentum_lenses_disagree_on_a_falling_cheap_stock():
    falling = _ledger(prices=_prices(200, 100))
    templeton = compute_prior(falling, LENSES["john_templeton"])
    ptj = compute_prior(falling, LENSES["paul_tudor_jones"])
    assert templeton.score > ptj.score


def test_dealbreaker_caps_bullish_at_neutral():
    levered = _ledger(metrics=_metrics(debt_to_equity=4.0))
    prior = compute_prior(levered, LENSES["warren_buffett"])
    assert "Leverage above 2.5x equity" in prior.tripped
    assert prior.signal != "bullish"


def test_force_bearish_dealbreaker():
    lens = Lens(key="t", creed="", weights={"quality": 1.0}, dealbreakers=LENSES["nassim_taleb"].dealbreakers)
    prior = compute_prior(_ledger(metrics=_metrics(interest_coverage=1.0)), lens)
    assert prior.forced_bearish and prior.signal == "bearish"


def _verdict(**kw):
    base = dict(signal="bullish", confidence=70, headline="h", thesis="t", cited=[], risk="", invalidation="")
    base.update(kw)
    return LensVerdict(**base)


def test_guardrails_drop_fake_citations_and_clamp_confidence():
    ledger = _ledger()
    lens = LENSES["joel_greenblatt"]
    prior = compute_prior(ledger, lens)
    v, notes = apply_guardrails(_verdict(signal=prior.signal, confidence=prior.confidence + 60, cited=["F01", "F99"]), prior, ledger, lens)
    assert v.cited == ["F01"]
    assert v.confidence <= prior.confidence + 20
    assert any("F99" in n for n in notes)


def test_guardrails_block_uncited_flip():
    ledger = _ledger()
    lens = LENSES["joel_greenblatt"]
    prior = compute_prior(ledger, lens)
    assert prior.signal == "bullish"
    v, _ = apply_guardrails(_verdict(signal="bearish", cited=["F01"]), prior, ledger, lens)
    assert v.signal == "bullish"
    v, _ = apply_guardrails(_verdict(signal="bearish", cited=["F01", "F02", "F03"]), prior, ledger, lens)
    assert v.signal == "bearish"


def test_price_target_is_directional():
    ledger = _ledger()
    lens = LENSES["ben_graham"]
    assert desk_price_target(ledger, lens, "bullish") >= ledger.price * 1.03
    assert desk_price_target(ledger, lens, "bearish") <= ledger.price * 0.97


def test_fallback_verdict_cites_real_facts():
    ledger = _ledger()
    lens = LENSES["warren_buffett"]
    prior = compute_prior(ledger, lens)
    v = fallback_verdict("TEST", prior, ledger, lens)
    assert set(v.cited) <= ledger.fact_ids()
    assert v.signal == prior.signal


# --- ensemble --------------------------------------------------------------


def test_tally_weights_and_agreement():
    t = tally({
        "warren_buffett_abc123": {"sig": "bullish", "conf": 80},
        "charlie_munger_abc123": {"sig": "bullish", "conf": 60},
        "michael_burry_abc123": {"sig": "bearish", "conf": 50},
    })
    assert t.voters == 3 and t.bulls == 2 and t.bears == 1
    assert t.net > 0
    assert 0.5 < t.agreement < 1


def test_decide_holds_inside_dead_band():
    t = tally({"a_abc123": {"sig": "bullish", "conf": 10}, "b_abc123": {"sig": "neutral", "conf": 90}})
    assert abs(t.net) < DEAD_BAND
    action, qty, _ = decide(t, {"buy": 100, "hold": 0}, None)
    assert (action, qty) == ("hold", 0)


def test_decide_buys_scaled_to_capacity():
    strong = tally({f"x{i}_abc123": {"sig": "bullish", "conf": 90} for i in range(5)})
    action, qty, conf = decide(strong, {"buy": 100, "hold": 0}, None)
    assert action == "buy" and qty == 100 and conf > 80
    mild = tally({"a_abc123": {"sig": "bullish", "conf": 40}, "b_abc123": {"sig": "neutral", "conf": 50}})
    action, qty, _ = decide(mild, {"buy": 100, "hold": 0}, None)
    assert action in ("buy", "hold") and qty < 100


def test_decide_trims_long_before_shorting():
    bear = tally({f"x{i}_abc123": {"sig": "bearish", "conf": 70} for i in range(3)})
    action, qty, _ = decide(bear, {"sell": 30, "short": 50, "hold": 0}, {"long": 30, "short": 0})
    assert action == "sell" and 10 <= qty <= 30
    action, qty, _ = decide(bear, {"short": 50, "hold": 0}, {"long": 0, "short": 0})
    assert action == "short" and qty > 0


def test_consulted_desk_counts_more():
    base = {"a_abc123": {"sig": "bullish", "conf": 60}, "b_abc123": {"sig": "bearish", "conf": 60}}
    assert tally(base).net == pytest.approx(0)
    base["a_abc123"]["user_consulted"] = True
    assert tally(base).net > 0


# --- graph -----------------------------------------------------------------


def test_graph_runs_quant_in_evidence_phase_and_analysts_after_gate():
    from app.backend.services.graph import create_graph

    nodes = [SimpleNamespace(id=i) for i in (
        "fundamentals_analyst_aaaaaa", "quant_momentum_bbbbbb", "warren_buffett_cccccc",
        "bastion_moat_dddddd", "portfolio_manager_eeeeee",
    )]
    edges = [SimpleNamespace(source=n.id, target="portfolio_manager_eeeeee") for n in nodes[:-1]]
    graph = create_graph(nodes, edges)
    pairs = set(graph.edges)
    assert ("start_node", "quant_momentum_bbbbbb") in pairs
    assert ("quant_momentum_bbbbbb", "risk_forge") in pairs
    assert ("tier1_gate", "warren_buffett_cccccc") in pairs
    assert ("tier1_gate", "bastion_moat_dddddd") in pairs
    assert ("warren_buffett_cccccc", "debate_chamber") in pairs
    assert ("fundamentals_analyst_aaaaaa", "debate_chamber") not in pairs
    assert "analysis_gate" not in graph.nodes and "quant_gate" not in graph.nodes
