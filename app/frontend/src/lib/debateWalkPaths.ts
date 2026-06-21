/**
 * Canvas-space walk paths between investor cubicles and the argument room.
 */

import {
  DEBATE_H,
  DEBATE_W,
  DEBATE_X,
  DEBATE_Y,
  ROOM_H,
  ROOM_POS,
  ROOM_W,
} from "./layout";
import { NAMED_ANALYSTS, roomIdFor } from "./agents";

const T1A_COUNT = Math.ceil(NAMED_ANALYSTS.length / 2);

export type TravelPhase = "home" | "to_debate" | "at_debate" | "to_home";

export function agentTravelPhase(
  agentState: { message: string; status: string },
  debateState: { message: string; status: string },
): TravelPhase {
  const dm = debateState.message.toLowerCase();
  const am = agentState.message.toLowerCase();

  const debateOver =
    dm.includes("debate closed") ||
    dm.includes("chamber idle") ||
    debateState.status === "DONE";

  if (debateOver) {
    if (am.includes("debate done")) return "to_home";
    return "home";
  }

  if (am.includes("debating in chamber")) return "at_debate";

  if (
    dm.includes("chamber open") ||
    dm.includes("speaking") ||
    dm.includes("finished") ||
    debateState.status === "WORKING"
  ) {
    return "to_debate";
  }

  return "home";
}

function isUpperRow(agentKey: string): boolean {
  const idx = NAMED_ANALYSTS.findIndex((a) => a.key === agentKey);
  return idx >= 0 && idx < T1A_COUNT;
}

/** Spread agents across the debate floor so they don't stack. */
export function debateFloorSpot(agentKey: string): { x: number; y: number } {
  const idx = NAMED_ANALYSTS.findIndex((a) => a.key === agentKey);
  const cols = 6;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const padX = DEBATE_W * 0.18;
  const padY = DEBATE_H * 0.52;
  const spanX = DEBATE_W - padX * 2;
  const spanY = DEBATE_H * 0.32;
  return {
    x: DEBATE_X + padX + ((col + 0.5) / cols) * spanX,
    y: DEBATE_Y + padY + ((row % 2) + 0.5) * (spanY / 2),
  };
}

function homeSpot(agentKey: string): { x: number; y: number } {
  const id = roomIdFor(agentKey);
  const pos = ROOM_POS[id];
  if (!pos) return { x: DEBATE_X + DEBATE_W / 2, y: DEBATE_Y + DEBATE_H / 2 };
  const upper = isUpperRow(agentKey);
  return {
    x: pos.x + ROOM_W / 2,
    y: pos.y + (upper ? ROOM_H * 0.78 : ROOM_H * 0.62),
  };
}

function cubicleDoor(agentKey: string): { x: number; y: number } {
  const id = roomIdFor(agentKey);
  const pos = ROOM_POS[id];
  const upper = isUpperRow(agentKey);
  return {
    x: pos.x + ROOM_W / 2,
    y: pos.y + (upper ? ROOM_H : 0),
  };
}

function debateDoor(agentKey: string): { x: number; y: number } {
  const upper = isUpperRow(agentKey);
  return {
    x: DEBATE_X + DEBATE_W / 2,
    y: upper ? DEBATE_Y : DEBATE_Y + DEBATE_H,
  };
}

/** Full canvas path cubicle → argument room (or reverse). */
export function buildDebatePath(
  agentKey: string,
  reverse = false,
): { x: number; y: number }[] {
  const home = homeSpot(agentKey);
  const door = cubicleDoor(agentKey);
  const corridor = debateDoor(agentKey);
  const slot = debateFloorSpot(agentKey);

  const upper = isUpperRow(agentKey);
  const midY = upper
    ? DEBATE_Y - 24
    : DEBATE_Y + DEBATE_H + 24;

  const forward = [home, door, { x: door.x, y: midY }, corridor, slot];
  return reverse ? [...forward].reverse() : forward;
}

export function homePatrolWaypoints(agentKey: string): { x: number; y: number }[] {
  const id = roomIdFor(agentKey);
  const pos = ROOM_POS[id];
  if (!pos) return [homeSpot(agentKey)];
  const cx = pos.x + ROOM_W / 2;
  const cy = pos.y + ROOM_H * 0.72;
  return [
    { x: cx, y: cy },
    { x: pos.x + ROOM_W * 0.35, y: pos.y + ROOM_H * 0.8 },
    { x: pos.x + ROOM_W * 0.65, y: pos.y + ROOM_H * 0.8 },
    { x: cx, y: pos.y + ROOM_H * 0.6 },
  ];
}

export function debatePatrolWaypoints(agentKey: string): { x: number; y: number }[] {
  const slot = debateFloorSpot(agentKey);
  return [
    slot,
    { x: slot.x - 18, y: slot.y + 8 },
    { x: slot.x + 18, y: slot.y + 8 },
    { x: slot.x, y: slot.y - 10 },
  ];
}
