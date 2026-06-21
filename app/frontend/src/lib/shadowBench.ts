import { ANALYSTS, DATA_ANALYSTS, NAMED_ANALYSTS, SPECIALIST_ANALYSTS } from "./agents";
import {
  collectCommitteeOpinions,
  isMemoInvestor,
  tallyCommitteeOpinions,
  type CommitteeOpinion,
} from "./opinions";
import type { AgentArtifact } from "./parseAgentAnalysis";
import type { CompletePayload, FinalDecisionAction } from "./types";

export type WeightMode = "equal" | "confidence";

export interface ShadowAgentRow {
  key: string;
  name: string;
  callsign: string;
  tier: "data" | "legend" | "specialist";
  enabled: boolean;
  signal: string;
  confidence: number | null;
  present: boolean;
}

export interface ShadowVerdict {
  signal: "bullish" | "bearish" | "neutral";
  action: FinalDecisionAction["action"];
  confidence: number;
  tally: { bullish: number; bearish: number; neutral: number };
  weighted: { bullish: number; bearish: number; neutral: number };
  opinions: CommitteeOpinion[];
  fragility: number;
  fragilityLabel: string;
  flippedFromBoss: boolean;
}

export interface ShadowPreset {
  id: string;
  label: string;
  description: string;
}

const VALUE_KEYS = new Set([
  "ben_graham",
  "warren_buffett",
  "seth_klarman",
  "michael_burry",
  "howard_marks",
  "david_einhorn",
  "mohnish_pabrai",
  "joel_greenblatt",
]);

const GROWTH_KEYS = new Set([
  "cathie_wood",
  "peter_lynch",
  "phil_fisher",
  "masayoshi_son",
  "growth_analyst",
  "rakesh_jhunjhunwala",
]);

const DATA_KEYS = new Set(DATA_ANALYSTS.map((a) => a.key));
const LEGEND_KEYS = new Set(NAMED_ANALYSTS.map((a) => a.key));
const SPECIALIST_KEYS = new Set(SPECIALIST_ANALYSTS.map((a) => a.key));

export const SHADOW_PRESETS: ShadowPreset[] = [
  { id: "all", label: "Full committee", description: "Every voice that spoke on this ticker" },
  { id: "legends", label: "Legends only", description: "Named investors + specialist desks" },
  { id: "value", label: "Value lane", description: "Graham, Buffett, Klarman, Burry…" },
  { id: "growth", label: "Growth lane", description: "Wood, Lynch, Fisher, growth desk…" },
  { id: "bears", label: "Bears only", description: "Only bearish desks remain" },
  { id: "bulls", label: "Bulls only", description: "Only bullish desks remain" },
  { id: "no_data", label: "Mute data feeds", description: "Legends without Tier-0 quant inputs" },
];

function stripAgentSuffix(agentId: string): string {
  const parts = agentId.split("_");
  if (parts.length < 2) return agentId;
  const maybeSuffix = parts[parts.length - 1];
  if (/^[a-z0-9]{6}$/i.test(maybeSuffix)) return parts.slice(0, -1).join("_");
  if (parts[parts.length - 1] === "agent") return parts.slice(0, -1).join("_");
  return agentId;
}

function tierFor(key: string): ShadowAgentRow["tier"] {
  if (DATA_KEYS.has(key)) return "data";
  if (SPECIALIST_KEYS.has(key)) return "specialist";
  return "legend";
}

export function listShadowAgents(
  ticker: string,
  analystSignals: Record<string, Record<string, unknown>>,
  enabled: Record<string, boolean>,
): ShadowAgentRow[] {
  const present = new Map<string, CommitteeOpinion>();

  for (const [agentId, byTicker] of Object.entries(analystSignals)) {
    if (!isMemoInvestor(agentId)) continue;
    const key = stripAgentSuffix(agentId);
    const bucket = byTicker?.[ticker];
    if (!bucket || typeof bucket !== "object") continue;
    const opinions = collectCommitteeOpinions(ticker, { [agentId]: byTicker });
    const row = opinions.find((o) => o.agentKey === key);
    if (row) present.set(key, row);
  }

  const rows: ShadowAgentRow[] = [];
  for (const def of ANALYSTS) {
    const op = present.get(def.key);
    if (!op) continue;
    rows.push({
      key: def.key,
      name: def.name,
      callsign: def.callsign,
      tier: tierFor(def.key),
      enabled: enabled[def.key] ?? true,
      signal: op.signal,
      confidence: op.confidence,
      present: true,
    });
  }

  return rows.sort((a, b) => {
    const tierOrder = { legend: 0, specialist: 1, data: 2 };
    const d = tierOrder[a.tier] - tierOrder[b.tier];
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

export function defaultEnabledMap(
  ticker: string,
  analystSignals: Record<string, Record<string, unknown>>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of listShadowAgents(ticker, analystSignals, {})) {
    out[row.key] = true;
  }
  return out;
}

export function applyShadowPreset(
  presetId: string,
  ticker: string,
  analystSignals: Record<string, Record<string, unknown>>,
): Record<string, boolean> {
  const agents = listShadowAgents(ticker, analystSignals, {});
  const out: Record<string, boolean> = {};

  for (const a of agents) {
    switch (presetId) {
      case "legends":
        out[a.key] = LEGEND_KEYS.has(a.key) || SPECIALIST_KEYS.has(a.key);
        break;
      case "value":
        out[a.key] = VALUE_KEYS.has(a.key);
        break;
      case "growth":
        out[a.key] = GROWTH_KEYS.has(a.key);
        break;
      case "bears":
        out[a.key] = a.signal === "bearish";
        break;
      case "bulls":
        out[a.key] = a.signal === "bullish";
        break;
      case "no_data":
        out[a.key] = !DATA_KEYS.has(a.key);
        break;
      default:
        out[a.key] = true;
    }
  }
  return out;
}

function filterSignals(
  analystSignals: Record<string, Record<string, unknown>>,
  enabled: Record<string, boolean>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [agentId, byTicker] of Object.entries(analystSignals)) {
    const key = stripAgentSuffix(agentId);
    if (enabled[key] === false) continue;
    if (!isMemoInvestor(agentId)) continue;
    out[agentId] = byTicker;
  }
  return out;
}

function weightScore(opinions: CommitteeOpinion[], mode: WeightMode) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const o of opinions) {
    const w = mode === "confidence" ? (o.confidence ?? 50) / 100 : 1;
    if (o.signal === "bullish") bullish += w;
    else if (o.signal === "bearish") bearish += w;
    else neutral += w;
  }
  return { bullish, bearish, neutral };
}

