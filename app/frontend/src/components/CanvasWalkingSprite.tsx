import { memo, useEffect, useRef } from "react";

const SHEET_W = 1024;
const SHEET_H = 1024;
const CELL_W = 128;
const CELL_H = 205;
const FRAMES = 4;
const FPS = 8;
const DISP_W = 28;
const DISP_H = 36;
const SCALE = DISP_W / CELL_W;
const SPEED = 1.1;

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

type Mode = "path_once" | "patrol" | "idle";

interface Props {
  spriteUrl: string;
  /** Canvas-space waypoints. */
  waypoints: { x: number; y: number }[];
  mode: Mode;
  visible?: boolean;
}

type State = {
  pos: { x: number; y: number };
  dir: Dir;
  frame: number;
  frameAccumMs: number;
  wpIdx: number;
  pathDone: boolean;
};

export const CanvasWalkingSprite = memo(function CanvasWalkingSprite({
  spriteUrl,
  waypoints,
  mode,
  visible = true,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<State | null>(null);
  const wpKey = waypoints.map((p) => `${p.x},${p.y}`).join("|");

  useEffect(() => {
    const start = waypoints[0] ?? { x: 0, y: 0 };
    stateRef.current = {
      pos: { ...start },
      dir: "S",
      frame: 0,
      frameAccumMs: 0,
      wpIdx: 0,
      pathDone: false,
    };
  }, [wpKey]);

  useEffect(() => {
    if (!spriteUrl || !visible) return;
    const FRAME_INTERVAL = 1000 / FPS;

    return subscribeTick((dt) => {
      const el = elRef.current;
      const s = stateRef.current;
      if (!el || !s || waypoints.length === 0) return;

      const idle = mode === "idle";
      const step = SPEED * (dt / 16);

      if (idle) {
        s.dir = "IDLE";
        s.frame = 0;
      } else if (mode === "path_once" && !s.pathDone) {
        const target = waypoints[Math.min(s.wpIdx, waypoints.length - 1)];
        const dx = target.x - s.pos.x;
        const dy = target.y - s.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < step + 1) {
          s.pos.x = target.x;
          s.pos.y = target.y;
          if (s.wpIdx >= waypoints.length - 1) {
            s.pathDone = true;
            s.dir = "IDLE";
          } else {
            s.wpIdx += 1;
          }
        } else {
          s.pos.x += (dx / dist) * step;
          s.pos.y += (dy / dist) * step;
          s.dir = angleToDir(dx, dy);
        }
      } else if (mode === "patrol") {
        const target = waypoints[s.wpIdx % waypoints.length];
        const dx = target.x - s.pos.x;
        const dy = target.y - s.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < step + 1) {
          s.pos.x = target.x;
          s.pos.y = target.y;
          s.dir = "IDLE";
          s.wpIdx = (s.wpIdx + 1) % waypoints.length;
        } else {
          s.pos.x += (dx / dist) * step;
          s.pos.y += (dy / dist) * step;
          s.dir = angleToDir(dx, dy);
        }
      }

      if (!idle && s.dir !== "IDLE") {
        s.frameAccumMs += dt;
        if (s.frameAccumMs >= FRAME_INTERVAL) {
          s.frame = (s.frame + 1) % FRAMES;
          s.frameAccumMs = 0;
        }
      } else {
        s.frame = 0;
      }

      const { row, colStart } = DIR_MAP[s.dir];
      const col = colStart + s.frame;
      const bgX = -(col * CELL_W * SCALE);
      const bgY = -(row * CELL_H * SCALE);
      el.style.transform = `translate3d(${s.pos.x - DISP_W / 2}px, ${s.pos.y - DISP_H}px, 0)`;
      el.style.backgroundPosition = `${bgX}px ${bgY}px`;
    });
  }, [spriteUrl, visible, mode, wpKey, waypoints]);

  if (!spriteUrl || !visible) return null;

  return (
    <div
      ref={elRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: DISP_W,
        height: DISP_H,
        backgroundImage: `url('${spriteUrl}')`,
        backgroundSize: `${SHEET_W * SCALE}px ${SHEET_H * SCALE}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        pointerEvents: "none",
        zIndex: 14,
        willChange: "transform, background-position",
      }}
    />
  );
});
