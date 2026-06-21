import {
  ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  roomIdFor,
} from "./agents";
import type { GraphEdge, GraphNode } from "./types";

/**
 * Build the React-Flow agent graph (enabled analysts -> portfolio manager) that
 * the backend `/hedge-fund/run` and `/hedge-fund/backtest` endpoints expect.
 * Shared so the live shift and the backtester stay in sync.
 */
export function buildAgentGraph(enabledAgentKeys: Iterable<string>): {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  activeCount: number;
} {
  const enabled = new Set(enabledAgentKeys);
  const activeAnalysts = ANALYSTS.filter((a) => enabled.has(a.key));

  const graphNodes: GraphNode[] = [
    ...activeAnalysts.map<GraphNode>((a) => ({
      id: roomIdFor(a.key),
      type: "agent-node",
      data: { name: a.name },
    })),
    {
      id: PORTFOLIO_MANAGER_ID,
      type: "agent-node",
      data: { name: PORTFOLIO_MANAGER.name },
    },
  ];

  const graphEdges: GraphEdge[] = activeAnalysts.map<GraphEdge>((a) => ({
    id: `e-${a.key}-pm`,
    source: roomIdFor(a.key),
    target: PORTFOLIO_MANAGER_ID,
  }));

  return { graphNodes, graphEdges, activeCount: activeAnalysts.length };
}
