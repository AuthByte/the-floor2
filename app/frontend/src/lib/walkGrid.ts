/**
 * Room-local walkability grid. Each cell is walkable (1) or blocked (0).
 * Coordinates: gx/gy are grid indices; pixel space matches the ROOM_H×ROOM_H
 * square used by PixelRoom / WalkingSprite (origin top-left, y down).
 */

export interface WalkGrid {
  width: number;
  height: number;
  /** Top row first. Each string is width chars of '0' | '1'. */
  rows: string[];
}

export interface WalkGridNav {
  grid: WalkGrid;
  roomPx: number;
  cellW: number;
  cellH: number;
  walkableCenters: { x: number; y: number }[];
  defaultPos: { x: number; y: number };
  isWalkablePx: (x: number, y: number) => boolean;
  snapPx: (x: number, y: number) => { x: number; y: number };
  pickPatrolTarget: (excludeNear?: { x: number; y: number }) => { x: number; y: number };
}

function parseGrid(grid: WalkGrid): boolean[][] {
  const cells: boolean[][] = [];
  for (let y = 0; y < grid.height; y++) {
    const row = grid.rows[y] ?? "";
    const line: boolean[] = [];
    for (let x = 0; x < grid.width; x++) {
      line.push(row[x] === "1");
    }
    cells.push(line);
  }
  return cells;
}

export function createWalkGridNav(grid: WalkGrid, roomPx: number): WalkGridNav {
  const cells = parseGrid(grid);
  const cellW = roomPx / grid.width;
  const cellH = roomPx / grid.height;

  const isWalkableCell = (gx: number, gy: number) =>
    gy >= 0 && gy < grid.height && gx >= 0 && gx < grid.width && cells[gy][gx];

  const cellCenterPx = (gx: number, gy: number) => ({
    x: (gx + 0.5) * cellW,
    y: (gy + 0.5) * cellH,
  });

  const walkableCenters: { x: number; y: number }[] = [];
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      if (cells[gy][gx]) walkableCenters.push(cellCenterPx(gx, gy));
    }
  }

  const defaultPos =
    walkableCenters[Math.floor(walkableCenters.length / 2)] ??
    { x: roomPx / 2, y: roomPx * 0.72 };

  const pxToCell = (x: number, y: number) => ({
    gx: Math.min(grid.width - 1, Math.max(0, Math.floor(x / cellW))),
    gy: Math.min(grid.height - 1, Math.max(0, Math.floor(y / cellH))),
  });

  const isWalkablePx = (x: number, y: number) => {
    const { gx, gy } = pxToCell(x, y);
    return isWalkableCell(gx, gy);
  };

  const snapPx = (x: number, y: number) => {
    if (isWalkablePx(x, y)) return { x, y };
    let best = defaultPos;
    let bestD = Infinity;
    for (const p of walkableCenters) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return { ...best };
  };

  const pickPatrolTarget = (excludeNear?: { x: number; y: number }) => {
    if (walkableCenters.length === 0) return defaultPos;
    const minDist = cellW * 3;
    const candidates = excludeNear
      ? walkableCenters.filter((p) => {
          const d = Math.hypot(p.x - excludeNear.x, p.y - excludeNear.y);
          return d >= minDist;
        })
      : walkableCenters;
    const pool = candidates.length > 0 ? candidates : walkableCenters;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  return {
    grid,
    roomPx,
    cellW,
    cellH,
    walkableCenters,
    defaultPos,
    isWalkablePx,
    snapPx,
    pickPatrolTarget,
  };
}

/** Try to advance toward target while staying on walkable cells. */
export function moveOnGrid(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  step: number,
  nav: WalkGridNav,
): boolean {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return false;

  const ux = (dx / dist) * step;
  const uy = (dy / dist) * step;

  const tryPos = (nx: number, ny: number) => {
    if (nav.isWalkablePx(nx, ny)) {
      pos.x = nx;
      pos.y = ny;
      return true;
    }
    return false;
  };

  if (tryPos(pos.x + ux, pos.y + uy)) return true;
  if (tryPos(pos.x + ux, pos.y)) return true;
  if (tryPos(pos.x, pos.y + uy)) return true;
  return false;
}
