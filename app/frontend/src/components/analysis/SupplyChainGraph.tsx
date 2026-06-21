import { useId, useMemo } from "react";

import type { SupplyChainGraphData } from "../../lib/parseAgentAnalysis";

const ROLE_COLORS: Record<string, string> = {
  focal: "#f59e0b",
  supplier: "#22d3ee",
  customer: "#4ade80",
  material: "#a78bfa",
  geography: "#94a3b8",
  competitor: "#f472b6",
};

const TIER_W = 148;
const NODE_H = 36;
const PAD = 24;

interface LayoutNode {
  id: string;
  label: string;
  role: string;
  tier: number;
  x: number;
  y: number;
  risk_note?: string | null;
  region?: string | null;
}

interface Props {
  graph: SupplyChainGraphData;
}

export function SupplyChainGraph({ graph }: Props) {
  const markerId = useId().replace(/:/g, "");
  const { layoutNodes, edges, width, height } = useMemo(
    () => layoutGraph(graph),
    [graph],
  );
  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const risks = graph.concentration_risks ?? [];
  const structure = graph.structure as Record<string, unknown> | undefined;
  const source = graph.graph_source as string | undefined;

  if (!layoutNodes.length) {
    return (
      <p className="py-8 text-center font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
        Supply chain graph unavailable
      </p>
    );
  }

  return (
    <div className="supply-chain-graph overflow-x-auto rounded border border-wire-800/80 bg-ink-950/90 p-2">
      {source ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-wire-600">
          <span>
            source:{" "}
            <span className="text-brass/80">{source}</span>
          </span>
          {structure?.resilience_score != null ? (
            <span>
              resilience:{" "}
              <span className="font-mono text-phos">{String(structure.resilience_score)}</span>/10
            </span>
          ) : null}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-h-[280px] w-full"
        role="img"
        aria-label="Supply chain network graph"
      >
        <defs>
          <marker
            id={`sc-arrow-${markerId}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="rgb(var(--wire-500))" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = nodeMap.get(e.source);
          const b = nodeMap.get(e.target);
          if (!a || !b) return null;
          const x1 = a.x + 56;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x + 56;
          const y2 = b.y + NODE_H / 2;
          const crit =
            e.criticality === "high"
              ? "rgb(var(--siren))"
              : e.criticality === "low"
                ? "rgb(var(--wire-600))"
                : "rgb(var(--brass) / 0.7)";
          return (
            <g key={`${e.source}-${e.target}-${i}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={crit}
                strokeWidth={e.criticality === "high" ? 1.8 : 1}
                markerEnd={`url(#sc-arrow-${markerId})`}
                opacity={0.75}
              />
            </g>
          );
        })}
        {layoutNodes.map((n) => {
          const fill = ROLE_COLORS[n.role] ?? "#64748b";
          const title = [n.risk_note, n.region ? `Region: ${n.region}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
              <title>{title || n.label}</title>
              <rect
                width={112}
                height={NODE_H}
                rx={4}
                fill="rgb(var(--ink-900))"
                stroke={fill}
                strokeWidth={n.role === "focal" ? 2 : 1}
              />
              <text
                x={56}
                y={14}
                textAnchor="middle"
                className="fill-wire-100"
                style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
              >
                {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
              </text>
              <text
                x={56}
                y={26}
                textAnchor="middle"
                fill={fill}
                style={{ fontSize: 7, fontFamily: "ui-monospace, monospace" }}
              >
                {n.role} · T{n.tier}
              </text>
            </g>
          );
        })}
      </svg>
      {risks.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-wire-800/60 pt-2 text-[10px] text-siren/90">
          {risks.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-siren" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function layoutGraph(graph: SupplyChainGraphData) {
  const nodes = graph.nodes ?? [];
  const byTier = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const t = n.tier ?? 0;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(n);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const minTier = tiers[0] ?? 0;
  const layoutNodes: LayoutNode[] = [];
  let maxColH = 0;

  for (const tier of tiers) {
    const col = byTier.get(tier) ?? [];
    const colIndex = tier - minTier;
    const x = PAD + colIndex * TIER_W;
    col.forEach((n, i) => {
      const y = PAD + i * (NODE_H + 10);
      layoutNodes.push({
        id: n.id,
        label: n.label,
        role: n.role,
        tier: n.tier,
        x,
        y,
        risk_note: n.risk_note,
        region: n.region,
      });
    });
    maxColH = Math.max(maxColH, col.length * (NODE_H + 10));
  }

  const validIds = new Set(layoutNodes.map((n) => n.id));
  const edges = (graph.edges ?? []).filter(
    (e) => validIds.has(e.source) && validIds.has(e.target),
  );

  const width = Math.max(320, PAD * 2 + tiers.length * TIER_W);
  const height = Math.max(240, PAD * 2 + maxColH);
  return { layoutNodes, edges, width, height };
}
