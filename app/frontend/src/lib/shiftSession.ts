import {
  ANALYSTS,
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  QUANT_ANALYSTS,
  RISK_MANAGER,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  SPECIALIST_ANALYSTS,
  roomIdFor,
} from "./agents";
import { applyRoomProgress } from "./applyRoomProgress";
import type { StreamHandlers } from "./api";
import type { ShiftArchiveInput } from "./floorSocial/types";
import { buildPostSnapshot } from "./floorSocial/buildPostSnapshot";
import { CONSULTATION_ID, DEBATE_ROOM_ID } from "./layout";
import { resolveProgressRoomId } from "./progressRoomId";
import { parseSummaryFromDecisions } from "./shiftLedger";
import {
  buildDigestCaptionRich,
  checkAutoPublishWatchlists,
} from "./watchlistDigest";
import type { WatchlistPreset } from "./watchlists";
import type {
  CompletePayload,
  LogLine,
  RoomState,
} from "./types";

function makeIdleRoom(): RoomState {
  return {
    status: "STANDBY",
    ticker: null,
    message: "offline",
    analysis: null,
    updatedAt: 0,
    history: [],
    verdict: null,
  };
}

export function buildInitialRooms(): Record<string, RoomState> {
  const map: Record<string, RoomState> = {};
  for (const a of ANALYSTS) map[roomIdFor(a.key)] = makeIdleRoom();
  map[DEBATE_ROOM_ID] = {
    ...makeIdleRoom(),
    message: "chamber idle",
    debateFeed: [],
    debateRounds: [],
    activeDebateTicker: null,
  };
  map[CONSULTATION_ID] = { ...makeIdleRoom(), message: "no consults", consultations: [] };
  for (const a of RISK_PIPELINE_AGENTS) {
    map[a.key] = { ...makeIdleRoom(), message: "pipeline idle" };
  }
  map[PORTFOLIO_MANAGER_ID] = makeIdleRoom();
  map[RISK_MANAGER_ID] = makeIdleRoom();
  return map;
}

export interface AutoPublishDigestInput {
  shift: ShiftArchiveInput;
  caption: string;
  watchlist: WatchlistPreset;
}

export const MAX_SHELVED_RUNS = 2;

export type ShiftSessionStatus = "running" | "complete" | "error";

export interface ShiftSession {
  shelfId: string;
  runId: string | null;
  label: string;
  startedAt: number;
  status: ShiftSessionStatus;
  rooms: Record<string, RoomState>;
  log: LogLine[];
  decisions: CompletePayload | null;
  errorMsg: string | null;
  shiftTickers: string[];
  meta: { model: string; analystCount: number };
  abort: (() => void) | null;
}

export function snapshotSession(session: ShiftSession): ShiftSession {
  return {
    ...session,
    rooms: { ...session.rooms },
    log: [...session.log],
    shiftTickers: [...session.shiftTickers],
    meta: { ...session.meta },
  };
}

