export type AgentRole = "analyst" | "risk" | "portfolio";

export interface AgentDef {
  key: string;
  name: string;
  callsign: string;
  desk: string;
  role: AgentRole;
}

// === TIER 0: DATA FEEDS ===
// Raw-signal quant agents — mechanical data processors that ingest filings,
// price tape, sentiment scores, and growth metrics. First to wake.
export const DATA_ANALYSTS: AgentDef[] = [
  { key: "fundamentals_analyst",   name: "Earnings",         callsign: "EPS",   desk: "earnings & 10-K", role: "analyst" },
  { key: "technical_analyst",      name: "Technical",        callsign: "CHRT",  desk: "tape reader",    role: "analyst" },
  { key: "valuation_analyst",      name: "Valuation",        callsign: "DCF",   desk: "model bench",    role: "analyst" },
  { key: "sentiment_analyst",      name: "Sentiment",        callsign: "MOOD",  desk: "crowd mood",     role: "analyst" },
  { key: "news_sentiment_analyst", name: "News Sentiment",   callsign: "WIRE",  desk: "press wire",     role: "analyst" },
  { key: "growth_analyst",         name: "Growth",           callsign: "GROW",  desk: "growth pit",     role: "analyst" },
];

// === TIER 1: NAMED INVESTORS ===
// The legends. Each runs their own thesis, synthesizes data, produces a signal.
export const NAMED_ANALYSTS: AgentDef[] = [
  { key: "aswath_damodaran",       name: "Aswath Damodaran",       callsign: "DEAN",  desk: "valuation rituals", role: "analyst" },
  { key: "ben_graham",             name: "Ben Graham",              callsign: "GHOST", desk: "margin of safety",  role: "analyst" },
  { key: "bill_ackman",            name: "Bill Ackman",             callsign: "WEDGE", desk: "activist memos",    role: "analyst" },
  { key: "cathie_wood",            name: "Cathie Wood",             callsign: "ARK",   desk: "disruption desk",   role: "analyst" },
  { key: "charlie_munger",         name: "Charlie Munger",          callsign: "OPS",   desk: "mental models",     role: "analyst" },
  { key: "michael_burry",          name: "Michael Burry",           callsign: "SHORT", desk: "tail bets",         role: "analyst" },
  { key: "mohnish_pabrai",         name: "Mohnish Pabrai",          callsign: "DHND",  desk: "doubles desk",      role: "analyst" },
  { key: "nassim_taleb",           name: "Nassim Taleb",            callsign: "SWAN",  desk: "antifragility",     role: "analyst" },
  { key: "peter_lynch",            name: "Peter Lynch",             callsign: "LYNX",  desk: "ten-bagger hunt",   role: "analyst" },
  { key: "phil_fisher",            name: "Phil Fisher",             callsign: "SCTL",  desk: "scuttlebutt feed",  role: "analyst" },
  { key: "rakesh_jhunjhunwala",    name: "Rakesh Jhunjhunwala",     callsign: "BULL",  desk: "emerging markets",  role: "analyst" },
  { key: "stanley_druckenmiller",  name: "Stanley Druckenmiller",   callsign: "MACRO", desk: "top-down bets",     role: "analyst" },
  { key: "george_soros",           name: "George Soros",            callsign: "REFLX", desk: "reflexivity desk",  role: "analyst" },
  { key: "jim_simons",             name: "Jim Simons",              callsign: "quant",          desk: "quant",          role: "analyst" },
  { key: "howard_marks",           name: "Howard Marks",            callsign: "cycles",         desk: "cycles",         role: "analyst" },
  { key: "seth_klarman",           name: "Seth Klarman",            callsign: "deep value",     desk: "deep value",     role: "analyst" },
  { key: "john_templeton",         name: "John Templeton",          callsign: "contrarian",     desk: "contrarian",     role: "analyst" },
  { key: "joel_greenblatt",        name: "Joel Greenblatt",         callsign: "magic formula",  desk: "magic formula",  role: "analyst" },
  { key: "ray_dalio",              name: "Ray Dalio",               callsign: "macro balance",  desk: "macro balance",  role: "analyst" },
  { key: "paul_tudor_jones",       name: "Paul Tudor Jones",        callsign: "trend",          desk: "trend",          role: "analyst" },
  { key: "carl_icahn",             name: "Carl Icahn",              callsign: "activism",       desk: "activism",       role: "analyst" },
  { key: "li_lu",                  name: "Li Lu",                   callsign: "compounders",    desk: "compounders",    role: "analyst" },
  { key: "masayoshi_son",          name: "Masayoshi Son",           callsign: "vision",         desk: "vision",         role: "analyst" },
  { key: "david_einhorn",          name: "David Einhorn",           callsign: "FORENSIC",       desk: "short book",     role: "analyst" },
  { key: "warren_buffett",         name: "Warren Buffett",          callsign: "OMHA",  desk: "moats & coke",      role: "analyst" },
];

