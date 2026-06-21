import { CONSULTATION_ID, DEBATE_ROOM_ID, RISK_RESEARCH_HUB_ID, SCENARIO_LAB_ID, RISK_FORGE_ID, RISK_WATCHTOWER_ID } from "./layout";
import { parseOutlookFromAnalysis } from "./outlookFormat";
import { displayThesisText, extractSignal } from "./thesisText";
import type {
  ConsultationMessage,
  DebateRound,
  RoomState,
  RoomVerdict,
} from "./types";

export interface ProgressPayload {
  agent: string;
  ticker: string | null;
  status: string;
  analysis: string | null;
  timestamp?: string | null;
  signal?: string | null;
  confidence?: number | null;
  thesis_summary?: string | null;
}

function normalizeSignal(s: string | null | undefined): RoomVerdict["signal"] {
  const v = (s ?? "").toLowerCase();
  if (v === "bullish" || v === "bearish" || v === "neutral") return v;
  return "neutral";
}

function mergeVerdict(
  cur: RoomState,
  payload: ProgressPayload,
  tickerChanged: boolean,
  tickerOutOfShift: boolean,
): RoomVerdict | null | undefined {
  if (tickerChanged || tickerOutOfShift) return null;
  const outlook = parseOutlookFromAnalysis(payload.analysis);
  const hasMeta =
    payload.signal != null ||
    payload.confidence != null ||
    payload.thesis_summary != null ||
    outlook.time_horizon_months != null ||
    outlook.price_target != null;
  if (!hasMeta) return cur.verdict;
  const prev = cur.verdict;
  return {
    signal: normalizeSignal(payload.signal ?? prev?.signal),
    confidence:
      payload.confidence != null
        ? Number(payload.confidence)
        : (prev?.confidence ?? 0),
    summary: payload.thesis_summary ?? prev?.summary ?? "",
    timeHorizonMonths:
      outlook.time_horizon_months ?? prev?.timeHorizonMonths,
    priceTarget: outlook.price_target ?? prev?.priceTarget,
    upsidePct: outlook.upside_pct ?? prev?.upsidePct,
  };
}

const ANALYSIS_THROTTLE_MS = 400;

/** Per-agent throttle for streaming thesis text. */
const lastAnalysisFlush: Record<string, number> = {};