export function newShelfId(): string {
  return `shelf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildRunningRooms(
  enabled: Set<string>,
  runRiskPipeline: boolean,
): Record<string, RoomState> {
  const fresh = buildInitialRooms();
  const dataFeedOn = DATA_ANALYSTS.some((a) => enabled.has(a.key));

  for (const a of ANALYSTS) {
    const id = roomIdFor(a.key);
    if (enabled.has(a.key)) {
      const isLegend = NAMED_ANALYSTS.some((n) => n.key === a.key);
      const isSpecialist = SPECIALIST_ANALYSTS.some((n) => n.key === a.key);
      const isQuant = QUANT_ANALYSTS.some((n) => n.key === a.key);
      fresh[id] = {
        ...fresh[id],
        status: "STANDBY",
        message:
          isLegend && dataFeedOn
            ? "awaiting tier-0 feeds"
            : isSpecialist
              ? "awaiting legend floor"
              : isQuant
                ? "awaiting analysis desks"
                : "queued",
        ticker: null,
        analysis: null,
        history: [],
      };
    } else {
      fresh[id] = {
        ...fresh[id],
        status: "STANDBY",
        message: "offline",
        ticker: null,
        analysis: null,
      };
    }
  }

  fresh[PORTFOLIO_MANAGER_ID] = {
    ...fresh[PORTFOLIO_MANAGER_ID],
    status: "STANDBY",
    message: "queued",
    ticker: null,
    analysis: null,
    history: [],
  };
  fresh[RISK_MANAGER_ID] = {
    ...fresh[RISK_MANAGER_ID],
    status: "STANDBY",
    message: "queued",
    ticker: null,
    analysis: null,
    history: [],
  };
  fresh[DEBATE_ROOM_ID] = {
    ...fresh[DEBATE_ROOM_ID],
    status: "STANDBY",
    message: "awaiting analysts",
    ticker: null,
    analysis: null,
    debateFeed: [],
    debateRounds: [],
    activeDebateTicker: null,
    history: [],
  };
  for (const a of RISK_PIPELINE_AGENTS) {
    fresh[a.key] = {
      ...fresh[a.key],
      status: "STANDBY",
      message: runRiskPipeline ? "queued" : "skipped",
      ticker: null,
      analysis: null,
      history: [],
    };
  }
  return fresh;
}

const ALL_AGENTS_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const a of ANALYSTS) map[roomIdFor(a.key)] = a.callsign;
  map[PORTFOLIO_MANAGER_ID] = PORTFOLIO_MANAGER.callsign;
  map[RISK_MANAGER_ID] = RISK_MANAGER.callsign;
  map[DEBATE_ROOM_ID] = "DEBATE";
  map["macro_feed"] = "MACRO";
  map["system"] = "SYS";
  map["paper_desk"] = "PAPER";
  map[CONSULTATION_ID] = "MAIL";
  return map;
})();

function callsignFor(agentId: string): string {
  return ALL_AGENTS_BY_ID[agentId] ?? agentId.slice(0, 6).toUpperCase();
}

interface SessionBuffers {
  pendingRoom: Record<
    string,
    { payload: Parameters<typeof applyRoomProgress>[1]; tickerSet: Set<string> }
  >;
  lastLogStatus: Record<string, string>;
  pendingLog: Omit<LogLine, "id">[];
  flushRaf: number | null;
  logId: number;
}

function createBuffers(): SessionBuffers {
  return {
    pendingRoom: {},
    lastLogStatus: {},
    pendingLog: [],
    flushRaf: null,
    logId: 0,
  };
}

export interface ShiftStreamHandlerDeps {
  session: ShiftSession;
  buffers: SessionBuffers;
  tickerSet: Set<string>;
  tickerList: string[];
  startedAt: number;
  isDiscarded: () => boolean;
  onSessionChange: (session: ShiftSession) => void;
  onShelvedComplete?: (session: ShiftSession) => void;
  onPaywall?: (payload: import("./entitlements").PaywallPayload) => void;
  onAutoPublishDigest?: (input: AutoPublishDigestInput) => Promise<void>;
  watchlists?: WatchlistPreset[];
  hasUserSession?: boolean;
  getLastDigestRunTs?: (watchlistId: string) => number;
  setLastDigestRunTs?: (watchlistId: string, ts: number) => void;
}

export function createShiftStreamHandlers(deps: ShiftStreamHandlerDeps): StreamHandlers {
  const { session, buffers, tickerSet, tickerList, startedAt } = deps;

  const flushPatches = () => {
    if (deps.isDiscarded()) return;

    const batch = buffers.pendingRoom;
    buffers.pendingRoom = {};
    let rooms = session.rooms;

    if (Object.keys(batch).length > 0) {
      let next: Record<string, RoomState> | null = null;
      for (const [agent, { payload, tickerSet: ts }] of Object.entries(batch)) {
        const cur = (next ?? rooms)[agent];
        if (!cur) continue;
        const updated = applyRoomProgress(cur, payload, ts);
        if (updated === cur) continue;
        if (!next) next = { ...rooms };
        next[agent] = updated;
      }
      if (next) {
        rooms = next;
        session.rooms = rooms;
      }
    }

    if (buffers.pendingLog.length > 0) {
      const batchLog = buffers.pendingLog;
      buffers.pendingLog = [];
      const nextLog = [...session.log];
      for (const line of batchLog) {
        nextLog.push({ ...line, id: `l${++buffers.logId}` });
      }
      session.log = nextLog.length > 400 ? nextLog.slice(-400) : nextLog;
    }

    deps.onSessionChange(snapshotSession(session));
  };

  const scheduleFlush = () => {
    if (buffers.flushRaf != null) return;
    buffers.flushRaf = requestAnimationFrame(() => {
      buffers.flushRaf = null;
      flushPatches();
    });
  };

  const pushLog = (line: Omit<LogLine, "id">) => {
    if (deps.isDiscarded()) return;
    buffers.pendingLog.push(line);
    scheduleFlush();
  };

  const scheduleRoomPatch = (
    agent: string,
    payload: Parameters<typeof applyRoomProgress>[1],
    ts: Set<string>,
  ) => {
    if (deps.isDiscarded()) return;
    buffers.pendingRoom[agent] = { payload, tickerSet: ts };
    scheduleFlush();
  };

  const runIdRef = { current: null as string | null };

  return {
    onStart: (runId) => {
      if (deps.isDiscarded()) return;
      runIdRef.current = runId;
      session.runId = runId;
      pushLog({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status: "shift starting…",
        level: "info",
      });
    },
    onPaywall: (payload) => {
      if (deps.isDiscarded()) return;
      deps.onPaywall?.(payload);
      pushLog({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status: `blocked :: ${payload.message}`,
        level: "warn",
      });
      flushPatches();
      deps.onSessionChange(snapshotSession(session));
    },
    onProgress: ({
      agent,
      ticker,
      status,
      analysis,
      timestamp,
      signal,
      confidence,
      thesis_summary,
      token_usage,
    }) => {
      if (deps.isDiscarded()) return;

      const ts = timestamp ? Date.parse(timestamp) : Date.now();
      const roomId = resolveProgressRoomId(agent);
      scheduleRoomPatch(
        roomId,
        {
          agent,
          ticker,
          status,
          analysis,
          timestamp,
          signal,
          confidence,
          thesis_summary,
          token_usage,
        },
        tickerSet,
      );

      const prevStatus = buffers.lastLogStatus[agent];
      if (prevStatus === status) return;
      buffers.lastLogStatus[agent] = status;

      const consultReply = agent === CONSULTATION_ID && status.includes('":');
      pushLog({
        ts,
        callsign: callsignFor(agent),
        roomId: agent,
        ticker,
        status,
        level:
          status.toLowerCase() === "done"
            ? "ok"
            : status.toLowerCase().startsWith("error") || status.toLowerCase().includes("error —")
              ? "err"
              : consultReply
                ? "ok"
                : agent === CONSULTATION_ID && status.toLowerCase().includes("consult")
                  ? "warn"
                  : "info",
      });
    },
    onComplete: (data) => {
      if (deps.isDiscarded()) return;
      if (buffers.flushRaf != null) {
        cancelAnimationFrame(buffers.flushRaf);
        buffers.flushRaf = null;
      }
      flushPatches();

      session.decisions = data;
      session.status = "complete";
      session.errorMsg = null;

      let rooms = session.rooms;
      let next: Record<string, RoomState> | null = null;
      for (const k of Object.keys(rooms)) {
        const cur = rooms[k];
        if (cur.message === "offline") continue;
        if (cur.status === "WORKING" || cur.status === "STANDBY") {
          if (!next) next = { ...rooms };
          next[k] = { ...cur, status: "DONE", message: "complete" };
        }
      }
      const agents = data.token_usage?.agents;
      if (agents && Object.keys(agents).length > 0) {
        if (!next) next = { ...rooms };
        for (const [agentKey, usage] of Object.entries(agents)) {
          const roomId = resolveProgressRoomId(agentKey);
          const cur = next[roomId];
          if (!cur) continue;
          next[roomId] = { ...cur, tokenUsage: usage };
        }
      }
      if (next) session.rooms = next;

      const paper = data.paper_trading;
      const mail = data.memo_email;
      let status = paper?.enabled
        ? "shift complete. boss memo + Alpaca paper orders sent."
        : paper?.skipped_reason
          ? `shift complete. Alpaca skipped: ${paper.skipped_reason}`
          : "shift complete. boss issued decisions.";
      if (mail?.enabled) {
        status = mail.sent
          ? `${status} Memo emailed to ${mail.to}.`
          : `${status} Memo email failed: ${mail.error ?? "unknown"}.`;
      }
      pushLog({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status,
        level:
          (paper && !paper.enabled && paper.skipped_reason) ||
          (mail?.enabled && !mail.sent)
            ? "warn"
            : "ok",
      });

      flushPatches();

      if (
        deps.hasUserSession &&
        deps.onAutoPublishDigest &&
        deps.watchlists?.length
      ) {
        const match = checkAutoPublishWatchlists(
          deps.watchlists,
          tickerList,
          (id) => deps.getLastDigestRunTs?.(id) ?? 0,
        );
        if (match) {
          const summary = parseSummaryFromDecisions(data.decisions ?? null);
          const shift: ShiftArchiveInput = {
            id: `auto-${startedAt}`,
            ts: session.startedAt,
            runId: runIdRef.current,
            tickers: tickerList,
            model: session.meta.model,
            analystCount: session.meta.analystCount,
            summary,
            decisions: data.decisions ?? null,
            prices: data.current_prices ?? null,
            payload: data,
          };
          const snapshot = buildPostSnapshot(shift);
          const caption = buildDigestCaptionRich(match, tickerList, summary, snapshot);
          void deps
            .onAutoPublishDigest({ shift, caption, watchlist: match })
            .then(() => deps.setLastDigestRunTs?.(match.id, Date.now()))
            .catch(() => {
              /* parent handles errors */
            });
        }
      }

      deps.onSessionChange(snapshotSession(session));
      if (deps.onShelvedComplete) {
        deps.onShelvedComplete(snapshotSession(session));
      }
    },
    onError: (msg) => {
      if (deps.isDiscarded()) return;
      session.errorMsg = msg;
      session.status = "error";

      const out: Record<string, RoomState> = { ...session.rooms };
      for (const k of Object.keys(out)) {
        if (out[k].status === "WORKING" || out[k].analysis) {
          out[k] = {
            ...out[k],
            status: "ERROR",
            message: "shift aborted",
            analysis: null,
          };
        }
      }
      session.rooms = out;

      pushLog({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status: `error :: ${msg}`,
        level: "err",
      });
      flushPatches();
      deps.onSessionChange(snapshotSession(session));
    },
  };
}

export interface ShiftSessionRuntime {
  session: ShiftSession;
  buffers: SessionBuffers;
  discarded: boolean;
  tickerSet: Set<string>;
  tickerList: string[];
}

export function commitBootstrapLogs(runtime: ShiftSessionRuntime): ShiftSession {
  if (runtime.buffers.pendingLog.length === 0) return snapshotSession(runtime.session);
  const batch = runtime.buffers.pendingLog;
  runtime.buffers.pendingLog = [];
  const nextLog = [...runtime.session.log];
  for (const line of batch) {
    nextLog.push({ ...line, id: `l${++runtime.buffers.logId}` });
  }
  runtime.session.log = nextLog.length > 400 ? nextLog.slice(-400) : nextLog;
  return snapshotSession(runtime.session);
}

export function createShiftSessionRuntime(opts: {
  shelfId: string;
  label: string;
  tickerList: string[];
  model: string;
  analystCount: number;
  startedAt: number;
  rooms: Record<string, RoomState>;
  abort?: (() => void) | null;
}): ShiftSessionRuntime {
  return {
    session: {
      shelfId: opts.shelfId,
      runId: null,
      label: opts.label,
      startedAt: opts.startedAt,
      status: "running",
      rooms: opts.rooms,
      log: [],
      decisions: null,
      errorMsg: null,
      shiftTickers: opts.tickerList,
      meta: { model: opts.model, analystCount: opts.analystCount },
      abort: opts.abort ?? null,
    },
    buffers: createBuffers(),
    discarded: false,
    tickerSet: new Set(opts.tickerList),
    tickerList: opts.tickerList,
  };
}

export function sessionToRunState(status: ShiftSessionStatus): "idle" | "running" | "complete" | "error" {
  if (status === "running") return "running";
  if (status === "complete") return "complete";
  if (status === "error") return "error";
  return "idle";
}

export function applySessionToFloorState(session: ShiftSession): {
  rooms: Record<string, RoomState>;
  log: LogLine[];
  runState: ReturnType<typeof sessionToRunState>;
  errorMsg: string | null;
  decisions: CompletePayload | null;
  shiftTickers: string[];
  shiftStartedAt: number | null;
  shiftRunId: string | null;
} {
  return {
    rooms: { ...session.rooms },
    log: [...session.log],
    runState: sessionToRunState(session.status),
    errorMsg: session.errorMsg,
    decisions: session.decisions,
    shiftTickers: [...session.shiftTickers],
    shiftStartedAt: session.startedAt,
    shiftRunId: session.runId,
  };
}
