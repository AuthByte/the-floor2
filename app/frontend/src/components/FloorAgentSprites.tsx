import { memo, useMemo } from "react";
import { NAMED_ANALYSTS, roomIdFor } from "../lib/agents";
import {
  agentTravelPhase,
  buildDebatePath,
  debatePatrolWaypoints,
  homePatrolWaypoints,
} from "../lib/debateWalkPaths";
import { CANVAS_H, CANVAS_W, DEBATE_ROOM_ID } from "../lib/layout";
import { ROOM_ASSETS } from "../lib/roomAssets";
import type { RoomState } from "../lib/types";
import { CanvasWalkingSprite } from "./CanvasWalkingSprite";

interface Props {
  rooms: Record<string, RoomState>;
  enabledAgentKeys: Set<string>;
}

export const FloorAgentSprites = memo(function FloorAgentSprites({
  rooms,
  enabledAgentKeys,
}: Props) {
  const debateState = rooms[DEBATE_ROOM_ID];

  const agents = useMemo(
    () => NAMED_ANALYSTS.filter((a) => enabledAgentKeys.has(a.key)),
    [enabledAgentKeys],
  );

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[16]"
      style={{ width: CANVAS_W, height: CANVAS_H }}
      aria-hidden
    >
      {agents.map((agent) => {
        const id = roomIdFor(agent.key);
        const state = rooms[id];
        const asset = ROOM_ASSETS[agent.key];
        if (!state || !asset?.spriteSheet) return null;

        const phase = agentTravelPhase(state, debateState ?? { message: "", status: "STANDBY" });

        if (phase === "home") return null;

        const toDebate = buildDebatePath(agent.key, false);
        const toHome = buildDebatePath(agent.key, true);

        let waypoints = toDebate;
        let mode: "path_once" | "patrol" | "idle" = "path_once";

        if (phase === "at_debate") {
          waypoints = debatePatrolWaypoints(agent.key);
          mode = "patrol";
        } else if (phase === "to_home") {
          waypoints = toHome;
          mode = "path_once";
        } else if (phase === "to_debate") {
          waypoints = toDebate;
          mode = "path_once";
        }

        return (
          <CanvasWalkingSprite
            key={id}
            spriteUrl={asset.spriteSheet}
            waypoints={waypoints}
            mode={mode}
          />
        );
      })}
    </div>
  );
});

/** Whether the cubicle-local sprite should hide (agent is on the floor canvas). */
export function shouldHideCubicleSprite(
  agentKey: string,
  rooms: Record<string, RoomState>,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  const id = roomIdFor(agentKey);
  const state = rooms[id];
  const debate = rooms[DEBATE_ROOM_ID];
  if (!state) return false;
  const phase = agentTravelPhase(state, debate ?? { message: "", status: "STANDBY" });
  return phase !== "home";
}

export { homePatrolWaypoints };
