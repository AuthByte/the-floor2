import { memo, useEffect, useMemo, useRef } from "react";
import { ROOM_H } from "../lib/layout";
import type { WalkGrid } from "../lib/walkGrid";
import { createWalkGridNav, moveOnGrid } from "../lib/walkGrid";

// ─── Sprite sheet geometry ────────────────────────────────────────────────────
// Sheet is 1024×1024 with 8 columns × 5 rows.
// Each frame cell: 128 px wide × 205 px tall.
const SHEET_W = 1024;
const SHEET_H = 1024;
const CELL_W  = 128;
const CELL_H  = 205;
const FRAMES  = 4;
const FPS     = 8;

// Display size inside the room (px, at 1× room scale).
// Sized so the character is ~1/6 of the room — visually distinct after the
// room images were enlarged.
const DISP_W = 28;
const DISP_H = 36;
const SCALE  = DISP_W / CELL_W;

// Row/colStart for each direction
const DIR_MAP = {
  S:    { row: 0, colStart: 0 },
  SW:   { row: 0, colStart: 4 },
  W:    { row: 1, colStart: 0 },
  NW:   { row: 1, colStart: 4 },
  N:    { row: 2, colStart: 0 },
  NE:   { row: 2, colStart: 4 },
  E:    { row: 3, colStart: 0 },
  SE:   { row: 3, colStart: 4 },
  IDLE: { row: 4, colStart: 2 },
} as const;
type Dir = keyof typeof DIR_MAP;

// Waypoints expressed as fractions of ROOM_H, tracing a patrol across the
// visible hex floor. The hex floor in isometric rooms occupies roughly the
// lower 60 % of the image vertically (top is wall, bottom is the near edge).
// fy=0.72 is the visual center of the floor; fy=0.85 is the near edge.
const WAYPOINT_FRACTIONS: { fx: number; fy: number }[] = [
  { fx: 0.50, fy: 0.72 }, // floor center
  { fx: 0.32, fy: 0.78 }, // west side
  { fx: 0.42, fy: 0.88 }, // front-left
  { fx: 0.58, fy: 0.88 }, // front-right
  { fx: 0.68, fy: 0.78 }, // east side
  { fx: 0.50, fy: 0.60 }, // back-center (near desk)
];
const WAYPOINTS = WAYPOINT_FRACTIONS.map(({ fx, fy }) => ({
  x: fx * ROOM_H,
  y: fy * ROOM_H,
}));

// Walking speed scales with room size so the visual pacing stays consistent
// regardless of how big we make rooms. ~0.6 px/tick felt right at ROOM_H=130;
// keep the same fraction-of-room/sec at any size.
const SPEED = 0.6 * (ROOM_H / 130); // px / ~16ms tick

// ─── Shared animation tick ───────────────────────────────────────────────────
// One rAF loop drives every sprite on the page so we don't have N timers
// fighting with the React reconciler. Sprites write directly to the DOM via
// refs — React state is never touched for per-frame motion.
type Tick = (dtMs: number) => void;
const _tickers = new Set<Tick>();
let _lastT = 0;
let _running = false;

function _loop(t: number) {
  const dt = _lastT ? t - _lastT : 16;
  _lastT = t;
  for (const fn of _tickers) fn(dt);
  if (_tickers.size > 0) requestAnimationFrame(_loop);
  else _running = false;
}
function subscribeTick(fn: Tick): () => void {
  _tickers.add(fn);
  if (!_running) {
    _running = true;
    _lastT = 0;
    requestAnimationFrame(_loop);
  }
  return () => {
    _tickers.delete(fn);
  };
}


function angleToDir(dx: number, dy: number): Dir {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return "IDLE";
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > -22.5  && deg <=  22.5)  return "E";
  if (deg >  22.5  && deg <=  67.5)  return "SE";
  if (deg >  67.5  && deg <= 112.5)  return "S";
  if (deg > 112.5  && deg <= 157.5)  return "SW";
  if (deg >  157.5 || deg <= -157.5) return "W";
  if (deg > -157.5 && deg <= -112.5) return "NW";
  if (deg > -112.5 && deg <=  -67.5) return "N";
  return "NE";
}

interface Props {
  spriteUrl: string;
  idle?: boolean;
  walkGrid?: WalkGrid;
  roomPx?: number;
}

type SpriteState = {
  pos: { x: number; y: number };
  dir: Dir;
  frame: number;
  wpIdx: number;
  frameAccumMs: number;
  gridTarget: { x: number; y: number } | null;
};

