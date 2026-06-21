/** Client-side watchlist parsing — mirrors backend ticker_resolve fast path. */

const MAX_SHIFT_TICKERS = 8;

const TICKER_NOISE = new Set([
  "A", "I", "AI", "IT", "US", "UK", "EU", "OR", "AN", "AS", "AT", "BE", "BY", "DO", "GO",
  "IF", "IN", "IS", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "WE",
  "ALL", "AND", "ARE", "BUY", "CAP", "CEO", "CFO", "DAY", "EPS", "ETF", "FED", "FOR",
  "GDP", "IPO", "LOW", "MID", "NEW", "OLD", "OUT", "PE", "RUN", "SEC", "THE", "TOP",
  "USA", "VS", "YOY", "BIG", "HOT", "NOW", "KEY", "MAX", "MIN", "NET", "PRO", "RAW",
  "RED", "SMALL", "LARGE", "MICRO", "NANO", "MEGA", "HIGH", "BEST", "GOOD", "LONG",
  "SHORT", "BULL", "BEAR", "MOON", "WIRE", "NYSE", "USD", "EUR", "HOLD", "SELL",
  "QOQ", "YTD", "ATH", "ATL", "RSI", "MACD", "DCF", "ESG", "ADR", "REIT",
]);

const FINANCE_DESCRIPTOR =
  /\b(small|large|mid|micro|nano|mega|cap|growth|value|dividend|peptide|biotech|semiconductor|semiconductors|tech|technology|bank|banks|energy|stock|stocks|sector|sectors|etf|etfs|compare|analyze|analysis|leaders?|giants?|mag|pharma|healthcare|fintech|retail|industrial|materials|utilities|reit|undervalued|overvalued|momentum|contrarian|blue\s*chip)\b/i;

const TICKER_SHAPE = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

export type WatchlistInputKind = "direct" | "resolve";

export interface WatchlistInputParse {
  kind: WatchlistInputKind;
  tickers: string[];
}

function looksNaturalLanguage(text: string): boolean {
  if (FINANCE_DESCRIPTOR.test(text)) return true;
  const words = text.match(/[a-zA-Z][a-zA-Z'.-]*/g) ?? [];
  if (words.length >= 3) return true;
  if (words.length === 2 && FINANCE_DESCRIPTOR.test(words.join(" "))) return true;
  return false;
}

function isTickerToken(raw: string): boolean {
  const sym = raw.trim().toUpperCase().replace(/\.$/, "");
  if (!sym || TICKER_NOISE.has(sym)) return false;
  return TICKER_SHAPE.test(sym);
}

function extractExplicitTickers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const nl = looksNaturalLanguage(text);

  const ingest = (raw: string) => {
    if (nl && raw !== raw.toUpperCase()) return;
    if (!isTickerToken(raw)) return;
    const sym = raw.trim().toUpperCase().replace(/\.$/, "");
    if (seen.has(sym)) return;
    seen.add(sym);
    out.push(sym);
  };

  for (const chunk of text.split(/[,;\n]+/)) {
    for (const token of chunk.split(/\s+/)) {
      const raw = token.trim().replace(/\.$/, "");
      if (raw) ingest(raw);
    }
  }
  return out;
}

function isPureTickerQuery(text: string, tickers: string[]): boolean {
  if (tickers.length === 0) return false;
  let remainder = text;
  for (const sym of [...tickers].sort((a, b) => b.length - a.length)) {
    remainder = remainder.replace(new RegExp(`\\b${sym}\\b`, "gi"), " ");
  }
  remainder = remainder.replace(/[^a-zA-Z]+/g, "");
  return remainder.length === 0;
}

/** True when the watchlist is plain symbols — no resolve API / LLM needed. */
export function isDirectTickerInput(query: string): boolean {
  return parseWatchlistInput(query).kind === "direct";
}

/** Classify watchlist input and extract symbols when direct. */
export function parseWatchlistInput(query: string): WatchlistInputParse {
  const text = query.trim();
  if (!text) return { kind: "resolve", tickers: [] };

  const tickers = extractExplicitTickers(text).slice(0, MAX_SHIFT_TICKERS);
  if (tickers.length > 0 && isPureTickerQuery(text, tickers)) {
    return { kind: "direct", tickers };
  }
  return { kind: "resolve", tickers: [] };
}
