import { ANALYSTS, NAMED_ANALYSTS, SPECIALIST_ANALYSTS, QUANT_ANALYSTS } from "./agents";
import { displayThesisText } from "./thesisText";

const MEMO_AGENT_KEYS = new Set(
  [...NAMED_ANALYSTS, ...SPECIALIST_ANALYSTS, ...QUANT_ANALYSTS].map((a) => a.key),
);
const EXCLUDED = new Set([
  "portfolio_manager",
  "risk_management_agent",
  "debate_chamber",
  "argument_room",
]);

export interface ThesisRevision {
  id: string;
  ts?: string;
  prompt?: string;
  before?: {
    signal?: string;
    confidence?: number;
    thesis_summary?: string;
    price_target?: number;
  };
  after?: {
    signal?: string;
    confidence?: number;
    thesis_summary?: string;
    price_target?: number;
  };
  reply_to_user?: string;
}

export interface CommitteeOpinion {
  agentName: string;
  agentKey: string;
  signal: string;
  confidence: number | null;
  summary: string;
  timeHorizonMonths?: number;
  priceTarget?: number;
  upsidePct?: number;
  referencePrice?: number;
  revisionHistory?: ThesisRevision[];
  userConsulted?: boolean;
}

function stripAgentSuffix(agentId: string): string {
  const parts = agentId.split("_");
  if (parts.length < 2) return agentId;
  const maybeSuffix = parts[parts.length - 1];
  if (/^[a-z0-9]{6}$/i.test(maybeSuffix)) return parts.slice(0, -1).join("_");
  if (parts[parts.length - 1] === "agent") return parts.slice(0, -1).join("_");
  return agentId;
}

function displayNameForAgent(agentId: string): string {
  const base = stripAgentSuffix(agentId);
  const match = ANALYSTS.find((a) => a.key === base);
  return match?.name ?? base.replace(/_/g, " ");
}

function thesisSnippet(bucket: Record<string, unknown>): string {
  const summary = bucket.thesis_summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();

  const pre = bucket.pre_debate_reasoning ?? bucket.reasoning;
  if (typeof pre === "string" && pre.trim()) {
    const text = displayThesisText(pre).replace(/\s+/g, " ").trim();
    if (text) return text.length > 220 ? `${text.slice(0, 217)}…` : text;
  }

  return "";
}

export function isMemoInvestor(agentId: string): boolean {
  const base = stripAgentSuffix(agentId);
  return MEMO_AGENT_KEYS.has(base) && !EXCLUDED.has(base);
}

export function collectCommitteeOpinions(
  ticker: string,
  analystSignals: Record<string, Record<string, unknown>>,
): CommitteeOpinion[] {
  const rows: CommitteeOpinion[] = [];

  for (const [agentId, byTicker] of Object.entries(analystSignals)) {
    if (!isMemoInvestor(agentId)) continue;
    const bucket = byTicker?.[ticker];
    if (!bucket || typeof bucket !== "object") continue;
    const value = bucket as Record<string, unknown>;
    const summary = thesisSnippet(value);
    if (!summary && value.signal == null) continue;

    rows.push({
      agentKey: stripAgentSuffix(agentId),
      agentName: displayNameForAgent(agentId),
      signal: typeof value.signal === "string" ? value.signal : "neutral",
      confidence:
        typeof value.confidence === "number" ? Math.round(value.confidence) : null,
      summary: summary || "No thesis summary recorded.",
      timeHorizonMonths:
        typeof value.time_horizon_months === "number"
          ? value.time_horizon_months
          : undefined,
      priceTarget:
        typeof value.price_target === "number" ? value.price_target : undefined,
      upsidePct:
        typeof value.upside_pct === "number" ? value.upside_pct : undefined,
      referencePrice:
        typeof value.reference_price === "number"
          ? value.reference_price
          : undefined,
      revisionHistory: Array.isArray(value.revision_history)
        ? (value.revision_history as ThesisRevision[])
        : undefined,
      userConsulted: Boolean(value.user_consulted),
    });
  }

  return rows.sort((a, b) => {
    const order = (s: string) => (s === "bullish" ? 0 : s === "bearish" ? 1 : 2);
    const d = order(a.signal) - order(b.signal);
    if (d !== 0) return d;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

export function tallyCommitteeOpinions(opinions: CommitteeOpinion[]) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const o of opinions) {
    if (o.signal === "bullish") bullish++;
    else if (o.signal === "bearish") bearish++;
    else neutral++;
  }
  return { bullish, bearish, neutral };
}
