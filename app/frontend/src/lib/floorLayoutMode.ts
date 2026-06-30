export type FloorLayoutMode = "stack" | "wings";

export const FLOOR_LAYOUT_STORAGE = "floor.layoutMode";

export const FLOOR_LAYOUT_META: Record<
  FloorLayoutMode,
  { label: string; short: string; description: string }
> = {
  stack: {
    label: "Stack",
    short: "stack",
    description: "Classic vertical tiers — debate chamber between legend rows.",
  },
  wings: {
    label: "Wings",
    short: "wings",
    description: "Analyst desks on the left, debate and command on the right.",
  },
};

export function initialFloorLayoutMode(): FloorLayoutMode {
  try {
    const stored = localStorage.getItem(FLOOR_LAYOUT_STORAGE);
    return stored === "wings" ? "wings" : "stack";
  } catch {
    return "stack";
  }
}

export function persistFloorLayoutMode(mode: FloorLayoutMode) {
  try {
    localStorage.setItem(FLOOR_LAYOUT_STORAGE, mode);
  } catch {
    /* ignore */
  }
}
