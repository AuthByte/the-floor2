/** Investor bios for room detail panel (mirrors backend analyst registry). */

export interface AgentProfile {
  investingStyle: string;
  tier: "data" | "legend" | "specialist" | "risk" | "portfolio" | "debate" | "risk_pipeline";
}

const PROFILES: Record<string, AgentProfile> = {
  fundamentals_analyst: {
    tier: "data",
    investingStyle:
      "SEC earnings, filings, and profitability metrics — revenue growth, margins, and balance-sheet health.",
  },
  technical_analyst: {
    tier: "data",
    investingStyle:
      "Chart patterns, trend strength, and technical indicators from price action.",
  },
  valuation_analyst: {
    tier: "data",
    investingStyle: "Intrinsic value via DCF, multiples, and fair-value models.",
  },
  sentiment_analyst: {
    tier: "data",
    investingStyle: "Insider trades and news sentiment to gauge crowd positioning.",
  },
  news_sentiment_analyst: {
    tier: "data",
    investingStyle: "Press and headline sentiment as a trading signal overlay.",
  },
  growth_analyst: {
    tier: "data",
    investingStyle: "Revenue/earnings growth trends, margins, and insider conviction.",
  },
  aswath_damodaran: {
    tier: "legend",
    investingStyle:
      "Intrinsic value and financial metrics through rigorous valuation analysis.",
  },
  ben_graham: {
    tier: "legend",
    investingStyle:
      "Margin of safety and undervalued companies with strong fundamentals.",
  },
  bill_ackman: {
    tier: "legend",
    investingStyle: "Activism and contrarian positions to unlock value.",
  },
  cathie_wood: {
    tier: "legend",
    investingStyle: "Disruptive innovation and long-term growth at scale.",
  },
  charlie_munger: {
    tier: "legend",
    investingStyle: "Quality businesses, mental models, and rational long-term growth.",
  },
  michael_burry: {
    tier: "legend",
    investingStyle:
      "Contrarian bets, shorting overvaluation, deep fundamental work.",
  },
  mohnish_pabrai: {
    tier: "legend",
    investingStyle: "Value investing, doubles, and margin of safety.",
  },
  nassim_taleb: {
    tier: "legend",
    investingStyle:
      "Tail risk, antifragility, barbell strategy, convex payoffs.",
  },
  peter_lynch: {
    tier: "legend",
    investingStyle: "Buy what you know — growth at a reasonable price.",
  },
  phil_fisher: {
    tier: "legend",
    investingStyle: "Scuttlebutt research and long-term growth compounders.",
  },
  rakesh_jhunjhunwala: {
    tier: "legend",
    investingStyle: "Emerging markets growth and domestic opportunity.",
  },
  stanley_druckenmiller: {
    tier: "legend",
    investingStyle: "Macro trends, top-down bets on rates and growth.",
  },
  george_soros: {
    tier: "legend",
    investingStyle: "Reflexivity — feedback loops between price and fundamentals.",
  },
  jim_simons: {
    tier: "legend",
    investingStyle: "Quant signals: price, volatility, liquidity, anomalies.",
  },
  howard_marks: {
    tier: "legend",
    investingStyle: "Credit cycles, downside protection, second-level thinking.",
  },
  seth_klarman: {
    tier: "legend",
    investingStyle: "Deep value, margin of safety, asset backing.",
  },
  john_templeton: {
    tier: "legend",
    investingStyle: "Contrarian bargains at points of maximum pessimism.",
  },
  joel_greenblatt: {
    tier: "legend",
    investingStyle: "Magic formula: earnings yield plus return on capital.",
  },
  ray_dalio: {
    tier: "legend",
    investingStyle: "Macro balance, deleveraging, cash-flow durability.",
  },
  paul_tudor_jones: {
    tier: "legend",
    investingStyle: "Trend, momentum, volatility regime, catalyst timing.",
  },
  carl_icahn: {
    tier: "legend",
    investingStyle: "Activism, governance pressure, capital structure unlocks.",
  },
  li_lu: {
    tier: "legend",
    investingStyle: "Long-term compounders with strong ROIC and discipline.",
  },
  masayoshi_son: {
    tier: "legend",
    investingStyle: "Vision, TAM narrative, growth acceleration vs risk.",
  },
  david_einhorn: {
    tier: "legend",
    investingStyle:
      "Forensic accounting, cash-flow quality, insider selling, and asymmetric short theses.",
  },
  supply_chain_cartographer: {
    tier: "specialist",
    investingStyle:
      "Maps multi-tier supplier and customer webs; surfaces single-source chokepoints as an interactive supply graph.",
  },
  opportunity_cost: {
    tier: "specialist",
    investingStyle:
      "Scores whether marginal capital belongs here vs cash yield, index beta, peers, and higher-conviction alternatives.",
  },
  ripple_desk: {
    tier: "specialist",
    investingStyle:
      "Traces second- and third-order ripples — who wins three hops away when the obvious trade plays out.",
  },
  bastion_moat: {
    tier: "specialist",
    investingStyle:
      "Fortress index: switching costs, network effects, pricing power, and 5-10 year moat durability.",
  },
  unknown_unknowns: {
    tier: "specialist",
    investingStyle:
      "Red-team desk: attacks consensus, hunts hidden risks, accounting flags, concentration, disruption, and regulation — cannot agree with the majority.",
  },
  warren_buffett: {
    tier: "legend",
    investingStyle: "Moats, quality franchises, long-term owner mindset.",
  },
  portfolio_manager: {
    tier: "portfolio",
    investingStyle: "Synthesizes all analyst signals into final position sizes.",
  },
  debate_chamber: {
    tier: "debate",
    investingStyle:
      "Named investors rebut peer theses; signals stay fixed, confidence may drop.",
  },
  risk_forge: {
    tier: "risk_pipeline",
    investingStyle: "Stage 1 — brainstorms 8–12 company-specific risks per ticker.",
  },
  risk_research_hub: {
    tier: "risk_pipeline",
    investingStyle:
      "Stage 2 — routes each risk to geopolitical, macro, supply chain, competition, technology, and regulatory sub-desks.",
  },
  scenario_lab: {
    tier: "risk_pipeline",
    investingStyle: "Stage 3 — models revenue, EPS, and DCF impacts for top scenarios.",
  },
  risk_watchtower: {
    tier: "risk_pipeline",
    investingStyle: "Stage 4 — live risk status, indicator deltas, and monthly changes.",
  },
  risk_management_agent: {
    tier: "risk",
    investingStyle: "Position limits, margin, and portfolio risk gates.",
  },
};

export function getAgentProfile(agentKey: string): AgentProfile {
  return (
    PROFILES[agentKey] ?? {
      tier: "legend",
      investingStyle: "Multi-factor analysis for this shift.",
    }
  );
}
