/**
 * Canvas-space walk paths between investor cubicles and the argument room.
 */

import { getActiveFloorPlan } from "./floorPlan/registry";
import { ROOM_H, ROOM_W } from "./floorPlan/constants";
import { NAMED_ANALYSTS, roomIdFor } from "./agents";

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

function plan() {
  return getActiveFloorPlan();
}

function isUpperRow(agentKey: string): boolean {
  const idx = NAMED_ANALYSTS.findIndex((a) => a.key === agentKey);
  return idx >= 0 && idx < plan().t1aCount;
}

/** Spread agents across the debate floor so they don't stack. */
export function debateFloorSpot(agentKey: string): { x: number; y: number } {
  const { x: debateX, y: debateY, w: debateW, h: debateH } = plan().debate;
  const idx = NAMED_ANALYSTS.findIndex((a) => a.key === agentKey);
  const cols = 6;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const padX = debateW * 0.18;
  const padY = debateH * 0.52;
  const spanX = debateW - padX * 2;
  const spanY = debateH * 0.32;
  return {
    x: debateX + padX + ((col + 0.5) / cols) * spanX,
    y: debateY + padY + ((row % 2) + 0.5) * (spanY / 2),
  };
}

function homeSpot(agentKey: string): { x: number; y: number } {
  const id = roomIdFor(agentKey);
  const pos = plan().roomPos[id];
  const { x: debateX, y: debateY, w: debateW, h: debateH } = plan().debate;
  if (!pos) return { x: debateX + debateW / 2, y: debateY + debateH / 2 };
  const upper = isUpperRow(agentKey);
  const horizontal = plan().debateRouting === "horizontal";
  if (horizontal) {
    return {
      x: pos.x + ROOM_W * 0.62,
      y: pos.y + ROOM_H / 2,
    };
  }
  return {
    x: pos.x + ROOM_W / 2,
    y: pos.y + (upper ? ROOM_H * 0.78 : ROOM_H * 0.62),
  };
}

function cubicleDoor(agentKey: string): { x: number; y: number } {
  const id = roomIdFor(agentKey);
  const pos = plan().roomPos[id];
  const upper = isUpperRow(agentKey);
  if (plan().debateRouting === "horizontal") {
    return {
      x: pos.x + ROOM_W,
      y: pos.y + ROOM_H / 2,
    };
  }
  return {
    x: pos.x + ROOM_W / 2,
    y: pos.y + (upper ? ROOM_H : 0),
  };
}

function debateDoor(agentKey: string): { x: number; y: number } {
  const upper = isUpperRow(agentKey);
  const { x: debateX, y: debateY, w: debateW, h: debateH } = plan().debate;
  if (plan().debateRouting === "horizontal") {
    return {
      x: debateX,
      y: upper ? debateY + debateH * 0.35 : debateY + debateH * 0.65,
    };
  }
  return {
    x: debateX + debateW / 2,
    y: upper ? debateY : debateY + debateH,
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

  const { y: debateY, h: debateH } = plan().debate;
  const upper = isUpperRow(agentKey);

  let forward: { x: number; y: number }[];
  if (plan().debateRouting === "horizontal") {
    const elbowOut = { x: door.x + 28, y: door.y };
    const elbowIn = { x: corridor.x - 28, y: corridor.y };
    forward = [home, door, elbowOut, elbowIn, corridor, slot];
  } else {
    const midY = upper ? debateY - 24 : debateY + debateH + 24;
    forward = [home, door, { x: door.x, y: midY }, corridor, slot];
  }
  return reverse ? [...forward].reverse() : forward;
}

export function homePatrolWaypoints(agentKey: string): { x: number; y: number }[] {
  const id = roomIdFor(agentKey);
  const pos = plan().roomPos[id];
  if (!pos) return [homeSpot(agentKey)];
  const horizontal = plan().debateRouting === "horizontal";
  if (horizontal) {
    const cy = pos.y + ROOM_H / 2;
    return [
      { x: pos.x + ROOM_W * 0.55, y: cy },
      { x: pos.x + ROOM_W * 0.72, y: cy - 12 },
      { x: pos.x + ROOM_W * 0.72, y: cy + 12 },
      { x: pos.x + ROOM_W * 0.45, y: cy },
    ];
  }
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