function signalToAction(signal: ShadowVerdict["signal"]): FinalDecisionAction["action"] {
  if (signal === "bullish") return "buy";
  if (signal === "bearish") return "sell";
  return "hold";
}

function computeFragility(opinions: CommitteeOpinion[], mode: WeightMode): { n: number; label: string } {
  if (opinions.length < 2) {
    return { n: 0, label: "Too few voices for a fragile consensus" };
  }

  const { bullish, bearish } = weightScore(opinions, mode);
  const majority = bullish >= bearish ? "bullish" : "bearish";

  const majorityOps = opinions
    .filter((o) => o.signal === majority)
    .sort((a, b) => (a.confidence ?? 50) - (b.confidence ?? 50));

  for (let remove = 1; remove <= majorityOps.length; remove++) {
    const remaining = opinions.filter(
      (o) => !majorityOps.slice(0, remove).some((r) => r.agentKey === o.agentKey),
    );
    const w = weightScore(remaining, mode);
    const newMajority =
      w.bullish > w.bearish ? "bullish" : w.bearish > w.bullish ? "bearish" : "neutral";
    if (newMajority !== majority) {
      const name = majorityOps[remove - 1]?.agentName ?? "weakest voice";
      return {
        n: remove,
        label:
          remove === 1
            ? `Flips if ${name} leaves the room`
            : `Flips if ${remove} ${majority} voices defect`,
      };
    }
  }

  return { n: majorityOps.length, label: "Rock-solid — majority survives full walkout" };
}

export function computeShadowVerdict(
  ticker: string,
  analystSignals: Record<string, Record<string, unknown>>,
  enabled: Record<string, boolean>,
  weightMode: WeightMode,
  bossAction?: FinalDecisionAction | null,
): ShadowVerdict | null {
  const filtered = filterSignals(analystSignals, enabled);
  const opinions = collectCommitteeOpinions(ticker, filtered);
  if (!opinions.length) return null;

  const tally = tallyCommitteeOpinions(opinions);
  const weighted = weightScore(opinions, weightMode);

  let signal: ShadowVerdict["signal"] = "neutral";
  if (weighted.bullish > weighted.bearish * 1.12) signal = "bullish";
  else if (weighted.bearish > weighted.bullish * 1.12) signal = "bearish";

  const margin = Math.abs(weighted.bullish - weighted.bearish);
  const total = weighted.bullish + weighted.bearish + weighted.neutral || 1;
  const confidence = Math.round(Math.min(98, 42 + (margin / total) * 58));

  const frag = computeFragility(opinions, weightMode);
  const action = signalToAction(signal);
  const bossSignal =
    bossAction?.action === "buy" || bossAction?.action === "cover"
      ? "bullish"
      : bossAction?.action === "sell" || bossAction?.action === "short"
        ? "bearish"
        : "neutral";

  return {
    signal,
    action,
    confidence,
    tally,
    weighted,
    opinions,
    fragility: frag.n,
    fragilityLabel: frag.label,
    flippedFromBoss: bossAction != null && bossSignal !== signal,
  };
}

export function buildShadowArtifacts(
  ticker: string,
  verdict: ShadowVerdict,
  referencePrice?: number,
): AgentArtifact[] {
  const confidences = verdict.opinions.map((o) => o.confidence ?? 50);
  const spread = confidences.length ? Math.max(...confidences) - Math.min(...confidences) : 0;

  const dispersion: AgentArtifact = {
    id: "shadow_dispersion",
    kind: "committee_dispersion",
    title: `${ticker} shadow dispersion`,
    caption: "Live recomputed from enabled desks only.",
    data: {
      ticker,
      bullish: verdict.tally.bullish,
      bearish: verdict.tally.bearish,
      neutral: verdict.tally.neutral,
      confidence_spread: spread,
      confidence_avg: confidences.length
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0,
      opinions: verdict.opinions.map((o) => ({
        agent: o.agentName,
        signal: o.signal,
        confidence: o.confidence ?? 0,
      })),
    },
  };

  const targets = verdict.opinions
    .filter((o) => o.priceTarget != null && o.priceTarget > 0)
    .map((o) => ({
      agent: o.agentName,
      price: o.priceTarget!,
      horizon_months: o.timeHorizonMonths,
      signal: o.signal,
    }));

  const arts: AgentArtifact[] = [dispersion];

  if (targets.length) {
    arts.push({
      id: "shadow_fan",
      kind: "price_target_fan",
      title: `${ticker} shadow targets`,
      caption: "Price targets from voices still on the bench.",
      data: {
        ticker,
        reference_price: referencePrice,
        targets,
      },
    });
  }

  return arts;
}

export function shadowPayloadTickers(payload: CompletePayload | null): string[] {
  if (!payload?.decisions) return [];
  return Object.keys(payload.decisions);
}
