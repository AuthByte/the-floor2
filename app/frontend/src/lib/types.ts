import type { CommitteeOpinion, ThesisRevision } from "./opinions";
import type { ShiftTokenUsage, TokenUsageStats } from "./tokenUsage";

export type RoomStatus = "STANDBY" | "WORKING" | "DONE" | "ERROR";

export interface RoomHistoryEntry {
  ts: number;
  ticker: string | null;
  status: string;
  analysis?: string | null;
  signal?: string | null;
}

export interface RoomVerdict {
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  summary: string;
  timeHorizonMonths?: number;
  priceTarget?: number;
  upsidePct?: number;
  referencePrice?: number;
}

export interface RoomState {
  status: RoomStatus;
  ticker: string | null;
  message: string;
  analysis: string | null;
  updatedAt: number;
  /** Bull/bear plaque above cubicle after thesis completes. */
  verdict?: RoomVerdict | null;
  /** Lightweight status log (not every stream chunk). */
  history: { ts: number; ticker: string | null; status: string }[];
  /** Completed theses for this session (room detail panel). */
  thesisHistory?: RoomHistoryEntry[];
  /** Live feed for the active head-to-head (two debaters only). */
  debateFeed?: DebateLine[];
  debateRounds?: DebateRound[];
  activeDebateTicker?: string | null;
  /** Pre-debate consultation envelopes (only on the consultation channel). */
  consultations?: ConsultationMessage[];
  /** Risk research hub subagent feed. */
  riskSubagents?: RiskSubagentStatus[];
  riskReports?: RiskResearchReport[];
  riskInventory?: RiskInventoryItem[];
  riskScenarios?: RiskScenario[];
  riskMonitoring?: Record<string, RiskMonitoringStatus>;
  /** Delegated sub-agent tasks (any parent desk). */
  subagents?: SubagentStatus[];
  subagentResults?: SubagentResult[];
  /** Cumulative OpenRouter token usage for this agent this shift. */
  tokenUsage?: TokenUsageStats | null;
}

export interface ConsultationMessage {
  id: string;
  seq: number;
  ticker: string | null;
  /** Backend agent id (equals the floor roomId). */
  from: string;
  to: string;
  /** Base agent keys, for room-position fallbacks. */
  fromKey: string;
  toKey: string;
  fromName: string;
  toName: string;
  phase: "request" | "reply" | "user_request" | "user_reply";
  note?: string | null;
}

export interface DebateLine {
  name: string;
  ticker: string | null;
  text: string;
  ts: number;
  side?: "left" | "right" | "support" | "panel" | "chair";
  signal?: "bullish" | "bearish" | "neutral" | string;
  mode?: "opening" | "crossfire" | "one_v_two" | "chair_consult";
  matchup?: string | null;
  targets?: string[];
}

export interface DebateMatchup {
  bull: DebateSide;
  bear: DebateSide;
}

export interface DebateCohorts {
  bull: DebateSide[];
  bear: DebateSide[];
  neutral: DebateSide[];
}

export interface DebateSide {
  agent_id: string;
  name: string;
  specialty: string;
  signal: string;
  confidence_before: number;
  confidence_after: number;
}

export interface DebatePhaseMarker {
  kind: "opening" | "floor_open" | "chair" | "crossfire" | "verdict";
  started_at: number;
  ended_at?: number;
  label?: string;
}

export interface DebateChairInterjection {
  chair_name: string;
  text: string;
  at: number;
  replies: { agent_id: string; name: string; text: string; at: number }[];
}

export interface DebateRound {
  ticker: string;
  left: DebateSide;
  right: DebateSide;
  participants?: DebateSide[];
  participant_count?: number;
  mode?: "all_play" | "one_v_two" | "head_to_head" | "paired_committee";
  focal_name?: string | null;
  challenger_names?: string[];
  matchups?: DebateMatchup[];
  cohorts?: DebateCohorts;
  lines: DebateLine[];
  winner?: "left" | "right" | "draw" | null;
  winner_name?: string | null;
  summary?: string | null;
  recap?: string | null;
  started_at?: number;
  ended_at?: number;
  phases?: DebatePhaseMarker[];
  chair_interjections?: DebateChairInterjection[];
}

