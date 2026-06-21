/** Parse streamed agent analysis JSON into UI-friendly structures. */

export interface SignalBlock {
  signal?: string;
  details?: string;
}

export interface SecEarningsBlock {
  headline?: string | null;
  summary?: string | null;
  filing?: string | null;
  filing_url?: string | null;
  revenue?: number | null;
  revenue_yoy_pct?: number | null;
  eps?: number | null;
  eps_yoy_pct?: number | null;
  management_tone?: string | null;
  guidance?: string | null;
  one_time_items?: string[] | string | null;
  key_risks?: string[] | string | null;
  quarters_reported?: number | null;
  filing_date?: string | null;
  filing_form?: string | null;
  revenue_prior?: number | null;
  eps_prior?: number | null;
  net_income?: number | null;
  source?: string | null;
  quarterly_history?: Array<{
    period_end?: string | null;
    fiscal_period?: string | null;
    form?: string | null;
    revenue?: number | null;
    net_income?: number | null;
    eps?: number | null;
  }> | null;
}

export interface AgentArtifact {
  id: string;
  title: string;
  caption: string;
  url?: string;
  width?: number;
  height?: number;
  kind?: string;
  graph?: SupplyChainGraphData | RippleCascadeGraphData;
  data?: Record<string, unknown>;
}

export interface RippleCascadeGraphData {
  focal_ticker?: string;
  nodes: Array<{
    id: string;
    label: string;
    step?: number;
    role?: string;
    effect?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship?: string;
  }>;
}

export interface SupplyChainGraphData {
  focal_ticker?: string;
  nodes: Array<{
    id: string;
    label: string;
    role: string;
    tier: number;
    region?: string | null;
    risk_note?: string | null;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
    criticality?: string;
  }>;
  concentration_risks?: string[];
  graph_source?: string;
  structure?: {
    resilience_score?: number;
    upstream_depth?: number;
    inbound_links?: number;
    outbound_links?: number;
    [key: string]: unknown;
  };
}

export interface FundamentalsPayload {
  signal?: string;
  confidence?: number;
  reasoning: Record<string, SignalBlock | SecEarningsBlock | unknown>;
  sec: SecEarningsBlock | null;
  artifacts: AgentArtifact[];
}

export interface MetricRow {
  label: string;
  value: string;
  signal?: string;
}

export interface MetricsPayload {
  signal?: string;
  confidence?: number;
  rows: MetricRow[];
  summary?: string;
  artifacts: AgentArtifact[];
}

export interface InvestorJsonPayload {
  signal?: string;
  confidence?: number;
  reasoning: string;
  thesisSummary?: string;
  timeHorizonMonths?: number;
  priceTarget?: number;
  upsidePct?: number;
  evidence: MetricRow[];
  artifacts: AgentArtifact[];
}

export type ParsedAnalysis =
  | { kind: "fundamentals"; data: FundamentalsPayload }
  | { kind: "metrics"; data: MetricsPayload }
  | { kind: "investor_json"; data: InvestorJsonPayload }
  | { kind: "prose"; text: string; artifacts?: AgentArtifact[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function unwrapTickerPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj);
  if (
    keys.length === 1 &&
    /^[A-Z][A-Z0-9.-]{0,9}$/.test(keys[0]!) &&
    isRecord(obj[keys[0]!])
  ) {
    return obj[keys[0]!] as Record<string, unknown>;
  }
  return obj;
}

function asSignalBlock(v: unknown): SignalBlock | null {
  if (!isRecord(v)) return null;
  if ("signal" in v || "details" in v) {
    return {
      signal: typeof v.signal === "string" ? v.signal : undefined,
      details: typeof v.details === "string" ? v.details : undefined,
    };
  }
  return null;
}

function asSecBlock(v: unknown): SecEarningsBlock | null {
  if (!isRecord(v)) return null;
  if (!("headline" in v || "summary" in v || "revenue" in v || "eps" in v)) return null;
  return v as SecEarningsBlock;
}

