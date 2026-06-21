/**
 * Sample payloads for landing-page demos — shapes match live SSE / complete-event data.
 */

import type { AgentArtifact } from "./parseAgentAnalysis";
import type { RoomState, RoomVerdict, TickerDossier } from "./types";

export const DEMO_NVDA_VERDICT: RoomVerdict = {
  signal: "bullish",
  confidence: 78,
  summary: "CUDA moat intact; Blackwell ramp supports 24-month compounder thesis.",
  timeHorizonMonths: 24,
  priceTarget: 1450,
  upsidePct: 22.4,
};

export const DEMO_BURRY_VERDICT: RoomVerdict = {
  signal: "bearish",
  confidence: 71,
  summary: "FCF yield too thin; multiple assumes flawless execution through cycle.",
  timeHorizonMonths: 12,
  priceTarget: 820,
  upsidePct: -30.8,
};

export const DEMO_BUFFETT_ANALYSIS = JSON.stringify({
  signal: "bullish",
  confidence: 78,
  reasoning:
    "NVIDIA exhibits classic wide-moat characteristics: switching costs via CUDA, network effects in the developer ecosystem, and pricing power on datacenter GPUs. Revenue growth has compounded while returns on incremental capital remain exceptional. The primary risk is cyclical hyperscaler capex, but contracted demand and backlog visibility reduce near-term air pockets. Valuation is full but not absurd relative to earnings power over a multi-year horizon.",
  thesis_summary: "CUDA moat intact; Blackwell ramp supports 24-month compounder thesis.",
  time_horizon_months: 24,
  price_target: 1450,
  upside_pct: 22.4,
  reference_price: 1185.5,
});

export const DEMO_SUPPLY_CHAIN_ARTIFACT: AgentArtifact = {
  id: "demo-supply-chain-nvda",
  title: "NVDA Supply Web",
  caption: "GPU fab concentration and hyperscaler customer dependencies",
  kind: "supply_chain_graph",
  graph: {
    focal_ticker: "NVDA",
    nodes: [
      { id: "asml", label: "ASML", role: "supplier", tier: -2, risk_note: "EUV monopoly" },
      { id: "tsmc", label: "TSMC", role: "supplier", tier: -1, risk_note: "Single-source fab" },
      { id: "nvda", label: "NVIDIA", role: "focal", tier: 0 },
      { id: "msft", label: "Microsoft", role: "customer", tier: 1 },
      { id: "amzn", label: "Amazon", role: "customer", tier: 1 },
      { id: "goog", label: "Alphabet", role: "customer", tier: 1 },
    ],
    edges: [
      { source: "asml", target: "tsmc", relationship: "supplies", criticality: "high" },
      { source: "tsmc", target: "nvda", relationship: "fabricates", criticality: "high" },
      { source: "nvda", target: "msft", relationship: "supplies", criticality: "medium" },
      { source: "nvda", target: "amzn", relationship: "supplies", criticality: "medium" },
      { source: "nvda", target: "goog", relationship: "supplies", criticality: "medium" },
    ],
    concentration_risks: ["TSMC single-source advanced node fab", "Top-3 hyperscalers >40% revenue"],
  },
};

export const DEMO_RISK_FORGE_STATE: RoomState = {
  status: "DONE",
  ticker: "NVDA",
  message: "Done",
  analysis: null,
  updatedAt: Date.now(),
  history: [],
  riskInventory: [
    { id: "r1", title: "TSMC geopolitical concentration", category: "geopolitical" },
    { id: "r2", title: "Hyperscaler capex cyclicality", category: "demand" },
    { id: "r3", title: "Export control escalation", category: "regulatory" },
    { id: "r4", title: "Custom ASIC substitution", category: "competitive" },
  ],
};

export const DEMO_RISK_HUB_STATE: RoomState = {
  status: "DONE",
  ticker: "NVDA",
  message: "Done",
  analysis: null,
  updatedAt: Date.now(),
  history: [],
  riskSubagents: [
    { id: "geopolitical_desk", risk_id: "r1", status: "scored" },
    { id: "supply_chain_cartographer", risk_id: "r1", status: "complete" },
    { id: "regulatory_scanner", risk_id: "r3", status: "scored" },
  ],
  riskReports: [
    {
      blended_probability_pct: 34,
      blended_severity_score: 7.2,
    },
  ],
};

