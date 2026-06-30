import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  QUANT_ANALYSTS,
  RISK_MANAGER_ID,
  SPECIALIST_ANALYSTS,
  roomIdFor,
} from "../agents";
import {
  CONSULTATION_ID,
  DEBATE_H,
  DEBATE_ROOM_ID,
  DEBATE_W,
  GAP_H,
  PM_H,
  PM_W,
  RISK_H,
  RISK_HUB_W,
  RISK_W,
  ROOM_H,
  ROOM_W,
  RISK_RESEARCH_HUB_ID,
} from "./constants";
import type { FloorPlan, Pos, RoomBounds, Spur } from "./types";

export const PAD = 32;
export const TIER_GAP = 22;
export const RISK_PIPE_GAP = TIER_GAP;
export const RISK_COL_GAP = 28;

export function rowWidth(count: number, w = ROOM_W): number {
  return count * w + Math.max(0, count - 1) * GAP_H;
}

export function rowStart(pad: number, mainW: number, count: number, w = ROOM_W): number {
  return pad + (mainW - rowWidth(count, w)) / 2;
}

export function buildRow(
  keys: string[],
  y: number,
  startX: number,
  w = ROOM_W,
): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  keys.forEach((k, i) => {
    out[roomIdFor(k)] = { x: startX + i * (w + GAP_H), y };
  });
  return out;
}

export function makeRoomBounds(roomPos: Record<string, Pos>, roomId: string): RoomBounds | null {
  const pos = roomPos[roomId];
  if (!pos) return null;
  if (roomId === DEBATE_ROOM_ID) return { ...pos, w: DEBATE_W, h: DEBATE_H };
  if (roomId === RISK_RESEARCH_HUB_ID) return { ...pos, w: RISK_HUB_W, h: ROOM_H };
  if (roomId === RISK_MANAGER_ID) return { ...pos, w: RISK_W, h: RISK_H };
  if (roomId === PORTFOLIO_MANAGER_ID) return { ...pos, w: PM_W, h: PM_H };
  return { ...pos, w: ROOM_W, h: ROOM_H };
}

export function buildSpurs(
  roomPos: Record<string, Pos>,
  signalBusY: number,
): Spur[] {
  function spurX(agentKey: string, w = ROOM_W): number {
    const pos = roomPos[roomIdFor(agentKey)];
    return pos ? pos.x + w / 2 : 0;
  }
  function spurBottomY(agentKey: string): number {
    const pos = roomPos[roomIdFor(agentKey)];
    return pos ? pos.y + ROOM_H : 0;
  }

  return [
    ...DATA_ANALYSTS.map((a) => ({
      cx: spurX(a.key),
      fromY: spurBottomY(a.key),
      toY: signalBusY,
      dim: true,
    })),
    ...NAMED_ANALYSTS.map((a) => ({
      cx: spurX(a.key),
      fromY: spurBottomY(a.key),
      toY: signalBusY,
      dim: false,
    })),
    ...SPECIALIST_ANALYSTS.map((a) => ({
      cx: spurX(a.key),
      fromY: spurBottomY(a.key),
      toY: signalBusY,
      dim: false,
    })),
    ...QUANT_ANALYSTS.map((a) => ({
      cx: spurX(a.key),
      fromY: spurBottomY(a.key),
      toY: signalBusY,
      dim: false,
    })),
  ];
}

export function analystCounts() {
  const t1aCount = Math.ceil(NAMED_ANALYSTS.length / 2);
  const t1bCount = NAMED_ANALYSTS.length - t1aCount;
  return {
    dataCount: DATA_ANALYSTS.length,
    t1aCount,
    t1bCount,
    analysisCount: SPECIALIST_ANALYSTS.length,
    quantCount: QUANT_ANALYSTS.length,
  };
}

export function finalizePlan(
  partial: Omit<FloorPlan, "roomBounds">,
): FloorPlan {
  const roomPos = { ...partial.roomPos };
  return {
    ...partial,
    roomPos,
    roomBounds: (roomId: string) => {
      if (roomId === CONSULTATION_ID) return null;
      return makeRoomBounds(roomPos, roomId);
    },
  };
}