export interface LogLine {
  id: string;
  ts: number;
  callsign: string;
  /** Floor room id when this line maps to a desk on the map. */
  roomId?: string | null;
  ticker: string | null;
  status: string;
  level: "info" | "ok" | "warn" | "err";
}

export interface FinalDecisionAction {
  action: "buy" | "sell" | "short" | "cover" | "hold";
  quantity?: number;
  confidence?: number;
  reasoning?: string;
}

export interface PaperOrderResult {
  ticker: string;
  action: string;
  requested_qty: number;
  side?: string;
  status: string;
  order_id?: string | null;
  filled_qty?: string | number | null;
  filled_avg_price?: number | null;
  ref_price?: number | null;
  error?: string | null;
}

export interface PaperTradingSummary {
  orders_submitted: number;
  orders_filled: number;
  orders_failed: number;
  day_pnl: number | null;
  equity: number | null;
}

export interface PaperAccountSnapshot {
  equity?: number | null;
  cash?: number | null;
  buying_power?: number | null;
  portfolio_value?: number | null;
  last_equity?: number | null;
  status?: string | null;
  currency?: string | null;
}

export interface PaperPosition {
  symbol?: string;
  qty?: string;
  side?: string;
  market_value?: number | null;
  unrealized_pl?: number | null;
  unrealized_plpc?: number | null;
  current_price?: number | null;
  avg_entry_price?: number | null;
}

export interface PaperOrder {
  id?: string;
  symbol?: string;
  side?: string;
  qty?: string;
  filled_qty?: string;
  status?: string;
  type?: string;
  submitted_at?: string;
  filled_at?: string | null;
}

export interface PaperTradingResult {
  enabled: boolean;
  skipped_reason?: string;
  shift_id?: string;
  executed_at?: string;
  orders: PaperOrderResult[];
  account: PaperAccountSnapshot | null;
  positions: PaperPosition[];
  summary?: PaperTradingSummary;
}

export interface AlpacaStatus {
  configured: boolean;
  source: "env" | "request" | "none";
  disabled?: boolean;
}

export interface MemoEmailResult {
  enabled: boolean;
  sent: boolean;
  to?: string;
  id?: string | null;
  error?: string | null;
}

export interface TickerDossierDispute {
  id: string;
  kind: string;
  summary?: string;
  bullish?: string[];
  bearish?: string[];
  from_agent?: string;
  targets?: string[];
  agent?: string;
}

export interface TickerDossierFact {
  id: string;
  kind: string;
  label: string;
  value: string | number;
  source?: string;
  detail?: string | null;
}

export interface TickerDossierClaim {
  id: string;
  agent: string;
  signal: string;
  confidence: number;
  text: string;
  supports: string[];
  contradicts: string[];
}

export interface TickerDossier {
  facts: TickerDossierFact[];
  claims: TickerDossierClaim[];
  disputes: TickerDossierDispute[];
}

export interface RiskInventoryItem {
  id: string;
  title: string;
  category: string;
  tags?: string[];
}

export interface SubagentStatus {
  id: string;
  label: string;
  task?: string;
  status: string;
}

export interface SubagentResult {
  id: string;
  label: string;
  task?: string;
  summary: string;
  key_findings?: string[];
  confidence?: number;
  data_gaps?: string[];
  error?: string;
}

export interface RiskSubagentStatus {
  id: string;
  risk_id: string;
  status: string;
  title?: string;
}

export interface RiskResearchReport {
  assigned_to?: string[];
  reports?: Record<string, {
    specialist?: string;
    label?: string;
    probability_pct?: number;
    severity?: string;
    severity_score?: number;
    early_warnings?: string[];
    historical_examples?: string[];
    summary?: string;
  }>;
  blended_probability_pct?: number;
  blended_severity_score?: number;
}

export interface RiskScenario {
  risk_id?: string;
  title?: string;
  probability_pct?: number;
  impacts?: { revenue_pct?: number; eps_pct?: number; dcf_pct?: number };
  exposed_segments?: { name: string; exposure: string }[];
  narrative?: string;
}

