import { ANALYSTS } from "../../lib/agents";
import type { PostAgentOutcomes } from "../../lib/floorSocial/types";

interface Props {
  outcomes: PostAgentOutcomes;
  compact?: boolean;
}

export function PostAgentOutcomes({ outcomes, compact }: Props) {
  const rows = Object.entries(outcomes);
  if (!rows.length) return null;

  return (
    <div
      className={`${compact ? "mt-2" : "rounded border border-wire-800/80 bg-ink-950/40 p-3"} space-y-2`}
    >
      {!compact ? (
        <h4 className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
          Agent outcomes on this run
        </h4>
      ) : (
        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">Agents</p>
      )}
      <ul className={`flex flex-wrap gap-2 ${compact ? "" : "flex-col"}`}>
        {rows.map(([agentKey, slice]) => {
          const agent = ANALYSTS.find((a) => a.key === agentKey);
          const name = agent?.name ?? agentKey.replace(/_/g, " ");
          return (
            <li
              key={agentKey}
              className="rounded border border-wire-800/60 bg-ink-900/30 px-2 py-1.5 font-mono text-[10px] text-wire-300"
            >
              <span className="text-wire-100">{name}</span>
              <span className="text-wire-600"> · </span>
              <span className="text-brass">
                {slice.direction_hits}/{slice.direction_total} dir
              </span>
              {slice.target_total ? (
                <>
                  <span className="text-wire-600"> · </span>
                  <span>
                    {slice.target_hits ?? 0}/{slice.target_total} tgt
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function extractAgentOutcomes(
  scorecard: Record<string, unknown> | undefined,
): PostAgentOutcomes | undefined {
  const raw = scorecard?.agent_outcomes;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as PostAgentOutcomes;
}
