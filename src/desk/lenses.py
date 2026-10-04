"""Lenses — each floor analyst as data instead of a bespoke 500-line module.

A lens is a creed (how this desk thinks, in our own words), weights over the
eight evidence factors, and dealbreakers that cap or flip the call no matter
how good the rest looks. Negative weights are deliberate: contrarian desks
*like* bad sentiment and broken momentum.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from src.desk.evidence import EvidenceLedger

Effect = Literal["cap_neutral", "force_bearish"]


@dataclass(frozen=True)
class Dealbreaker:
    fact: str  # fact key, or "factor:<name>" for a factor score
    op: Literal["<", ">"]
    threshold: float
    reason: str
    effect: Effect = "cap_neutral"

    def check(self, ledger: EvidenceLedger) -> bool:
        if self.fact.startswith("factor:"):
            fs = ledger.factors.get(self.fact.split(":", 1)[1])
            if not fs or fs.coverage == 0:
                return False
            value = fs.score
        else:
            value = ledger.value(self.fact)
            if value is None:
                return False
        return value < self.threshold if self.op == "<" else value > self.threshold


@dataclass(frozen=True)
class Lens:
    key: str
    creed: str
    weights: dict[str, float]
    dealbreakers: tuple[Dealbreaker, ...] = field(default_factory=tuple)
    horizon_months: int = 12
    # How strongly the lens trusts the desk fair value for its price target (0..1);
    # the remainder comes from momentum-implied drift.
    fair_value_trust: float = 0.7


def _lens(key: str, creed: str, horizon: int = 12, trust: float = 0.7, rules: tuple = (), **weights: float) -> Lens:
    return Lens(key=key, creed=creed, weights=weights, dealbreakers=rules, horizon_months=horizon, fair_value_trust=trust)


DB = Dealbreaker
LEVERED = DB("debt_equity", ">", 2.5, "Leverage above 2.5x equity")
DILUTER = DB("dilution", ">", 0.08, "Share count up >8% — owners are being diluted")
NO_COVER = DB("interest_cover", "<", 1.5, "Interest barely covered by operating profit", "force_bearish")
OVERPRICED = DB("fv_upside", "<", -0.45, "Trades far above any defensible fair value")
LOSS_MAKER = DB("roic", "<", 0.0, "Destroys capital (negative ROIC)")

LENSES: dict[str, Lens] = {
    lens.key: lens
    for lens in (
        _lens(
            "warren_buffett",
            "Own durable compounders run by honest stewards, bought at a price that leaves room for error. "
            "High, steady returns on capital matter more than cheapness; leverage and dilution are disqualifying.",
            horizon=36, trust=0.85, rules=(LEVERED, DILUTER, LOSS_MAKER),
            quality=0.35, value=0.25, safety=0.2, stability=0.1, growth=0.1,
        ),
        _lens(
            "charlie_munger",
            "Invert: first list how this business could fail, then pay up only for rare moats with simple economics. "
            "A great business at a fair price beats a fair business at a great price.",
            horizon=48, trust=0.8, rules=(LEVERED, LOSS_MAKER),
            quality=0.45, safety=0.2, value=0.15, stability=0.1, growth=0.1,
        ),
        _lens(
            "ben_graham",
            "Arithmetic before stories. Buy only with a wide, measurable margin of safety on earnings and assets, "
            "and a balance sheet that survives a bad year.",
            horizon=18, trust=0.95, rules=(LEVERED, OVERPRICED, DB("current_ratio", "<", 1.0, "Current ratio below 1.0")),
            value=0.55, safety=0.3, stability=0.15,
        ),
        _lens(
            "aswath_damodaran",
            "Every valuation is a story tied to numbers: growth, margins, reinvestment, risk. "
            "Call it only when price and the narrative-implied value diverge materially.",
            horizon=24, trust=1.0, rules=(OVERPRICED,),
            value=0.45, growth=0.25, quality=0.2, safety=0.1,
        ),
        _lens(
            "bill_ackman",
            "Concentrate in simple, predictable, free-cash-flow machines with a fixable flaw — "
            "a catalyst that unlocks value management alone won't.",
            horizon=24, trust=0.8, rules=(NO_COVER,),
            quality=0.35, value=0.3, growth=0.15, momentum=-0.1, safety=0.1,
        ),
        _lens(
            "cathie_wood",
            "Back exponential platforms early; tolerate volatility and thin profits if revenue growth and "
            "reinvestment signal a widening lead. Today's multiple is the least important number.",
            horizon=60, trust=0.3, rules=(DB("rev_growth", "<", 0.05, "Growth below 5% — not a disruptor"),),
            growth=0.6, momentum=0.2, quality=0.1, sentiment=0.1,
        ),
        _lens(
            "michael_burry",
            "Hunt where nobody wants to look: hated, cheap, cash-generative names with hard downside. "
            "Popularity is a cost; free cash flow yield is the tell.",
            horizon=18, trust=0.9, rules=(NO_COVER,),
            value=0.55, safety=0.2, sentiment=-0.15, momentum=-0.1,
        ),
        _lens(
            "mohnish_pabrai",
            "Heads I win, tails I don't lose much. Simple businesses, temporary trouble, "
            "and a price where the downside is mostly priced in.",
            horizon=36, trust=0.9, rules=(LEVERED,),
            value=0.45, safety=0.3, quality=0.15, momentum=-0.1,
        ),
        _lens(
            "nassim_taleb",
            "Avoid fragility before seeking return. Leverage, thin coverage and fat left tails disqualify; "
            "prefer names that gain from disorder or at least survive it.",
            horizon=12, trust=0.4, rules=(LEVERED, NO_COVER, DB("max_dd", "<", -0.55, "Window drawdown worse than -55%", "force_bearish")),
            safety=0.45, stability=0.35, quality=0.1, value=0.1,
        ),
        _lens(
            "peter_lynch",
            "Know what you own and why it can grow. Favor understandable companies whose earnings "
            "growth outpaces the multiple you pay (PEG near or below 1).",
            horizon=24, trust=0.7, rules=(DB("peg", ">", 3.0, "PEG above 3 — paying too much for the growth"),),
            growth=0.4, value=0.3, quality=0.2, safety=0.1,
        ),
        _lens(
            "phil_fisher",
            "Scuttlebutt for long-runway growers: rising margins, product pipelines and management that reinvests well. "
            "Buy rarely, hold for years.",
            horizon=48, trust=0.5, rules=(DB("margin_trend", "<", -0.06, "Operating margins eroding"),),
            growth=0.4, quality=0.4, stability=0.1, safety=0.1,
        ),
        _lens(
            "rakesh_jhunjhunwala",
            "Back conviction growth stories with strong return on equity and a long economic tailwind; "
            "ride the trend while the fundamentals keep confirming it.",
            horizon=36, trust=0.6, rules=(LOSS_MAKER,),
            growth=0.35, quality=0.3, momentum=0.2, value=0.15,
        ),
        _lens(
            "stanley_druckenmiller",
            "Size to asymmetry. Follow liquidity and price trend; when growth, momentum and tone align, press — "
            "when they break, cut fast.",
            horizon=9, trust=0.3,
            momentum=0.4, growth=0.3, sentiment=0.15, stability=0.15,
        ),
        _lens(
            "george_soros",
            "Markets are reflexive: perception moves fundamentals. Look for self-reinforcing trends "
            "and the point where the narrative and the numbers start to disagree.",
            horizon=6, trust=0.2,
            momentum=0.45, sentiment=0.3, growth=0.15, stability=0.1,
        ),
        _lens(
            "jim_simons",
            "No stories. Only persistent, measurable statistical edges: trend, volatility regime, and "
            "factor exposures. If the signal is weak, the position is small.",
            horizon=3, trust=0.1,
            momentum=0.45, stability=0.2, value=0.15, quality=0.1, sentiment=0.1,
        ),
        _lens(
            "howard_marks",
            "Where are we in the cycle? Be greedy when others are fearful only if the price already "
            "discounts the bad news — and never at the cost of permanent loss.",
            horizon=24, trust=0.8, rules=(NO_COVER,),
            value=0.4, safety=0.3, sentiment=-0.2, momentum=-0.1,
        ),
        _lens(
            "seth_klarman",
            "Margin of safety is the whole game. Demand tangible value, strong balance sheets and low expectations; "
            "willing to hold cash rather than stretch.",
            horizon=24, trust=0.95, rules=(LEVERED, OVERPRICED),
            value=0.5, safety=0.35, sentiment=-0.15,
        ),
        _lens(
            "john_templeton",
            "Buy at the point of maximum pessimism and sell at maximum optimism. "
            "Cheapness plus despair is the setup; cheapness plus euphoria is not.",
            horizon=36, trust=0.85,
            value=0.45, sentiment=-0.3, momentum=-0.25,
        ),
        _lens(
            "joel_greenblatt",
            "Magic formula discipline: high return on capital at a high earnings yield. "
            "Rank, don't romanticize.",
            horizon=12, trust=0.8, rules=(LOSS_MAKER,),
            quality=0.5, value=0.5,
        ),
        _lens(
            "ray_dalio",
            "Diversified, regime-aware risk parity thinking: favor balance sheets and cash flows that hold up "
            "across growth and inflation surprises; avoid single-scenario bets.",
            horizon=12, trust=0.5, rules=(LEVERED,),
            safety=0.3, stability=0.3, quality=0.2, value=0.2,
        ),
        _lens(
            "paul_tudor_jones",
            "Defense first: never average losers, respect the 200-day line, and press only when "
            "the tape confirms the thesis.",
            horizon=6, trust=0.2, rules=(DB("trend_200d", "<", -0.15, "Price >15% under its 200-day average"),),
            momentum=0.5, stability=0.25, sentiment=0.15, value=0.1,
        ),
        _lens(
            "carl_icahn",
            "Undervalued assets controlled by complacent management. Cheap, cash-rich, under-levered "
            "targets where a push could unlock buybacks, spin-offs or a sale.",
            horizon=18, trust=0.85,
            value=0.5, safety=0.25, momentum=-0.15, quality=0.1,
        ),
        _lens(
            "li_lu",
            "Think like a business owner across decades: a few great franchises with integrity, "
            "bought cheaply enough that time does the work.",
            horizon=60, trust=0.85, rules=(LEVERED, DILUTER),
            quality=0.4, value=0.35, safety=0.15, growth=0.1,
        ),
        _lens(
            "masayoshi_son",
            "Bet the farm on the next platform shift. Growth and reach dominate; balance-sheet "
            "comfort and current profits are secondary to category leadership.",
            horizon=60, trust=0.2,
            growth=0.6, momentum=0.25, sentiment=0.15,
        ),
        _lens(
            "david_einhorn",
            "Long the misunderstood, short the accounting fiction. Free cash flow should confirm earnings; "
            "when it doesn't, assume the cash is right.",
            horizon=12, trust=0.85, rules=(DILUTER,),
            value=0.4, quality=0.3, safety=0.2, sentiment=-0.1,
        ),
    )
}


def lens_for(base_key: str) -> Lens | None:
    return LENSES.get(base_key)


def lens_from_persona_weights(key: str, creed: str, weights: dict[str, float]) -> Lens:
    """Map minted-persona metric weights onto evidence factors."""
    w = weights or {}
    return Lens(
        key=key,
        creed=creed,
        weights={
            "value": float(w.get("valuation", 0.2)),
            "momentum": float(w.get("momentum", 0.2)),
            "quality": float(w.get("quality", 0.2)),
            # Macro sensitivity has no single-name factor; it reads as a preference for steadier tapes.
            "stability": float(w.get("macro_sensitivity", 0.2)),
            "safety": float(w.get("risk_control", 0.2)),
        },
        horizon_months=12,
    )
