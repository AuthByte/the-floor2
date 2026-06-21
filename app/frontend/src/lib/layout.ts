/**
 * Floor plan geometry — all sizes in px, canvas coordinate space.
 *
 * Layout (top → bottom, main column):
 *   TIER 0 (data feeds):   6 rooms  — single row
 *   TIER 1A (legends):     first half of named investors — single row
 *   ARGUMENT ROOM:         centered in the gap between the two legend rows
 *   TIER 1B (legends):     second half — single row
 *   FURTHER ANALYSIS:      specialist desks — single row
 *   TIER 2 (risk gate):    1 room   — centered
 *   TIER 3 (boss office):  1 room   — centered, wider
 *
 * Risk discovery pipeline (right column, top → bottom):
 *   Forge → Research Hub → Scenario Lab → Watchtower
 *
 * The argument room is sandwiched between the two legend rows on purpose:
 * upper-row analysts walk DOWN through its north door, lower-row analysts walk
 * UP through its south door (see debateWalkPaths.ts). That choreography is why
 * the two legend rows straddle the chamber rather than stacking.
 *
 * Everything here is deliberately compact so the whole floor fits a normal
 * viewport at fit-view without clamping the zoom — see usePanZoom MIN_SCALE.
 */

import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  SPECIALIST_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  roomIdFor,
} from "./agents";

// ─── Room sizes ────────────────────────────────────────────────────────────
// Analyst rooms are square (the art is a hex inscribed in a 1024×1024 square).
export const ROOM_W = 240;
export const ROOM_H = 240;
export const RISK_W = 360;
export const RISK_H = 200;
export const PM_W   = 460;
export const PM_H   = 240;

/** Central argument / debate chamber between investor rows. */
export const DEBATE_W = 520;
export const DEBATE_H = 280;
export const DEBATE_ROOM_ID = "argument_room";
/** Synthetic channel that carries pre-debate consultation envelopes. */
export const CONSULTATION_ID = "consultation";

/** Horizontal gap between adjacent rooms in a row. */
export const GAP_H = 8;

/** Risk discovery pipeline rooms (synthetic graph nodes). */
export const RISK_FORGE_ID = "risk_forge";
export const RISK_RESEARCH_HUB_ID = "risk_research_hub";
export const SCENARIO_LAB_ID = "scenario_lab";
export const RISK_WATCHTOWER_ID = "risk_watchtower";
export const RISK_HUB_W = ROOM_W * 2 + GAP_H;
/** Hex art display size inside the debate slot (square, centered). */
export const DEBATE_IMG_DISP = DEBATE_H;

// ─── Spacing ────────────────────────────────────────────────────────────────
/** Vertical gap between a tier and the next (tier-0→1A, 1B→risk, …). */
const TIER_GAP        = 22;
/** Vertical gap between tier-1A and tier-1B — sized to seat the argument room. */
const ROW_GAP         = DEBATE_H + 16;
/** Vertical gap between risk-pipeline stages on the side column. */
const RISK_PIPE_GAP = TIER_GAP;
/** Horizontal gap between main floor and risk-pipeline column. */
const RISK_COL_GAP = 28;

// Tier 1 row splits stay balanced as the named investor roster grows.
const T1A_COUNT = Math.ceil(NAMED_ANALYSTS.length / 2);
const T1B_COUNT = NAMED_ANALYSTS.length - T1A_COUNT;
const ANALYSIS_COUNT = SPECIALIST_ANALYSTS.length;
const PAD             = 32;   // canvas outer padding

function rowWidth(count: number, w = ROOM_W): number {
  return count * w + Math.max(0, count - 1) * GAP_H;
}

// Main floor width (excludes the side risk-pipeline column).
const MAIN_W = rowWidth(Math.max(6, T1A_COUNT, T1B_COUNT, ANALYSIS_COUNT));
const RISK_COL_W = RISK_HUB_W;
export const RISK_COL_X = PAD + MAIN_W + RISK_COL_GAP;

// ─── Canvas ─────────────────────────────────────────────────────────────────
export const CANVAS_W = PAD + MAIN_W + RISK_COL_GAP + RISK_COL_W + PAD;