export const DEMO_SCENARIO_STATE: RoomState = {
  status: "DONE",
  ticker: "NVDA",
  message: "Done",
  analysis: null,
  updatedAt: Date.now(),
  history: [],
  riskScenarios: [
    {
      title: "China export ban deepens",
      probability_pct: 28,
      impacts: { revenue_pct: -12, eps_pct: -18 },
    },
    {
      title: "Hyperscaler capex pause",
      probability_pct: 35,
      impacts: { revenue_pct: -22, eps_pct: -31 },
    },
  ],
};

export const DEMO_WATCHTOWER_STATE: RoomState = {
  status: "DONE",
  ticker: "NVDA",
  message: "Done",
  analysis: null,
  updatedAt: Date.now(),
  history: [],
  riskMonitoring: {
    tsmc_concentration: {
      status: "high",
      score: 0.82,
      changes_this_month: [{ indicator: "Fab utilization", delta_pct: -4, direction: "down" }],
    },
    capex_guidance: {
      status: "medium",
      score: 0.54,
      changes_this_month: [{ indicator: "Hyperscaler capex tone", delta_pct: -8, direction: "down" }],
    },
    export_controls: {
      status: "medium",
      score: 0.61,
      changes_this_month: [{ indicator: "BIS watchlist mentions", delta_pct: 12, direction: "up" }],
    },
  },
};

export const DEMO_NVDA_DOSSIER: TickerDossier = {
  facts: [
    { id: "f1", kind: "revenue", label: "Datacenter mix", value: ">80%", source: "tier0" },
    { id: "f2", kind: "margin", label: "Gross margin TTM", value: "~75%", source: "fundamentals" },
  ],
  claims: [
    {
      id: "c1",
      agent: "warren_buffett",
      signal: "bullish",
      confidence: 78,
      text: "CUDA moat intact; Blackwell ramp supports compounder thesis.",
      supports: [],
      contradicts: ["c2"],
    },
    {
      id: "c2",
      agent: "michael_burry",
      signal: "bearish",
      confidence: 71,
      text: "FCF yield too thin; cycle peak risk underpriced.",
      supports: [],
      contradicts: ["c1"],
    },
    {
      id: "c3",
      agent: "unknown_unknowns",
      signal: "bearish",
      confidence: 66,
      text: "Desk consensus ignores export-control tail and capex cliff.",
      supports: ["c2"],
      contradicts: ["c1"],
    },
  ],
  disputes: [
    {
      id: "d1",
      kind: "signal_split",
      summary: "Bull moat thesis vs bear cyclical/valuation case",
      bullish: ["c1"],
      bearish: ["c2", "c3"],
    },
  ],
};

export const DEMO_ANALYST_SIGNALS: Record<string, Record<string, unknown>> = {
  warren_buffett_agent: {
    NVDA: {
      signal: "bullish",
      confidence: 78,
      thesis_summary: DEMO_NVDA_VERDICT.summary,
      time_horizon_months: 24,
      price_target: 1450,
      upside_pct: 22.4,
    },
  },
  michael_burry_agent: {
    NVDA: {
      signal: "bearish",
      confidence: 71,
      thesis_summary: DEMO_BURRY_VERDICT.summary,
      time_horizon_months: 12,
      price_target: 820,
      upside_pct: -30.8,
    },
  },
  cathie_wood_agent: {
    NVDA: {
      signal: "bullish",
      confidence: 84,
      thesis_summary: "AI infrastructure S-curve; platform economics accelerating.",
      time_horizon_months: 36,
      price_target: 1800,
      upside_pct: 51.8,
    },
  },
  peter_lynch_agent: {
    NVDA: {
      signal: "neutral",
      confidence: 55,
      thesis_summary: "Ten-bagger already happened; GARP hard at this multiple.",
      time_horizon_months: 18,
      price_target: 1200,
      upside_pct: 1.2,
    },
  },
};