export interface RiskMonitoringStatus {
  status: "low" | "medium" | "high" | string;
  score?: number;
  changes_this_month?: { indicator: string; delta_pct: number; direction: string }[];
  indicators?: { name: string; value?: number | string | null }[];
  updated_at?: string;
}

export interface TickerRiskPipeline {
  inventory?: RiskInventoryItem[];
  research?: Record<string, RiskResearchReport>;
  scenarios?: RiskScenario[];
  monitoring?: Record<string, RiskMonitoringStatus>;
}

export interface ShiftArtifact {
  id: string;
  title: string;
  caption: string;
  kind?: string;
  url?: string;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
  graph?: Record<string, unknown>;
}

/** Chair consult rollup — populated when consultation-action-loop ships. */
export interface ChairImpactBlock {
  consultCount?: number;
  materialCount?: number;
  consultedAgents: string[];
  revisions: Array<{
    agentKey: string;
    agentName: string;
    prompt: string;
    before: ThesisRevision["before"];
    after: ThesisRevision["after"];
    replyToUser?: string;
  }>;
  pmDecisionDelta?: Array<{
    ticker: string;
    before: string;
    after: string;
  }>;
}

export interface MemoPosition {
  ticker: string;
  action: FinalDecisionAction;
  opinions: CommitteeOpinion[];
  tally: { bullish: number; bearish: number; neutral: number };
  dossier?: TickerDossier | null;
  risk?: TickerRiskPipeline | null;
  artifacts?: ShiftArtifact[];
}

/** Canonical memo artifact — single source for UI, email, and exports. */
export interface MemoDocument {
  version: 1;
  runId: string;
  shiftId?: string | null;
  publishedPostId?: string | null;
  stampUtc: string;
  tickers: string[];
  positions: MemoPosition[];
  paperTrading?: PaperTradingResult | null;
  chairImpact?: ChairImpactBlock | null;
  footerNote: "ALPACA PAPER" | "PAPER ONLY";
}

export interface ChairImpactDecisionRevision {
  before: FinalDecisionAction;
  after: FinalDecisionAction;
  changed: boolean;
  reason?: string;
}

export interface ChairImpact {
  consult_count: number;
  material_count: number;
  revisions: import("./opinions").ThesisRevision[];
  debate_adjustments: {
    ticker: string;
    cohort_changes: { agent: string; from_cohort: string; to_cohort: string }[];
    confidence_deltas: { agent: string; before: number; after: number }[];
    synthetic_lines_added?: number;
  }[];
  decisions: Record<string, ChairImpactDecisionRevision>;
  propagation_errors?: string[];
}

export interface CompletePayload {
  decisions: Record<string, FinalDecisionAction> | null;
  analyst_signals: Record<string, Record<string, unknown>>;
  current_prices?: Record<string, number>;
  ticker_dossiers?: Record<string, TickerDossier>;
  risk_pipeline?: Record<string, TickerRiskPipeline>;
  paper_trading?: PaperTradingResult;
  memo_email?: MemoEmailResult;
  memo_document?: MemoDocument;
  shift_artifacts?: Record<string, ShiftArtifact[]>;
  weather_reports?: Record<string, import("./weatherReport").WeatherReport>;
  debate_rounds?: DebateRound[];
  chair_impact?: ChairImpact;
  token_usage?: ShiftTokenUsage;
}

export type RunState = "idle" | "running" | "complete" | "error";

export interface GraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface HedgeFundRequest {
  tickers: string[];
  ticker_query?: string;
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
  model_name: string;
  model_provider: string;
  initial_cash: number;
  margin_requirement: number;
  execute_alpaca_paper?: boolean;
  run_risk_pipeline?: boolean;
  send_memo_email?: boolean;
  digest_email?: string;
  api_keys?: Record<string, string>;
}

export interface BacktestRequest {
  tickers: string[];
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
  model_name: string;
  model_provider: string;
  initial_capital: number;
  margin_requirement?: number;
  start_date: string;
  end_date: string;
  api_keys?: Record<string, string>;
}

export interface ResolveTickersRequest {
  query: string;
  model_name?: string;
  model_provider?: string;
  api_keys?: Record<string, string>;
  max_tickers?: number;
}

export interface ResolveTickersResponse {
  tickers: string[];
  rationale: string;
  direct?: boolean;
}
