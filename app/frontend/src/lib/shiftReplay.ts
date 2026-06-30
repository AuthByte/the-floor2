import {
  agentForRoomId,
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  SPECIALIST_ANALYSTS,
  QUANT_ANALYSTS,
  roomIdFor,
} from "./agents";
import { DEBATE_ROOM_ID } from "./layout";
import type { FloorPostSnapshot } from "./floorSocial/types";
import type { ShiftReplayArchive } from "./userData/types";
import type { LogLine, RoomState, RoomStatus } from "./types";

export type ReplayPhase =
  | "tier0"
  | "tier1"
  | "specialist"
  | "quant"
  | "risk"
  | "debate"
  | "boss"
  | "system";

export interface ReplayEvent {
  id: string;
  ts: number;
  roomId: string | null;
  callsign: string;
  label: string;
  ticker: string | null;
  status: string;
  signal?: string | null;
  level?: LogLine["level"];
  phase: ReplayPhase;
}

export interface ReplayRoomSnapshot {
  status: RoomStatus;
  signal?: string | null;
  message?: string;
}

const DATA_KEYS = new Set(DATA_ANALYSTS.map((a) => a.key));
const LEGEND_KEYS = new Set(NAMED_ANALYSTS.map((a) => a.key));
const SPECIALIST_KEYS = new Set(SPECIALIST_ANALYSTS.map((a) => a.key));
const QUANT_KEYS = new Set(QUANT_ANALYSTS.map((a) => a.key));
const RISK_KEYS = new Set(RISK_PIPELINE_AGENTS.map((a) => a.key));

function phaseForRoom(roomId: string): ReplayPhase {
  const agent = agentForRoomId(roomId, DEBATE_ROOM_ID);
  if (!agent) {
    if (roomId === DEBATE_ROOM_ID) return "debate";
    if (roomId === PORTFOLIO_MANAGER_ID) return "boss";
    if (roomId === RISK_MANAGER_ID) return "boss";
    return "system";
  }
  if (DATA_KEYS.has(agent.key)) return "tier0";
  if (LEGEND_KEYS.has(agent.key)) return "tier1";
  if (SPECIALIST_KEYS.has(agent.key)) return "specialist";
  if (QUANT_KEYS.has(agent.key)) return "quant";
  if (RISK_KEYS.has(agent.key)) return "risk";
  return "system";
}

function callsignFor(roomId: string): string {
  return agentForRoomId(roomId, DEBATE_ROOM_ID)?.callsign ?? roomId.slice(0, 6).toUpperCase();
}

function isNoiseStatus(status: string): boolean {
  const lower = status.toLowerCase();
  return (
    lower.includes("composing") ||
    lower.includes("generating") ||
    lower.includes("analyzing sentiment for article")
  );
}

function statusToRoomStatus(status: string, signal?: string | null): RoomStatus {
  const lower = status.toLowerCase();
  if (signal || lower === "done" || lower.includes("debate done") || lower.includes("complete")) {
    return "DONE";
  }
  if (lower === "error" || lower.startsWith("error")) return "ERROR";
  if (
    lower.includes("queued") ||
    lower.includes("offline") ||
    lower.includes("idle") ||
    lower.includes("awaiting") ||
    lower.includes("standby")
  ) {
    return "STANDBY";
  }
  return "WORKING";
}

