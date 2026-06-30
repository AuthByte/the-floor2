import type { FloorPostSnapshot } from "./floorSocial/types";
import type { ShiftSummaryLine } from "./shiftLedger";
import { isBuiltinPreset, type WatchlistPreset } from "./watchlists";

export const DIGEST_DEBOUNCE_MS = 5 * 60_000;

export function digestLastRunKey(watchlistId: string): string {
  return `floor.digest.lastRun.${watchlistId}`;
}

export function parseWatchlistTickers(tickers: string): string[] {
  return tickers
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

export function watchlistMatchesShift(
  watchlist: WatchlistPreset,
  shiftTickers: string[],
): boolean {
  if (!shiftTickers.length) return false;
  const presetSet = new Set(parseWatchlistTickers(watchlist.tickers));
  const shiftSet = new Set(shiftTickers.map((t) => t.toUpperCase()));
  if (shiftSet.size === 0) return false;
  for (const t of shiftSet) {
    if (!presetSet.has(t)) return false;
  }
  return true;
}

/**
 * Returns the first auto-publish watchlist whose tickers cover the completed shift.
 * Skips built-in presets and lists debounced within DIGEST_DEBOUNCE_MS.
 */
export function checkAutoPublishWatchlists(
  watchlists: WatchlistPreset[],
  shiftTickers: string[],
  getLastRunTs: (watchlistId: string) => number,
): WatchlistPreset | null {
  const now = Date.now();

  for (const wl of watchlists) {
    if (!wl.autoPublish || isBuiltinPreset(wl.id)) continue;
    if (now - getLastRunTs(wl.id) < DIGEST_DEBOUNCE_MS) continue;
    if (watchlistMatchesShift(wl, shiftTickers)) return wl;
  }
  return null;
}

export function buildDigestCaption(
  tickers: string[],
  summary: ShiftSummaryLine[],
): string {
  const upper = tickers.map((t) => t.toUpperCase());
  const lines = upper.map((t) => {
    const row = summary.find((s) => s.ticker.toUpperCase() === t);
    if (!row) return t;
    const conf =
      row.confidence != null ? ` (${Math.round(row.confidence)}%)` : "";
    return `${t} ${row.action}${conf}`;
  });
  return `Auto digest — ${lines.join(" · ")}`;
}

function formatTickerLine(tickers: string[], summary: ShiftSummaryLine[]): string {
  const upper = tickers.map((t) => t.toUpperCase());
  return upper
    .map((t) => {
      const row = summary.find((s) => s.ticker.toUpperCase() === t);
      if (!row) return t;
      const conf =
        row.confidence != null ? ` (${Math.round(row.confidence)}%)` : "";
      return `${t} ${row.action}${conf}`;
    })
    .join(" · ");
}

function formatCommitteeLine(snapshot?: FloorPostSnapshot | null): string {
  if (!snapshot?.tickers?.length) return "";
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const ts of snapshot.tickers) {
    bullish += ts.tally.bullish;
    bearish += ts.tally.bearish;
    neutral += ts.tally.neutral;
  }
  const parts: string[] = [];
  if (bullish) parts.push(`${bullish} bullish`);
  if (bearish) parts.push(`${bearish} bearish`);
  if (neutral) parts.push(`${neutral} neutral`);
  return parts.length ? `Committee: ${parts.join(" · ")}` : "";
}

export function buildDigestCaptionRich(
  watchlist: WatchlistPreset,
  tickers: string[],
  summary: ShiftSummaryLine[],
  snapshot?: FloorPostSnapshot | null,
): string {
  const header = `${watchlist.label} · auto digest`;
  const tickerLine = formatTickerLine(tickers, summary);
  const committeeLine = formatCommitteeLine(snapshot);
  return [header, tickerLine, committeeLine].filter(Boolean).join("\n");
}
