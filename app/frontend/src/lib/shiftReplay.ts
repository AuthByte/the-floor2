import {
  agentForRoomId,
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  SPECIALIST_ANALYSTS,
} from "./agents";
import { DEBATE_ROOM_ID } from "./layout";
import type { LogLine, RoomState, RoomStatus } from "./types";

export type ReplayPhase =
  | "tier0"
  | "tier1"
  | "specialist"
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

export const PHASE_COLORS: Record<ReplayPhase, string> = {
  tier0: "#6b9fff",
  tier1: "#e3b24b",
  specialist: "#c084fc",
  risk: "#ff4d6d",
  debate: "#f97316",
  boss: "#2fd08a",
  system: "#6b7280",
};
