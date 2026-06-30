import { formatHitRate } from "../../lib/agentScorecards";
import type { LeaderboardEntry } from "../../lib/leaderboard";
import { InvestorAvatar } from "../InvestorAvatar";

interface Props {
  entry: LeaderboardEntry;
}

export function LeaderboardRow({ entry }: Props) {
  return (
    <tr className="border-b border-wire-900/60 hover:bg-ink-900/40">
      <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-brass">#{entry.rank}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <InvestorAvatar agentKey={entry.agent_key} name={entry.display_name} size={28} />
          <div>
            <p className="font-display text-[13px] text-wire-100">{entry.display_name}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-wire-600">
              {entry.tier}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-phos">
        {formatHitRate(entry.direction_hit_rate)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-wire-300">
        {formatHitRate(entry.target_hit_rate)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-wire-500">
        {entry.predictions_scored ?? "—"}
      </td>
      <td className="hidden px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-wire-500 sm:table-cell">
        {entry.avg_confidence != null ? Math.round(entry.avg_confidence) : "—"}
      </td>
    </tr>
  );
}