export function buildShiftTimeline(
  rooms: Record<string, RoomState>,
  log: LogLine[],
  shiftStartTs: number,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  let id = 0;
  const seen = new Set<string>();

  const push = (e: Omit<ReplayEvent, "id">) => {
    const key = `${e.roomId ?? "sys"}|${e.ts}|${e.status}|${e.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ ...e, id: `r${id++}` });
  };

  push({
    ts: shiftStartTs,
    roomId: null,
    callsign: "SHIFT",
    label: "Shift begins — desks waking",
    ticker: null,
    status: "START",
    phase: "system",
    level: "info",
  });

  for (const [roomId, room] of Object.entries(rooms)) {
    const callsign = callsignFor(roomId);
    const phase = phaseForRoom(roomId);

    for (const h of room.history) {
      if (h.ts < shiftStartTs - 1000 || isNoiseStatus(h.status)) continue;
      push({
        ts: h.ts,
        roomId,
        callsign,
        label: h.status,
        ticker: h.ticker,
        status: h.status,
        phase,
      });
    }

    for (const th of room.thesisHistory ?? []) {
      if (th.ts < shiftStartTs - 1000) continue;
      const sig = th.signal ?? null;
      push({
        ts: th.ts,
        roomId,
        callsign,
        label: sig ? `Thesis locked · ${sig}` : "Thesis locked",
        ticker: th.ticker,
        status: "DONE",
        signal: sig,
        phase,
        level: "ok",
      });
    }
  }

  for (const line of log) {
    if (line.ts < shiftStartTs - 1000 || isNoiseStatus(line.status)) continue;
    push({
      ts: line.ts,
      roomId: line.roomId ?? null,
      callsign: line.callsign,
      label: line.status,
      ticker: line.ticker,
      status: line.status,
      phase: line.roomId ? phaseForRoom(line.roomId) : "system",
      level: line.level,
    });
  }

  if (rooms[DEBATE_ROOM_ID]?.debateRounds?.length) {
    for (const round of rooms[DEBATE_ROOM_ID].debateRounds!) {
      for (const line of round.lines) {
        push({
          ts: line.ts ?? shiftStartTs,
          roomId: DEBATE_ROOM_ID,
          callsign: "DEBATE",
          label: line.text?.slice(0, 80) ?? "Debate line",
          ticker: round.ticker,
          status: "DEBATING",
          phase: "debate",
        });
      }
    }
  }

  const endTs = Math.max(shiftStartTs, ...events.map((e) => e.ts), Date.now());
  push({
    ts: endTs + 1,
    roomId: null,
    callsign: "BOSS",
    label: "Shift complete — boss memo issued",
    ticker: null,
    status: "COMPLETE",
    phase: "boss",
    level: "ok",
  });

  return events.sort((a, b) => a.ts - b.ts);
}

export function snapshotAtTime(
  events: ReplayEvent[],
  t: number,
  roomIds: string[],
): Record<string, ReplayRoomSnapshot> {
  const out: Record<string, ReplayRoomSnapshot> = {};
  for (const rid of roomIds) {
    out[rid] = { status: "STANDBY", message: "offline" };
  }

  for (const e of events) {
    if (e.ts > t) break;
    if (!e.roomId) continue;
    const prev = out[e.roomId];
    const status = statusToRoomStatus(e.status, e.signal ?? prev?.signal);
    out[e.roomId] = {
      status,
      signal: e.signal ?? prev?.signal,
      message: e.label,
    };
  }
  return out;
}

export function eventsUpTo(events: ReplayEvent[], t: number): ReplayEvent[] {
  return events.filter((e) => e.ts <= t);
}

export function countDoneAt(snapshot: Record<string, ReplayRoomSnapshot>): number {
  return Object.values(snapshot).filter((s) => s.status === "DONE").length;
}

export function doneSparkline(
  events: ReplayEvent[],
  roomIds: string[],
  buckets = 24,
): number[] {
  if (!events.length) return [];
  const start = events[0].ts;
  const end = events[events.length - 1].ts;
  const span = Math.max(end - start, 1);
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const t = start + ((i + 1) / buckets) * span;
    out.push(countDoneAt(snapshotAtTime(events, t, roomIds)));
  }
  return out;
}

export function formatReplayClock(ts: number, startTs: number): string {
  const sec = Math.max(0, Math.floor((ts - startTs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatReplayDurationMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function replayProgress(cursor: number, startTs: number, endTs: number): number {
  const span = endTs - startTs;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (cursor - startTs) / span));
}

export interface PhaseMarker {
  phase: ReplayPhase;
  ts: number;
  label: string;
  eventId: string;
}

/** First meaningful event per pipeline phase — used for skip/jump chips. */
export function phaseMarkers(events: ReplayEvent[]): PhaseMarker[] {
  const seen = new Set<ReplayPhase>();
  const out: PhaseMarker[] = [];
  for (const e of events) {
    if (e.phase === "system") continue;
    if (seen.has(e.phase)) continue;
    seen.add(e.phase);
    out.push({
      phase: e.phase,
      ts: e.ts,
      label: e.phase,
      eventId: e.id,
    });
  }
  return out;
}

export function stepReplayCursor(
  events: ReplayEvent[],
  cursor: number,
  direction: -1 | 1,
  bounds: { startTs: number; endTs: number },
): number {
  if (!events.length) return bounds.startTs;
  if (direction > 0) {
    const next = events.find((e) => e.ts > cursor + 1);
    return next ? next.ts : bounds.endTs;
  }
  const prev = [...events].reverse().find((e) => e.ts < cursor - 1);
  return prev ? prev.ts : bounds.startTs;
}

export function nextPhaseCursor(
  _events: ReplayEvent[],
  cursor: number,
  markers: PhaseMarker[],
): number | null {
  const currentIdx = markers.findIndex((m, i) => {
    const next = markers[i + 1];
    return cursor >= m.ts && (!next || cursor < next.ts);
  });
  const target = markers[currentIdx + 1];
  return target?.ts ?? null;
}

export function prevPhaseCursor(
  _events: ReplayEvent[],
  cursor: number,
  markers: PhaseMarker[],
): number | null {
  const idx = markers.findIndex((m) => m.ts >= cursor - 1);
  if (idx <= 0) return markers[0]?.ts ?? null;
  return markers[idx - 1]?.ts ?? null;
}

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export const PHASE_LABELS: Record<ReplayPhase, string> = {
  tier0: "Data",
  tier1: "Legends",
  specialist: "Specialists",
  quant: "Quant",
  risk: "Risk",
  debate: "Debate",
  boss: "Boss",
  system: "System",
};

export const PHASE_COLORS: Record<ReplayPhase, string> = {
  tier0: "#6b9fff",
  tier1: "#e3b24b",
  specialist: "#c084fc",
  quant: "#818cf8",
  risk: "#ff4d6d",
  debate: "#f97316",
  boss: "#2fd08a",
  system: "#6b7280",
};

const TIER_ORDER: ReplayPhase[] = [
  "tier0",
  "tier1",
  "specialist",
  "quant",
  "risk",
  "debate",
  "boss",
  "system",
];

function tierRank(phase: ReplayPhase): number {
  const idx = TIER_ORDER.indexOf(phase);
  return idx >= 0 ? idx : TIER_ORDER.length;
}

/** Minimal replay timeline synthesized from a published post snapshot. */
export function buildReplayFromSnapshot(
  snapshot: FloorPostSnapshot,
  tsMs: number,
): ShiftReplayArchive {
  const events: ReplayEvent[] = [];
  let id = 0;
  const roomIdSet = new Set<string>([DEBATE_ROOM_ID, PORTFOLIO_MANAGER_ID, RISK_MANAGER_ID]);

  const push = (e: Omit<ReplayEvent, "id">) => {
    events.push({ ...e, id: `s${id++}` });
    if (e.roomId) roomIdSet.add(e.roomId);
  };

  push({
    ts: tsMs,
    roomId: null,
    callsign: "SHIFT",
    label: "Shared run — replay synthesized from snapshot",
    ticker: null,
    status: "START",
    phase: "system",
    level: "info",
  });

  const opinionRows: Array<{
    agentKey: string;
    callsign: string;
    roomId: string;
    phase: ReplayPhase;
    signal: string;
    summary: string;
    ticker: string;
  }> = [];

  const seenAgents = new Set<string>();
  for (const tickerSnap of snapshot.tickers) {
    for (const op of tickerSnap.opinions) {
      if (seenAgents.has(op.agentKey)) continue;
      seenAgents.add(op.agentKey);
      const roomId = roomIdFor(op.agentKey);
      opinionRows.push({
        agentKey: op.agentKey,
        callsign: callsignFor(roomId),
        roomId,
        phase: phaseForRoom(roomId),
        signal: op.signal,
        summary: op.summary,
        ticker: tickerSnap.ticker,
      });
    }
  }

  opinionRows.sort((a, b) => tierRank(a.phase) - tierRank(b.phase));

  const staggerMs = 4200;
  opinionRows.forEach((row, i) => {
    const eventTs = tsMs + 8000 + i * staggerMs;
    push({
      ts: eventTs,
      roomId: row.roomId,
      callsign: row.callsign,
      label: row.summary.length > 96 ? `${row.summary.slice(0, 93)}…` : row.summary,
      ticker: row.ticker,
      status: "DONE",
      signal: row.signal,
      phase: row.phase,
      level: "ok",
    });
  });

  let debateOffset = tsMs + 8000 + opinionRows.length * staggerMs + 4000;
  for (const tickerSnap of snapshot.tickers) {
    for (const round of tickerSnap.debateRounds) {
      for (const line of round.lines ?? []) {
        push({
          ts: line.ts ?? debateOffset,
          roomId: DEBATE_ROOM_ID,
          callsign: "DEBATE",
          label: line.text?.slice(0, 80) ?? round.summary ?? "Debate line",
          ticker: tickerSnap.ticker,
          status: "DEBATING",
          phase: "debate",
        });
        debateOffset += 2500;
      }
      if (round.summary) {
        push({
          ts: debateOffset,
          roomId: DEBATE_ROOM_ID,
          callsign: "DEBATE",
          label: round.summary.slice(0, 80),
          ticker: tickerSnap.ticker,
          status: "DONE",
          phase: "debate",
          level: "ok",
        });
        debateOffset += 2000;
      }
    }
  }

  const bossBase = Math.max(debateOffset, tsMs + 8000 + opinionRows.length * staggerMs + 6000);
  snapshot.tickers.forEach((t, i) => {
    if (!t.summaryLine) return;
    const action = t.summaryLine.action;
    push({
      ts: bossBase + i * 3500,
      roomId: PORTFOLIO_MANAGER_ID,
      callsign: "BOSS",
      label: `Boss memo · ${action}${t.summaryLine.confidence != null ? ` ${t.summaryLine.confidence}%` : ""}`,
      ticker: t.ticker,
      status: "COMPLETE",
      signal: action,
      phase: "boss",
      level: "ok",
    });
  });

  const endTs = Math.max(tsMs + 1, ...events.map((e) => e.ts));
  push({
    ts: endTs + 1,
    roomId: null,
    callsign: "SHIFT",
    label: "Run complete — snapshot replay end",
    ticker: null,
    status: "COMPLETE",
    phase: "system",
    level: "ok",
  });

  return {
    shiftStartedAt: tsMs,
    timeline: events.sort((a, b) => a.ts - b.ts),
    roomIds: [...roomIdSet],
    log: [],
  };
}

/** Append chair consult / propagation markers from complete payload. */
export function appendChairImpactTimeline(
  events: ReplayEvent[],
  chairImpact: import("./types").ChairImpact | undefined,
  baseTs: number,
): ReplayEvent[] {
  if (!chairImpact?.consult_count) return events;

  const out = [...events];
  let id = out.length;
  let ts = baseTs + 1;

  for (const rev of chairImpact.revisions) {
    if (!rev.prompt) continue;
    out.push({
      id: `c${id++}`,
      ts: ts++,
      roomId: null,
      callsign: "CHAIR",
      label: `Chair consult: ${rev.prompt.slice(0, 72)}`,
      ticker: null,
      status: "REVISED",
      phase: "system",
      level: "info",
    });
  }

  if (chairImpact.material_count > 0) {
    out.push({
      id: `c${id++}`,
      ts: ts++,
      roomId: null,
      callsign: "CHAIR",
      label: `Propagation · ${chairImpact.material_count} material consult(s)`,
      ticker: null,
      status: "RECONCILE",
      phase: "system",
      level: "info",
    });
  }

  for (const [ticker, dec] of Object.entries(chairImpact.decisions)) {
    if (!dec.changed) continue;
    const after = dec.after;
    out.push({
      id: `c${id++}`,
      ts: ts++,
      roomId: PORTFOLIO_MANAGER_ID,
      callsign: "BOSS",
      label: `PM revised · ${ticker} ${String(after?.action ?? "hold").toUpperCase()}`,
      ticker,
      status: "PM_REVISED",
      signal: after?.action ?? null,
      phase: "boss",
      level: "ok",
    });
  }

  return out.sort((a, b) => a.ts - b.ts);
}
