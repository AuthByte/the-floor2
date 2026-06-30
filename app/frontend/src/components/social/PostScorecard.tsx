import type { PostScorecard, ScorecardHorizon } from "../../lib/floorSocial/types";

interface Props {
  scorecard: PostScorecard;
  tickers?: string[];
  compact?: boolean;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n < 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(0)}`;
}

function CorrectBadge({ correct, horizon }: { correct?: boolean; horizon: ScorecardHorizon }) {
  if (correct == null) {
    return (
      <span className="rounded border border-wire-800 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-wire-600">
        {horizon} pending
      </span>
    );
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${
        correct
          ? "border-phos/40 bg-phos/10 text-phos"
          : "border-siren/40 bg-siren/10 text-siren"
      }`}
    >
      {horizon} {correct ? "correct" : "miss"}
    </span>
  );
}

function groupByTicker(scorecard: PostScorecard, tickers: string[]) {
  const keys = (tickers.length ? tickers : Object.keys(scorecard)).filter(
    (k) => k !== "agent_outcomes",
  );
  return keys.map((ticker) => {
    const direct = scorecard[ticker];
    const w1 = scorecard[`${ticker}:1w`] ?? scorecard[`${ticker}_1w`];
    const m1 = scorecard[`${ticker}:1m`] ?? scorecard[`${ticker}_1m`];
    const horizons: Array<{ horizon: ScorecardHorizon; entry: (typeof scorecard)[string] }> = [];
    if (w1) horizons.push({ horizon: "1w", entry: w1 });
    if (m1) horizons.push({ horizon: "1m", entry: m1 });
    if (!w1 && !m1 && direct) {
      horizons.push({ horizon: direct.horizon ?? "1w", entry: direct });
    }
    return { ticker, horizons };
  });
}

export function PostScorecard({ scorecard, tickers = [], compact }: Props) {
  const rows = groupByTicker(scorecard, tickers).filter((r) => r.horizons.length > 0);
  if (!rows.length) return null;

  return (
    <div className={`space-y-2 ${compact ? "" : "rounded border border-wire-800/80 bg-ink-950/40 p-3"}`}>
      {!compact ? (
        <h4 className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
          Boss vs market
        </h4>
      ) : null}
      <ul className="space-y-2">
        {rows.map(({ ticker, horizons }) => (
          <li
            key={ticker}
            className="rounded border border-wire-800/60 bg-ink-900/30 px-2.5 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-wire-100">{ticker}</span>
              {horizons[0]?.entry.bossAction ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-brass">
                  boss {horizons[0].entry.bossAction}
                </span>
              ) : null}
            </div>
            <div className={`mt-1.5 grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
              {horizons.map(({ horizon, entry }) => (
                <div
                  key={`${ticker}-${horizon}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-wire-800/40 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-wire-600">
                      {horizon}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-wire-300">
                      {formatPrice(entry.publishPrice)} → {formatPrice(entry.currentPrice)}
                    </div>
                    <div
                      className={`font-mono text-[10px] ${
                        (entry.pnlPct ?? 0) >= 0 ? "text-phos" : "text-siren"
                      }`}
                    >
                      {formatPct(entry.pnlPct)}
                    </div>
                  </div>
                  <CorrectBadge correct={entry.correct} horizon={horizon} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