export const WalkingSprite = memo(function WalkingSprite({
  spriteUrl,
  idle,
  walkGrid,
  roomPx = ROOM_H,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);

  const nav = useMemo(
    () => (walkGrid ? createWalkGridNav(walkGrid, roomPx) : null),
    [walkGrid, roomPx],
  );

  const stateRef = useRef<SpriteState | null>(null);

  useEffect(() => {
    const start = nav?.defaultPos ?? WAYPOINTS[0];
    stateRef.current = {
      pos: { x: start.x, y: start.y },
      dir: "S",
      frame: 0,
      wpIdx: 0,
      frameAccumMs: 0,
      gridTarget: nav ? nav.pickPatrolTarget(start) : null,
    };
  }, [nav]);

  useEffect(() => {
    if (!spriteUrl) return;
    const FRAME_INTERVAL = 1000 / FPS;

    return subscribeTick((dt) => {
      const el = elRef.current;
      const s = stateRef.current;
      if (!el || !s) return;

      const idlePos = nav?.defaultPos ?? WAYPOINTS[0];

      // ── Movement
      if (idle) {
        s.dir = "IDLE";
        s.frame = 0;
        s.pos.x = idlePos.x;
        s.pos.y = idlePos.y;
        const { row, colStart } = DIR_MAP["IDLE"];
        const bgX = -(colStart * CELL_W * SCALE);
        const bgY = -(row * CELL_H * SCALE);
        const tx = s.pos.x - DISP_W / 2;
        const ty = s.pos.y - DISP_H;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        el.style.backgroundPosition = `${bgX}px ${bgY}px`;
        return;
      }

      const step = SPEED * (dt / 16);

      if (nav) {
        if (!s.gridTarget) s.gridTarget = nav.pickPatrolTarget(s.pos);
        const target = s.gridTarget;
        const dx = target.x - s.pos.x;
        const dy = target.y - s.pos.y;
        const dist = Math.hypot(dx, dy);

        if (dist < step + 2) {
          const snapped = nav.snapPx(target.x, target.y);
          s.pos.x = snapped.x;
          s.pos.y = snapped.y;
          s.dir = "IDLE";
          s.gridTarget = nav.pickPatrolTarget(s.pos);
        } else {
          const moved = moveOnGrid(s.pos, target, step, nav);
          if (!moved) {
            s.gridTarget = nav.pickPatrolTarget(s.pos);
          } else {
            s.dir = angleToDir(target.x - s.pos.x, target.y - s.pos.y);
          }
        }
      } else {
        const target = WAYPOINTS[s.wpIdx % WAYPOINTS.length];
        const dx = target.x - s.pos.x;
        const dy = target.y - s.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < step + 1) {
          s.pos.x = target.x;
          s.pos.y = target.y;
          s.dir = "IDLE";
          s.wpIdx = (s.wpIdx + 1) % WAYPOINTS.length;
        } else {
          s.pos.x += (dx / dist) * step;
          s.pos.y += (dy / dist) * step;
          s.dir = angleToDir(dx, dy);
        }
      }

      // ── Frame animation
      s.frameAccumMs += dt;
      if (s.frameAccumMs >= FRAME_INTERVAL) {
        s.frame = (s.frame + 1) % FRAMES;
        s.frameAccumMs = 0;
      }

      // ── Write to DOM
      const { row, colStart } = DIR_MAP[s.dir];
      const col = colStart + s.frame; // works for both walk and idle rows
      const bgX = -(col * CELL_W * SCALE);
      const bgY = -(row * CELL_H * SCALE);
      const tx  = s.pos.x - DISP_W / 2;
      const ty  = s.pos.y - DISP_H;
      el.style.transform          = `translate3d(${tx}px, ${ty}px, 0)`;
      el.style.backgroundPosition = `${bgX}px ${bgY}px`;
    });
  }, [spriteUrl, idle, nav]);

  if (!spriteUrl) return null;

  const bgW = SHEET_W * SCALE;
  const bgH = SHEET_H * SCALE;

  return (
    <div
      ref={elRef}
      style={{
        position:           "absolute",
        left:               0,
        top:                0,
        width:              DISP_W,
        height:             DISP_H,
        backgroundImage:    `url('${spriteUrl}')`,
        backgroundSize:     `${bgW}px ${bgH}px`,
        backgroundRepeat:   "no-repeat",
        imageRendering:     "pixelated",
        pointerEvents:      "none",
        zIndex:             10,
        willChange:         "transform, background-position",
      }}
    />
  );
});
