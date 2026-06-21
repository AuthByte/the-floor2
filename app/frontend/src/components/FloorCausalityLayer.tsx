import { useMemo } from "react";
import { collectFloorCausalityEdges } from "../lib/floorCausality";
import type { RoomState } from "../lib/types";

interface Props {
  rooms: Record<string, RoomState>;
  visible?: boolean;
}

const STROKE: Record<string, string> = {
  ripple: "rgba(47,208,138,0.55)",
  supply: "rgba(227,178,75,0.5)",
};

/**
 * Animated causality arcs from Ripple Desk + Supply Chain graphs onto the floor plan.
 */
export function FloorCausalityLayer({ rooms, visible = true }: Props) {
  const edges = useMemo(() => collectFloorCausalityEdges(rooms), [rooms]);

  if (!visible || edges.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[18] overflow-visible"
      aria-hidden
    >
      <defs>
        <marker
          id="causality-arrow-ripple"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(47,208,138,0.7)" />
        </marker>
        <marker
          id="causality-arrow-supply"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(227,178,75,0.75)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const stroke = STROKE[edge.kind] ?? STROKE.ripple;
        const marker = edge.kind === "supply" ? "url(#causality-arrow-supply)" : "url(#causality-arrow-ripple)";
        const mx = (edge.x1 + edge.x2) / 2;
        const my = (edge.y1 + edge.y2) / 2 - 18;
        const d = `M ${edge.x1} ${edge.y1} Q ${mx} ${my} ${edge.x2} ${edge.y2}`;
        return (
          <g key={edge.id}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeDasharray="6 5"
              markerEnd={marker}
              className="causality-edge"
            />
          </g>
        );
      })}
    </svg>
  );
}
