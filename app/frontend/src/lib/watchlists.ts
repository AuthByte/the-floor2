export interface WatchlistPreset {
  id: string;
  label: string;
  tickers: string;
  hint?: string;
  autoPublish?: boolean;
}

export const WATCHLIST_PRESETS: WatchlistPreset[] = [
  {
    id: "mag7",
    label: "Mag 7",
    tickers: "AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA",
    hint: "mega-cap tech",
  },
  {
    id: "semis",
    label: "Semis",
    tickers: "NVDA, AMD, AVGO, INTC, QCOM, MU",
    hint: "chip cycle",
  },
  {
    id: "finance",
    label: "Banks",
    tickers: "JPM, BAC, GS, MS, WFC",
    hint: "money center",
  },
  {
    id: "energy",
    label: "Energy",
    tickers: "XOM, CVX, COP, SLB, OXY",
    hint: "oil & gas",
  },
  {
    id: "retail",
    label: "Retail",
    tickers: "WMT, COST, TGT, HD, LOW",
    hint: "consumer",
  },
];

const BUILTIN_IDS = new Set(WATCHLIST_PRESETS.map((p) => p.id));

/** Built-in floor presets cannot enable auto-publish — duplicate to a member list first. */
export function isBuiltinPreset(id: string): boolean {
  return BUILTIN_IDS.has(id);
}
