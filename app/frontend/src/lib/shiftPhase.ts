import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  SPECIALIST_ANALYSTS,
  roomIdFor,
} from "./agents";
import { DEBATE_ROOM_ID } from "./layout";
import type { RoomState, RunState } from "./types";

export type ShiftPhaseId =
  | "idle"
  | "resolving"
  | "data_feeds"
  | "risk_pipeline"
  | "legends"
  | "debate"
  | "boss"
  | "complete";

export interface ShiftPhaseStep {
  id: ShiftPhaseId;
  label: string;
  short: string;
}

export const SHIFT_PHASE_STEPS: ShiftPhaseStep[] = [
  { id: "data_feeds", label: "Data feeds", short: "T0" },
  { id: "risk_pipeline", label: "Risk pipeline", short: "Risk" },
  { id: "legends", label: "Legend floor", short: "T1" },
  { id: "debate", label: "Argument room", short: "Debate" },
  { id: "boss", label: "Boss memo", short: "Boss" },
];

function roomIds(keys: string[]): string[] {
  return keys.map((k) => roomIdFor(k));
}

function anyStatus(
  rooms: Record<string, RoomState>,
  ids: string[],
  status: RoomState["status"],
): boolean {
  return ids.some((id) => rooms[id]?.status === status);
}

function allTerminal(
  rooms: Record<string, RoomState>,
  ids: string[],
): boolean {
  if (ids.length === 0) return true;
  return ids.every((id) => {
    const s = rooms[id]?.status;
    return s === "DONE" || s === "STANDBY" || s === "ERROR";
  });
}

export function deriveShiftPhase(opts: {
  runState: RunState;
  resolvingTickers: boolean;
  rooms: Record<string, RoomState>;
  enabledAgentKeys: Set<string>;
  runRiskPipeline: boolean;
}): ShiftPhaseId {
  const { runState, resolvingTickers, rooms, enabledAgentKeys, runRiskPipeline } = opts;

  if (resolvingTickers) return "resolving";
  if (runState === "idle") return "idle";
  if (runState === "complete") return "complete";

  const dataIds = roomIds(DATA_ANALYSTS.filter((a) => enabledAgentKeys.has(a.key)).map((a) => a.key));
  const legendIds = roomIds(
    [...NAMED_ANALYSTS, ...SPECIALIST_ANALYSTS]
      .filter((a) => enabledAgentKeys.has(a.key))
      .map((a) => a.key),
  );
  const riskIds = runRiskPipeline ? RISK_PIPELINE_AGENTS.map((a) => a.key) : [];

  const bossIds = [RISK_MANAGER_ID, PORTFOLIO_MANAGER_ID];

  if (anyStatus(rooms, bossIds, "WORKING")) return "boss";
  if (rooms[DEBATE_ROOM_ID]?.status === "WORKING") return "debate";
  if (anyStatus(rooms, legendIds, "WORKING")) return "legends";
  if (anyStatus(rooms, riskIds, "WORKING")) return "risk_pipeline";
  if (anyStatus(rooms, dataIds, "WORKING")) return "data_feeds";

  if (!allTerminal(rooms, bossIds)) return "boss";
  if (rooms[DEBATE_ROOM_ID]?.status !== "DONE" && rooms[DEBATE_ROOM_ID]?.status !== "STANDBY") {
    return "debate";
  }
  if (!allTerminal(rooms, legendIds)) return "legends";
  if (runRiskPipeline && !allTerminal(rooms, riskIds)) return "risk_pipeline";
  if (!allTerminal(rooms, dataIds)) return "data_feeds";

  return "legends";
}

export function visibleShiftSteps(runRiskPipeline: boolean): ShiftPhaseStep[] {
  if (runRiskPipeline) return SHIFT_PHASE_STEPS;
  return SHIFT_PHASE_STEPS.filter((s) => s.id !== "risk_pipeline");
}

export function stepIndex(phase: ShiftPhaseId, steps: ShiftPhaseStep[]): number {
  if (phase === "idle" || phase === "resolving" || phase === "complete") return -1;
  return steps.findIndex((s) => s.id === phase);
}
