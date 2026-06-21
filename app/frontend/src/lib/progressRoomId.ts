import {
  ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  roomIdFor,
} from "./agents";
import { CONSULTATION_ID, DEBATE_ROOM_ID } from "./layout";

const ROOM_ID_BY_KEY = new Map(ANALYSTS.map((a) => [a.key, roomIdFor(a.key)] as const));

const STATIC_ROOM_IDS = new Set<string>([
  DEBATE_ROOM_ID,
  CONSULTATION_ID,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER_ID,
  ...RISK_PIPELINE_AGENTS.map((a) => a.key),
  ...ROOM_ID_BY_KEY.values(),
]);

/** Map backend progress agent ids onto floor room keys. */
export function resolveProgressRoomId(agent: string): string {
  if (STATIC_ROOM_IDS.has(agent)) return agent;

  const direct = ROOM_ID_BY_KEY.get(agent);
  if (direct) return direct;

  const suffixMatch = agent.match(/^(.+)_([a-z0-9]{6})$/i);
  if (suffixMatch) {
    const mapped = ROOM_ID_BY_KEY.get(suffixMatch[1]);
    if (mapped) return mapped;
  }

  return agent;
}
