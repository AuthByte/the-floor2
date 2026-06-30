import {
  ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  roomIdFor,
  type AgentDef,
} from "./agents";
import type { GraphEdge, GraphNode } from "./types";

/** Build the same analyst → portfolio-manager graph shape used for live shifts. */
export function buildBacktestGraph(enabledKeys: Set<string> | Iterable<string>): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  analysts: AgentDef[];
} {
  const enabled = enabledKeys instanceof Set ? enabledKeys : new Set(enabledKeys);
  const analysts = ANALYSTS.filter((a) => enabled.has(a.key));

  const nodes: GraphNode[] = [
    ...analysts.map<GraphNode>((a) => ({
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

  const edges: GraphEdge[] = analysts.map<GraphEdge>((a) => ({
    id: `e-${a.key}-pm`,
    source: roomIdFor(a.key),
    target: PORTFOLIO_MANAGER_ID,
  }));

  return { nodes, edges, analysts };
}
