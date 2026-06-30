/**
 * Floor plan geometry — room ids, sizes, and accessors for the active layout.
 *
 * Two spatial plans (toggle on the floor):
 *   stack  — classic vertical tiers with debate between legend rows
 *   wings  — analyst desks west, debate + command east
 *
 * Use `useFloorPlan()` in React components; `roomBounds()` reads the active plan.
 */

export {
  CHAIR_PROPAGATION_ID,
  CONSULTATION_ID,
  DEBATE_H,
  DEBATE_IMG_DISP,
  DEBATE_ROOM_ID,
  DEBATE_W,
  GAP_H,
  PM_H,
  PM_W,
  RISK_FORGE_ID,
  RISK_H,
  RISK_HUB_W,
  RISK_RESEARCH_HUB_ID,
  RISK_W,
  RISK_WATCHTOWER_ID,
  ROOM_H,
  ROOM_W,
  SCENARIO_LAB_ID,
} from "./floorPlan/constants";

export type { FloorPlan, Pos, RoomBounds, Spur } from "./floorPlan/types";
export {
  getActiveFloorPlan,
  getActiveFloorLayoutMode,
  setActiveFloorPlanMode,
} from "./floorPlan/registry";
export { FloorPlanProvider, useFloorPlan } from "./floorPlan/context";

import { getActiveFloorPlan } from "./floorPlan/registry";
import type { Pos, RoomBounds } from "./floorPlan/types";

/** Canvas-space bounds for a floor room (null for virtual channels). */
export function roomBounds(roomId: string): RoomBounds | null {
  return getActiveFloorPlan().roomBounds(roomId);
}

export function getRoomPos(roomId: string): Pos | undefined {
  return getActiveFloorPlan().roomPos[roomId];
}