// === FURTHER ANALYSIS ===
// Specialist desks — not named-investor personas; run after the legend floor.
export const SPECIALIST_ANALYSTS: AgentDef[] = [
  { key: "supply_chain_cartographer", name: "Supply Chain Cartographer", callsign: "LINK", desk: "supply web", role: "analyst" },
  { key: "opportunity_cost",       name: "Opportunity Cost",        callsign: "ALT",   desk: "capital tradeoffs", role: "analyst" },
  { key: "ripple_desk",            name: "Ripple Desk",             callsign: "RPLFX", desk: "second-order",  role: "analyst" },
  { key: "bastion_moat",           name: "Bastion",                 callsign: "MOAT",  desk: "fortress index", role: "analyst" },
  { key: "unknown_unknowns",       name: "Unknown Unknowns",        callsign: "UNKWN",  desk: "thesis attack",   role: "analyst" },
];

// Combined analyst roster.
export const ANALYSTS: AgentDef[] = [...DATA_ANALYSTS, ...NAMED_ANALYSTS, ...SPECIALIST_ANALYSTS];

// Suffixes are deterministic 6-char [a-z0-9] strings so the backend's
// extract_base_agent_key parses them cleanly. See app/backend/services/graph.py
export const ROOM_SUFFIX = "r0floor"; // never used directly; per-agent below
export const PORTFOLIO_SUFFIX = "pmoss0"; // 6 chars
export const RISK_SUFFIX = PORTFOLIO_SUFFIX; // backend reuses pm suffix for risk

export function roomIdFor(agentKey: string): string {
  return `${agentKey}_${suffixFor(agentKey)}`;
}

function suffixFor(agentKey: string): string {
  // simple deterministic 6-char suffix
  let h = 0;
  for (let i = 0; i < agentKey.length; i++) {
    h = (h * 31 + agentKey.charCodeAt(i)) >>> 0;
  }
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[h % alphabet.length];
    h = Math.floor(h / 7) + 13;
  }
  return s;
}

export const PORTFOLIO_MANAGER: AgentDef = {
  key: "portfolio_manager",
  name: "Portfolio Manager",
  callsign: "BOSS",
  desk: "final decisions",
  role: "portfolio",
};

export const RISK_MANAGER: AgentDef = {
  key: "risk_management_agent",
  name: "Risk Manager",
  callsign: "GATE",
  desk: "position limits",
  role: "risk",
};

export const PORTFOLIO_MANAGER_ID = `portfolio_manager_${PORTFOLIO_SUFFIX}`;
export const RISK_MANAGER_ID = `risk_management_agent_${RISK_SUFFIX}`;

export const DEBATE_AGENT: AgentDef = {
  key: "debate_chamber",
  name: "Argument Room",
  callsign: "DEBATE",
  desk: "thesis debate",
  role: "analyst",
};

export const RISK_PIPELINE_AGENTS: AgentDef[] = [
  { key: "risk_forge", name: "Risk Forge", callsign: "FORGE", desk: "risk inventory", role: "analyst" },
  { key: "risk_research_hub", name: "Research Hub", callsign: "RSHUB", desk: "specialist research", role: "analyst" },
  { key: "scenario_lab", name: "Scenario Lab", callsign: "SCNRO", desk: "impact modeling", role: "analyst" },
  { key: "risk_watchtower", name: "Risk Watchtower", callsign: "TOWER", desk: "live monitoring", role: "analyst" },
];

/** Resolve callsign → agent metadata (first match when ambiguous). */
export function agentForCallsign(callsign: string): AgentDef | null {
  for (const a of [...ANALYSTS, PORTFOLIO_MANAGER, RISK_MANAGER, DEBATE_AGENT]) {
    if (a.callsign === callsign) return a;
  }
  return null;
}

/** Resolve floor room id → agent metadata for detail panel. */
export function agentForRoomId(roomId: string, debateRoomId?: string): AgentDef | null {
  for (const a of ANALYSTS) {
    if (roomIdFor(a.key) === roomId) return a;
  }
  if (roomId === PORTFOLIO_MANAGER_ID) return PORTFOLIO_MANAGER;
  if (roomId === RISK_MANAGER_ID) return RISK_MANAGER;
  for (const a of RISK_PIPELINE_AGENTS) {
    if (a.key === roomId) return a;
  }
  if (debateRoomId && roomId === debateRoomId) return DEBATE_AGENT;
  return null;
}
