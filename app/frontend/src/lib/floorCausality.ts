import { roomIdFor } from "./agents";
import { DEBATE_ROOM_ID, getRoomPos, ROOM_H, ROOM_W } from "./layout";
import { parseEmbeddedArtifacts } from "./parseAgentAnalysis";
import type { RoomState } from "./types";

export interface CausalityEdge {
  id: string;
  kind: "ripple" | "supply";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

interface GraphNode {
  id: string;
  label?: string;
  step?: number;
  role?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship?: string;
}

function roomCenter(roomId: string) {
  const pos = getRoomPos(roomId);
  if (!pos) return null;
  return { x: pos.x + ROOM_W / 2, y: pos.y + ROOM_H / 2 };
}

function layoutNodes(
  nodes: GraphNode[],
  sourceId: string,
  sinkId: string,
): Map<string, { x: number; y: number }> {
  const source = roomCenter(sourceId);
  const sink = roomCenter(sinkId) ?? source;
  const positions = new Map<string, { x: number; y: number }>();
  if (!source || !sink) return positions;

  const maxStep = nodes.reduce((m, n) => Math.max(m, n.step ?? 0), 0) || 1;
  const spread = 48;

  nodes.forEach((node, idx) => {
    const step = node.step ?? idx;
    const t = Math.min(1, (step + 1) / (maxStep + 2));
    const baseX = source.x + (sink.x - source.x) * t;
    const baseY = source.y + (sink.y - source.y) * t;
    const lane = (idx % 3) - 1;
    positions.set(node.id, {
      x: baseX + lane * spread,
      y: baseY + lane * spread * 0.35,
    });
  });
  return positions;
}

function edgesFromGraph(
  kind: "ripple" | "supply",
  graph: { nodes?: GraphNode[]; edges?: GraphEdge[] },
  sourceRoomId: string,
): CausalityEdge[] {
  const nodes = graph.nodes ?? [];
  const graphEdges = graph.edges ?? [];
  if (!nodes.length) return [];

  const positions = layoutNodes(nodes, sourceRoomId, DEBATE_ROOM_ID);
  const out: CausalityEdge[] = [];

  for (const edge of graphEdges) {
    const a = positions.get(edge.source);
    const b = positions.get(edge.target);
    if (!a || !b) continue;
    out.push({
      id: `${kind}-${edge.source}-${edge.target}`,
      kind,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      label: edge.relationship,
    });
  }
  return out;
}

/** Pull ripple + supply-chain edges for floor overlay from specialist room analysis. */
export function collectFloorCausalityEdges(
  rooms: Record<string, RoomState>,
): CausalityEdge[] {
  const specs = [
    { key: "ripple_desk", kind: "ripple" as const },
    { key: "supply_chain_cartographer", kind: "supply" as const },
  ];

  const edges: CausalityEdge[] = [];
  for (const spec of specs) {
    const roomId = roomIdFor(spec.key);
    const analysis = rooms[roomId]?.analysis;
    const artifacts = parseEmbeddedArtifacts(analysis);
    for (const art of artifacts) {
      if (art.kind !== "ripple_cascade" && art.kind !== "supply_chain_graph") continue;
      const graph = art.graph as { nodes?: GraphNode[]; edges?: GraphEdge[] } | undefined;
      if (!graph) continue;
      edges.push(...edgesFromGraph(spec.kind, graph, roomId));
    }
  }
  return edges;
}
