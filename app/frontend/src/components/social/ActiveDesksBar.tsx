import { useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { fetchActivePresence } from "../../lib/floorSocial/apiExtended";
import { getSupabase } from "../../lib/supabase";
import type { ShiftPresence } from "../../lib/floorSocial/types";

interface Props {
  entries?: ShiftPresence[];
  onRefresh?: () => void;
}

export function ActiveDesksBar({ entries: entriesProp }: Props) {
  const { session } = useAuth();
  const [entries, setEntries] = useState<ShiftPresence[]>(entriesProp ?? []);
  const [loading, setLoading] = useState(!entriesProp);

  useEffect(() => {
    if (entriesProp) {
      setEntries(entriesProp);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase || !session?.user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchActivePresence(supabase)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [entriesProp, session?.user?.id]);

  if (loading && !entries.length) return null;
  if (!entries.length) return null;

  const count = entries.length;

  return (
    <div className="shrink-0 border-b border-wire-800/80 bg-ink-950/80 px-4 py-2">
      <div className="flex items-center gap-3 overflow-x-auto">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.28em] text-brass/70">
          {count} desk{count === 1 ? "" : "s"} active
        </span>
        <div className="flex min-w-0 gap-2">
          {entries.map((entry) => {
            const name =
              entry.author?.displayName ??
              entry.author?.handle ??
              entry.userId.slice(0, 6);
            const tickers = entry.tickers.slice(0, 3).join(", ");
            return (
              <div
                key={entry.userId}
                className="flex shrink-0 items-center gap-2 rounded border border-wire-800/80 bg-ink-900/50 px-2.5 py-1"
                title={`${name} — ${entry.tickers.join(", ")}`}
              >
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-phos" />
                <span className="max-w-[10ch] truncate font-mono text-[10px] text-wire-300">
                  {name}
                </span>
                {tickers ? (
                  <span className="font-mono text-[9px] text-wire-600">{tickers}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
