import {
  formatHitRate,
  isLowSample,
  useAgentScorecard,
} from "../lib/agentScorecards";

interface Props {
  agentKey: string;
  compact?: boolean;
}

export function AgentScorecardBadge({ agentKey, compact }: Props) {
  const card = useAgentScorecard(agentKey);

  if (!card?.predictions_scored) return null;

  const dir = formatHitRate(card.direction_hit_rate);
  const tgt = formatHitRate(card.target_hit_rate);
  const low = isLowSample(card.predictions_scored);

  if (compact) {
    return (
      <span
        className="font-mono text-[8px] tabular-nums text-brass/90"
        title={`${card.predictions_scored} scored predictions`}
      >
        {dir} dir{low ? " · low n" : ""}
      </span>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-wire-600">
      <span className="text-brass">{dir} directional</span>
      {card.target_hit_rate != null ? <span>{tgt} targets</span> : null}
      <span className={low ? "text-amber/90" : "text-wire-700"}>
        n={card.predictions_scored}
        {low ? " · low sample" : ""}
      </span>
    </div>
  );
}