function extractArtifacts(obj: Record<string, unknown>): AgentArtifact[] {
  const raw = obj.artifacts;
  if (!Array.isArray(raw)) return [];
  const interactiveKinds = new Set([
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
  ]);
  const out: AgentArtifact[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const kind = typeof entry.kind === "string" ? entry.kind : undefined;
    const url = typeof entry.url === "string" ? entry.url : undefined;
    if (!url && (!kind || !interactiveKinds.has(kind))) continue;
    const art: AgentArtifact = {
      id: typeof entry.id === "string" ? entry.id : url ?? kind ?? "artifact",
      title: typeof entry.title === "string" ? entry.title : "Artifact",
      caption: typeof entry.caption === "string" ? entry.caption : "",
    };
    if (url) art.url = url;
    if (kind) art.kind = kind;
    if (isRecord(entry.graph)) {
      art.graph = entry.graph as unknown as SupplyChainGraphData | RippleCascadeGraphData;
    }
    if (isRecord(entry.data)) art.data = entry.data;
    if (typeof entry.width === "number") art.width = entry.width;
    if (typeof entry.height === "number") art.height = entry.height;
    out.push(art);
  }
  return out;
}

/** Pull embedded artifacts from any JSON analysis blob (risk pipeline, etc.). */
export function parseEmbeddedArtifacts(raw: string | null): AgentArtifact[] {
  if (!raw?.trim().startsWith("{")) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return [];
    return extractArtifacts(parsed);
  } catch {
    return [];
  }
}

function isFundamentalsReasoning(obj: Record<string, unknown>): boolean {
  return (
    "sec_earnings" in obj ||
    "profitability" in obj ||
    "growth" in obj ||
    "cash_flow" in obj ||
    "valuation_ratios" in obj
  );
}

function parseFundamentals(obj: Record<string, unknown>): FundamentalsPayload {
  const inner = unwrapTickerPayload(obj);
  let signal = typeof inner.signal === "string" ? inner.signal : undefined;
  let confidence =
    typeof inner.confidence === "number" ? inner.confidence : undefined;
  let reasoning: Record<string, unknown> = inner;

  if (isRecord(inner.reasoning)) {
    reasoning = inner.reasoning;
  } else if (isFundamentalsReasoning(inner)) {
    reasoning = inner;
  }

  const sec = asSecBlock(reasoning.sec_earnings);

  return {
    signal,
    confidence,
    reasoning: reasoning as FundamentalsPayload["reasoning"],
    sec,
    artifacts: extractArtifacts(inner),
  };
}

function parseMetrics(_agentKey: string, obj: Record<string, unknown>): MetricsPayload {
  const inner = unwrapTickerPayload(obj);
  const signal = typeof inner.signal === "string" ? inner.signal : undefined;
  const confidence =
    typeof inner.confidence === "number" ? inner.confidence : undefined;
  const rows: MetricRow[] = [];

  const reasoning = isRecord(inner.reasoning) ? inner.reasoning : inner;
  for (const [key, val] of Object.entries(reasoning)) {
    if (key === "sec_earnings" || key === "artifacts") continue;
    const block = asSignalBlock(val);
    if (block) {
      rows.push({
        label: key.replace(/_/g, " "),
        value: block.details ?? block.signal ?? "—",
        signal: block.signal,
      });
    }
  }

  let summary: string | undefined;
  if (typeof inner.reasoning === "string") summary = inner.reasoning;

  return {
    signal,
    confidence,
    rows,
    summary: summary ?? (rows.length === 0 ? JSON.stringify(inner, null, 2) : undefined),
    artifacts: extractArtifacts(inner),
  };
}

