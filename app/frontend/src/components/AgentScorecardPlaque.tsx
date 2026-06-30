import {
  formatHitRate,
  isLowSample,
  useAgentScorecard,
} from "../lib/agentScorecards";

interface Props {
  agentKey: string;
}

/** Brass plaque on room tiles when an agent has enough scored history. */
export function AgentScorecardPlaque({ agentKey }: Props) {
  const card = useAgentScorecard(agentKey);
  const n = card?.predictions_scored ?? 0;

  if (n < 5) return null;

  const dir = formatHitRate(card?.direction_hit_rate);
  const low = isLowSample(n);

  return (
    <div
      className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 rounded border border-brass/35 bg-ink-950/85 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-brass/95 shadow-sm backdrop-blur-sm"
      title={`${n} scored predictions on THE FLOOR`}
    >
      <span className="tabular-nums">{dir}</span>
      <span className="text-wire-600"> · n={n}</span>
      {low ? <span className="text-amber/80"> · ?</span> : null}
    </div>
  );
}