// ─── Tier Y origins ─────────────────────────────────────────────────────────
export const T0_Y  = PAD;
export const T1A_Y = T0_Y + ROOM_H + TIER_GAP;
export const T1B_Y = T1A_Y + ROOM_H + ROW_GAP;
export const T_ANALYSIS_Y = T1B_Y + ROOM_H + TIER_GAP;
export const T2_Y  = T_ANALYSIS_Y + ROOM_H + TIER_GAP;
export const T3_Y  = T2_Y  + RISK_H + 40;

export const CANVAS_H = T3_Y + PM_H + PAD;

// Risk discovery pipeline — vertical stack on the right.
export const RISK_FORGE_Y = T0_Y;
export const RISK_HUB_Y = RISK_FORGE_Y + ROOM_H + RISK_PIPE_GAP;
export const SCENARIO_LAB_Y = RISK_HUB_Y + ROOM_H + RISK_PIPE_GAP;
export const RISK_WATCHTOWER_Y = SCENARIO_LAB_Y + ROOM_H + RISK_PIPE_GAP;
export const RISK_FORGE_X = RISK_COL_X;
export const RISK_HUB_X = RISK_COL_X;
export const SCENARIO_LAB_X = RISK_COL_X;
export const RISK_WATCHTOWER_X = RISK_COL_X;
/** Center X of the vertical risk-pipeline spine. */
export const RISK_PIPELINE_SPINE_X = RISK_COL_X + RISK_COL_W / 2;

// ─── Row start X helpers ────────────────────────────────────────────────────
function rowStart(count: number, w = ROOM_W): number {
  return PAD + (MAIN_W - rowWidth(count, w)) / 2;
}

export const T0_X  = rowStart(6);
export const T1A_X = rowStart(T1A_COUNT);
export const T1B_X = rowStart(T1B_COUNT);
export const T_ANALYSIS_X = rowStart(ANALYSIS_COUNT);

// Argument room — centered in the gap between tier 1A and 1B.
export const DEBATE_X = PAD + (MAIN_W - DEBATE_W) / 2;
export const DEBATE_Y = T1A_Y + ROOM_H + (ROW_GAP - DEBATE_H) / 2;
// Tier 2: risk room → centered on main floor.
export const T2_X = PAD + (MAIN_W - RISK_W) / 2;
// Tier 3: pm room → centered on main floor.
export const T3_X = PAD + (MAIN_W - PM_W) / 2;

// ─── Position map (roomId → {x, y}) ─────────────────────────────────────────
export interface Pos { x: number; y: number }