function parseInvestorJson(obj: Record<string, unknown>): InvestorJsonPayload | null {
  const inner = unwrapTickerPayload(obj);
  if (typeof inner.reasoning !== "string") return null;

  const evidence: MetricRow[] = [];
  for (const [key, value] of Object.entries(inner)) {
    if (["signal", "confidence", "reasoning", "thesis_summary", "thesisSummary", "artifacts", "time_horizon_months", "price_target", "upside_pct", "reference_price"].includes(key)) {
      continue;
    }
    if (value == null) continue;
    let text: string;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" || typeof value === "boolean") text = String(value);
    else text = JSON.stringify(value, null, 2);
    evidence.push({
      label: key.replace(/_/g, " "),
      value: text,
    });
  }

  return {
    signal: typeof inner.signal === "string" ? inner.signal : undefined,
    confidence:
      typeof inner.confidence === "number" ? inner.confidence : undefined,
    reasoning: inner.reasoning,
    thesisSummary:
      typeof inner.thesis_summary === "string"
        ? inner.thesis_summary
        : typeof inner.thesisSummary === "string"
          ? inner.thesisSummary
          : undefined,
    timeHorizonMonths:
      typeof inner.time_horizon_months === "number"
        ? inner.time_horizon_months
        : undefined,
    priceTarget:
      typeof inner.price_target === "number" ? inner.price_target : undefined,
    upsidePct:
      typeof inner.upside_pct === "number" ? inner.upside_pct : undefined,
    evidence,
    artifacts: extractArtifacts(inner),
  };
}

export function parseAgentAnalysis(
  raw: string | null,
  agentKey: string,
): ParsedAnalysis | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { kind: "prose", text: trimmed };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return { kind: "prose", text: trimmed };

    const unwrapped = unwrapTickerPayload(parsed);
    const reasoningBody = isRecord(parsed.reasoning)
      ? parsed.reasoning
      : unwrapped;
    if (
      agentKey === "fundamentals_analyst" ||
      isFundamentalsReasoning(reasoningBody)
    ) {
      return { kind: "fundamentals", data: parseFundamentals(parsed) };
    }

    if (
      [
        "technical_analyst",
        "valuation_analyst",
        "sentiment_analyst",
        "news_sentiment_analyst",
        "growth_analyst",
      ].includes(agentKey) ||
      Object.values(unwrapped).some((v) => asSignalBlock(v))
    ) {
      return { kind: "metrics", data: parseMetrics(agentKey, parsed) };
    }

    const investor = parseInvestorJson(parsed);
    if (investor) {
      return { kind: "investor_json", data: investor };
    }

    if (typeof parsed.reasoning === "string") {
      return { kind: "prose", text: parsed.reasoning };
    }

    return { kind: "prose", text: JSON.stringify(parsed, null, 2) };
  } catch {
    return { kind: "prose", text: trimmed };
  }
}

/**
 * Cheaply count chart artifacts embedded in a room's raw analysis JSON.
 * Returns 0 without parsing when the payload obviously has no artifacts,
 * so this is safe to call across every room on each stream update.
 */
export function countArtifacts(raw: string | null): number {
  if (!raw || raw.indexOf('"artifacts"') === -1) {
    return 0;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return 0;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return 0;
    const inner = unwrapTickerPayload(parsed);
    const source = Array.isArray(inner.artifacts)
      ? inner.artifacts
      : Array.isArray(parsed.artifacts)
        ? parsed.artifacts
        : null;
    if (!source) return 0;
    return source.filter((e) => {
      if (!isRecord(e)) return false;
      if (typeof e.url === "string") return true;
      const kind = typeof e.kind === "string" ? e.kind : "";
      if (kind === "supply_chain_graph" && isRecord(e.graph)) return true;
      if (kind === "ripple_cascade" && isRecord(e.graph)) return true;
      return [
        "price_target_fan",
        "committee_dispersion",
        "risk_inventory_heatmap",
        "scenario_tornado",
        "moat_radar",
        "opportunity_frontier",
        "dossier_board",
      ].includes(kind);
    }).length;
  } catch {
    return 0;
  }
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