export function applyRoomProgress(
  cur: RoomState,
  payload: ProgressPayload,
  tickerSet: Set<string>,
): RoomState {
  const { agent, ticker, status, analysis } = payload;
  const ts = payload.timestamp ? Date.parse(payload.timestamp) : Date.now();
  const lower = status.toLowerCase();
  const composing =
    lower.includes("composing") || lower.includes("generating");
  const debating = lower.includes("debating") || lower.includes("speaking");
  const thesisDone = lower === "done";
  const debateDone = lower.includes("debate done");
  const isDone = thesisDone || debateDone || lower.includes("debate closed");

  const tickerChanged =
    ticker != null && cur.ticker != null && ticker !== cur.ticker;
  const tickerOutOfShift =
    ticker != null && !tickerSet.has(ticker.toUpperCase());

  let debateFeed = cur.debateFeed ?? [];
  let debateRounds = cur.debateRounds ?? [];
  let activeDebateTicker = cur.activeDebateTicker ?? null;
  let consultations = cur.consultations ?? [];

  if (agent === CONSULTATION_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as {
        messages?: ConsultationMessage[];
      };
      if (parsed.messages) consultations = parsed.messages;
    } catch {
      /* keep prior */
    }
  }

  let riskSubagents = cur.riskSubagents ?? [];
  let riskReports = cur.riskReports ?? [];
  let riskInventory = cur.riskInventory ?? [];
  let riskScenarios = cur.riskScenarios ?? [];
  let riskMonitoring = cur.riskMonitoring ?? {};
  let subagents = cur.subagents ?? [];
  let subagentResults = cur.subagentResults ?? [];

  if (analysis) {
    try {
      const parsed = JSON.parse(analysis) as {
        subagents?: typeof subagents;
        subagent_results?: typeof subagentResults;
      };
      if (parsed.subagents) subagents = parsed.subagents;
      if (parsed.subagent_results) subagentResults = parsed.subagent_results;
    } catch {
      /* not sub-agent JSON */
    }
  }

  if (agent === RISK_RESEARCH_HUB_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as {
        subagents?: typeof riskSubagents;
        reports?: typeof riskReports;
      };
      if (parsed.subagents) riskSubagents = parsed.subagents;
      if (parsed.reports) riskReports = parsed.reports;
    } catch {
      /* keep prior */
    }
  }

  if (agent === RISK_FORGE_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as { inventory?: typeof riskInventory };
      if (parsed.inventory) riskInventory = parsed.inventory;
    } catch {
      /* keep prior */
    }
  }

  if (agent === SCENARIO_LAB_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as { scenarios?: typeof riskScenarios };
      if (parsed.scenarios) riskScenarios = parsed.scenarios;
    } catch {
      /* keep prior */
    }
  }

  if (agent === RISK_WATCHTOWER_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as { monitoring?: typeof riskMonitoring };
      if (parsed.monitoring) riskMonitoring = parsed.monitoring;
    } catch {
      /* keep prior */
    }
  }

  if (agent === DEBATE_ROOM_ID && analysis) {
    try {
      const parsed = JSON.parse(analysis) as {
        rounds?: DebateRound[];
        active_ticker?: string | null;
      };
      if (parsed.rounds) {
        debateRounds = parsed.rounds.map((r) => ({
          ...r,
          lines: (r.lines ?? []).map((ln, i) => ({
            ...ln,
            ts: ln.ts ?? ts + i,
          })),
        }));
        activeDebateTicker = parsed.active_ticker ?? null;
        const active =
          debateRounds.find((r) => r.ticker === activeDebateTicker) ??
          debateRounds[debateRounds.length - 1];
        debateFeed = active?.lines ?? [];
      }
    } catch {
      /* keep prior */
    }
  }

  let nextAnalysis: string | null = cur.analysis;
  if (analysis != null) {
    const now = Date.now();
    const last = lastAnalysisFlush[agent] ?? 0;
    if (composing && now - last < ANALYSIS_THROTTLE_MS && cur.analysis) {
      /* keep cur.analysis */
    } else {
      if (composing) lastAnalysisFlush[agent] = now;
      nextAnalysis = analysis;
    }
  } else if (tickerChanged || tickerOutOfShift) {
    nextAnalysis = null;
  } else if (lower.includes("debating in chamber")) {
    nextAnalysis = null;
  } else if ((composing || debating) && cur.analysis) {
    /* keep */
  } else if (debateDone) {
    /* keep pre-debate thesis in the room panel */
    nextAnalysis = cur.analysis;
  } else if (
    thesisDone ||
    lower.includes("fetching") ||
    lower.includes("analyzing")
  ) {
    nextAnalysis = thesisDone ? analysis ?? cur.analysis : null;
  }

  const verdict = mergeVerdict(cur, payload, tickerChanged, tickerOutOfShift);

  const skipHistory = composing || lower.includes("generating");
  let thesisHistory = cur.thesisHistory ?? [];
  if (thesisDone && nextAnalysis) {
    const historyText =
      payload.thesis_summary?.trim() ||
      displayThesisText(nextAnalysis).trim() ||
      nextAnalysis;
    thesisHistory = [
      ...thesisHistory.slice(-11),
      {
        ts,
        ticker: tickerOutOfShift ? cur.ticker : ticker ?? cur.ticker,
        status: "DONE",
        analysis: historyText,
        signal:
          payload.signal != null
            ? String(payload.signal)
            : extractSignal(nextAnalysis),
      },
    ];
  }

  return {
    ...cur,
    ticker: tickerOutOfShift ? cur.ticker : ticker ?? cur.ticker,
    message: status,
    analysis: nextAnalysis,
    updatedAt: ts,
    debateFeed: agent === DEBATE_ROOM_ID ? debateFeed : cur.debateFeed,
    debateRounds: agent === DEBATE_ROOM_ID ? debateRounds : cur.debateRounds,
    activeDebateTicker:
      agent === DEBATE_ROOM_ID ? activeDebateTicker : cur.activeDebateTicker,
    consultations:
      agent === CONSULTATION_ID ? consultations : cur.consultations,
    riskSubagents:
      agent === RISK_RESEARCH_HUB_ID ? riskSubagents : cur.riskSubagents,
    riskReports: agent === RISK_RESEARCH_HUB_ID ? riskReports : cur.riskReports,
    riskInventory: agent === RISK_FORGE_ID ? riskInventory : cur.riskInventory,
    riskScenarios: agent === SCENARIO_LAB_ID ? riskScenarios : cur.riskScenarios,
    riskMonitoring:
      agent === RISK_WATCHTOWER_ID ? riskMonitoring : cur.riskMonitoring,
    subagents: subagents.length ? subagents : cur.subagents,
    subagentResults: subagentResults.length ? subagentResults : cur.subagentResults,
    thesisHistory,
    verdict: verdict === undefined ? cur.verdict : verdict,
    status:
      isDone
        ? "DONE"
        : lower === "error" || lower.startsWith("error")
          ? "ERROR"
          : lower.includes("queued") ||
              lower.includes("offline") ||
              lower.includes("awaiting") ||
              lower.includes("chamber idle")
            ? "STANDBY"
            : "WORKING",
    history: skipHistory
      ? cur.history
      : [...cur.history.slice(-12), { ts, ticker, status }],
  };
}

export function clearAnalysisThrottle(): void {
  for (const k of Object.keys(lastAnalysisFlush)) delete lastAnalysisFlush[k];
}
