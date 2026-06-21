export interface WatchlistPreset {
  id: string;
  label: string;
  tickers: string;
  hint?: string;
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