function buildRow(
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

export const ROOM_POS: Record<string, Pos> = {
  ...buildRow(DATA_ANALYSTS.map(a => a.key), T0_Y, T0_X),
  [RISK_FORGE_ID]: { x: RISK_FORGE_X, y: RISK_FORGE_Y },
  [RISK_RESEARCH_HUB_ID]: { x: RISK_HUB_X, y: RISK_HUB_Y },
  [SCENARIO_LAB_ID]: { x: SCENARIO_LAB_X, y: SCENARIO_LAB_Y },
  [RISK_WATCHTOWER_ID]: { x: RISK_WATCHTOWER_X, y: RISK_WATCHTOWER_Y },
  ...buildRow(NAMED_ANALYSTS.slice(0, T1A_COUNT).map(a => a.key), T1A_Y, T1A_X),
  ...buildRow(NAMED_ANALYSTS.slice(T1A_COUNT).map(a => a.key), T1B_Y, T1B_X),
  ...buildRow(SPECIALIST_ANALYSTS.map(a => a.key), T_ANALYSIS_Y, T_ANALYSIS_X),
  [DEBATE_ROOM_ID]:        { x: DEBATE_X, y: DEBATE_Y },
  [RISK_MANAGER_ID]:       { x: T2_X, y: T2_Y },
  [PORTFOLIO_MANAGER_ID]:  { x: T3_X, y: T3_Y },
};

export interface RoomBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Canvas-space bounds for a floor room (null for virtual channels). */
export function roomBounds(roomId: string): RoomBounds | null {
  const pos = ROOM_POS[roomId];
  if (!pos) return null;
  if (roomId === DEBATE_ROOM_ID) return { ...pos, w: DEBATE_W, h: DEBATE_H };
  if (roomId === RISK_RESEARCH_HUB_ID) return { ...pos, w: RISK_HUB_W, h: ROOM_H };
  if (roomId === RISK_MANAGER_ID) return { ...pos, w: RISK_W, h: RISK_H };
  if (roomId === PORTFOLIO_MANAGER_ID) return { ...pos, w: PM_W, h: PM_H };
  return { ...pos, w: ROOM_W, h: ROOM_H };
}

// ─── Signal-flow geometry (drawn by FloorHallways as SVG circuit traces) ─────
// "Data bus": horizontal collector under Tier 0.
export const DATA_BUS_Y   = T0_Y  + ROOM_H + TIER_GAP / 2;

// "Signal bus": horizontal collector under further-analysis row, above Tier 2.
export const SIGNAL_BUS_Y = T_ANALYSIS_Y + ROOM_H + TIER_GAP / 2;

// Center X of the main floor (argument room, risk gate, PM).
export const SPINE_X = PAD + MAIN_W / 2;

// ─── Spur source points (room bottom-center) ─────────────────────────────────
function spurX(agentKey: string, w = ROOM_W): number {
  const pos = ROOM_POS[roomIdFor(agentKey)];
  return pos ? pos.x + w / 2 : SPINE_X;
}
function spurBottomY(agentKey: string): number {
  const pos = ROOM_POS[roomIdFor(agentKey)];
  return pos ? pos.y + ROOM_H : 0;
}

export interface Spur {
  cx: number;
  fromY: number;
  toY: number;
  dim: boolean;  // dim = data feed spurs (thinner, more transparent)
}

// All analyst spurs collect onto the signal bus below the floor.
export const ALL_SPURS: Spur[] = [
  ...DATA_ANALYSTS.map(a => ({
    cx: spurX(a.key),
    fromY: spurBottomY(a.key),
    toY: SIGNAL_BUS_Y,
    dim: true,
  })),
  ...NAMED_ANALYSTS.map(a => ({
    cx: spurX(a.key),
    fromY: spurBottomY(a.key),
    toY: SIGNAL_BUS_Y,
    dim: false,
  })),
  ...SPECIALIST_ANALYSTS.map(a => ({
    cx: spurX(a.key),
    fromY: spurBottomY(a.key),
    toY: SIGNAL_BUS_Y,
    dim: false,
  })),
];

// Horizontal bus extents span legend rows + further-analysis row.
export const SIGNAL_BUS_LEFT  = Math.min(T1A_X, T1B_X, T_ANALYSIS_X) + ROOM_W / 2;
export const SIGNAL_BUS_RIGHT =
  Math.max(
    T1A_X + rowWidth(T1A_COUNT),
    T1B_X + rowWidth(T1B_COUNT),
    T_ANALYSIS_X + rowWidth(ANALYSIS_COUNT),
  ) - ROOM_W / 2;

// Risk-to-PM connector.
export const RISK_BOTTOM_X = T2_X + RISK_W / 2;
export const RISK_TOP_Y    = T2_Y;
export const RISK_BOTTOM_Y = T2_Y + RISK_H;
export const PM_TOP_Y      = T3_Y;

// Risk pipeline stage connectors (forge → hub → lab → watchtower → main spine).
export const RISK_PIPELINE_STAGES = [
  { top: RISK_FORGE_Y, bottom: RISK_FORGE_Y + ROOM_H },
  { top: RISK_HUB_Y, bottom: RISK_HUB_Y + ROOM_H },
  { top: SCENARIO_LAB_Y, bottom: SCENARIO_LAB_Y + ROOM_H },
  { top: RISK_WATCHTOWER_Y, bottom: RISK_WATCHTOWER_Y + ROOM_H },
] as const;
/** Y where the pipeline feeds the legend floor (tier-1 gate). */
export const RISK_PIPELINE_FEED_Y = T1A_Y + ROOM_H / 2;
