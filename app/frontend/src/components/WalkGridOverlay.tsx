import { memo, useMemo } from "react";
import type { WalkGrid } from "../lib/walkGrid";

interface Props {
  grid: WalkGrid;
  roomPx: number;
}

/** Semi-transparent debug layer — green = walkable, dark = blocked. */
export const WalkGridOverlay = memo(function WalkGridOverlay({
  grid,
  roomPx,
}: Props) {
  const cellW = roomPx / grid.width;
  const cellH = roomPx / grid.height;

  const cells = useMemo(() => {
    const out: { x: number; y: number; walk: boolean }[] = [];
    for (let gy = 0; gy < grid.height; gy++) {
      const row = grid.rows[gy] ?? "";
      for (let gx = 0; gx < grid.width; gx++) {
        out.push({
          x: gx * cellW,
          y: gy * cellH,
          walk: row[gx] === "1",
        });
      }
    }
    return out;
  }, [grid, cellW, cellH]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            width: cellW,
            height: cellH,
            background: c.walk
              ? "rgba(34, 255, 102, 0.22)"
              : "rgba(0, 0, 0, 0.35)",
            boxSizing: "border-box",
            border: c.walk
              ? "1px solid rgba(34, 255, 102, 0.12)"
              : "1px solid rgba(255, 255, 255, 0.04)",
          }}
        />
      ))}
      <span
        className="absolute left-1 top-1 px-1 py-0.5 text-[8px] uppercase tracking-[0.2em] text-phos/80"
        style={{ textShadow: "0 0 6px #000" }}
      >
        walk mask
      </span>
    </div>
  );
});
