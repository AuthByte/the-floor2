import type { FloorLayoutMode } from "../floorLayoutMode";
import { initialFloorLayoutMode } from "../floorLayoutMode";
import { buildStackPlan } from "./buildStack";
import { buildWingsPlan } from "./buildWings";
import type { FloorPlan } from "./types";

const cache = new Map<FloorLayoutMode, FloorPlan>();

function build(mode: FloorLayoutMode): FloorPlan {
  if (!cache.has(mode)) {
    cache.set(mode, mode === "wings" ? buildWingsPlan() : buildStackPlan());
  }
  return cache.get(mode)!;
}

let activeMode: FloorLayoutMode = "stack";
let activePlan: FloorPlan = buildStackPlan();

try {
  activeMode = initialFloorLayoutMode();
  activePlan = build(activeMode);
} catch {
  /* SSR / private browsing */
}

export function getActiveFloorPlan(): FloorPlan {
  return activePlan;
}

export function getActiveFloorLayoutMode(): FloorLayoutMode {
  return activeMode;
}

export function setActiveFloorPlanMode(mode: FloorLayoutMode): FloorPlan {
  activeMode = mode;
  activePlan = build(mode);
  return activePlan;
}

export function getFloorPlan(mode: FloorLayoutMode): FloorPlan {
  return build(mode);
}
