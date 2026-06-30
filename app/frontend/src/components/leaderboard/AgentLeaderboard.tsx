import { useCallback, useEffect, useState } from "react";

import { formatHitRate } from "../../lib/agentScorecards";
import {
  fetchLeaderboard,
  LEADERBOARD_SORTS,
  LEADERBOARD_TIERS,
  type LeaderboardEntry,
  type LeaderboardSort,
  type LeaderboardTier,
} from "../../lib/leaderboard";
import { LeaderboardRow } from "./LeaderboardRow";

export function AgentLeaderboard() {
  const [tier, setTier] = useState<LeaderboardTier>("legend");
  const [sort, setSort] = useState<LeaderboardSort>("direction_hit_rate");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchLeaderboard({ tier, sort, min_n: 10, limit: 50 });
    setEntries(data.entries);
    setTotal(data.meta.total);
    setLoading(false);
  }, [tier, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <div className="mx-auto flex min-h-0 max-w-5xl flex-col bg-gradient-to-b from-ink-900 to-ink-950 px-4 py-10 pb-16 text-wire-200">
      <header className="mb-8 border-b border-wire-900/80 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-brass">The floor</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-wire-50">Agent leaderboard</h1>
        <p className="mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-wire-500">
          Transparent track records — direction and target accuracy across completed shifts.
          Not investment advice; minimum 10 scored predictions for public ranking.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {LEADERBOARD_TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTier(t.id)}
            className={`rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              tier === t.id
                ? "border-brass/50 bg-brass/10 text-brass"
                : "border-wire-800 text-wire-500 hover:border-wire-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">Sort</span>
        {LEADERBOARD_SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
              sort === s.id ? "text-brass" : "text-wire-600 hover:text-wire-400"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-wire-600">{total} ranked</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-wire-900/80 bg-ink-950/50">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-wire-900 font-mono text-[9px] uppercase tracking-[0.18em] text-wire-600">
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">Agent</th>
              <th className="px-3 py-2 text-right">Direction</th>
              <th className="px-3 py-2 text-right">Targets</th>
              <th className="px-3 py-2 text-right">n</th>
              <th className="hidden px-3 py-2 text-right sm:table-cell">Conf</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center font-mono text-[11px] text-wire-600">
                  Loading scorecards…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center font-mono text-[11px] text-wire-600">
                  No agents meet the minimum sample size yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => <LeaderboardRow key={entry.agent_key} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-8">
        <a
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass hover:text-brass/80"
        >
          ← Back to THE FLOOR
        </a>
      </footer>
      </div>
    </div>
  );
}

/** Compact teaser strip for landing — top legends by direction hit rate. */
export function LeaderboardTeaser() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    void fetchLeaderboard({ tier: "legend", sort: "direction_hit_rate", limit: 5 }).then((data) => {
      setEntries(data.entries.slice(0, 5));
    });
  }, []);

  if (!entries.length) return null;

  return (
    <section className="relative py-16" style={{ background: "#F2EFE7" }}>
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className="font-mono text-[11px] font-medium uppercase tracking-[0.32em]"
              style={{ color: "#A57E22" }}
            >
              Track record
            </p>
            <h2
              className="mt-3 font-display text-[clamp(1.4rem,2.8vw,2rem)] font-semibold"
              style={{ color: "#12110E" }}
            >
              Top legends by direction accuracy
            </h2>
          </div>
          <a
            href="/leaderboard"
            className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#A57E22" }}
          >
            Full leaderboard →
          </a>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {entries.map((entry) => (
            <li
              key={entry.agent_key}
              className="rounded-lg border px-4 py-3"
              style={{ borderColor: "rgba(18,17,14,0.14)", background: "rgba(255,255,255,0.45)" }}
            >
              <p className="font-mono text-[10px] tabular-nums" style={{ color: "#A57E22" }}>
                #{entry.rank}
              </p>
              <p className="mt-1 font-display text-[14px] font-medium" style={{ color: "#12110E" }}>
                {entry.display_name}
              </p>
              <p className="mt-2 font-mono text-[11px]" style={{ color: "#4A463C" }}>
                {formatHitRate(entry.direction_hit_rate)} dir · n={entry.predictions_scored}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
