import type { FinalDecisionAction } from "../types";
import type { FloorPostSnapshot, PostScorecard, ScorecardHorizon } from "./types";

const HOLD_FLAT_THRESHOLD_PCT = 2;

export function evaluateBossCall(
  bossAction: FinalDecisionAction["action"],
  publishPrice: number,
  currentPrice: number,
): boolean {
  if (publishPrice <= 0) return false;

  const pnlPct = ((currentPrice - publishPrice) / publishPrice) * 100;

  switch (bossAction) {
    case "buy":
    case "cover":
      return pnlPct > 0;
    case "sell":
    case "short":
      return pnlPct < 0;
    case "hold":
      return Math.abs(pnlPct) <= HOLD_FLAT_THRESHOLD_PCT;
    default:
      return false;
  }
}

export function computeScorecard(
  snapshot: FloorPostSnapshot,
  currentPrices: Record<string, number | null | undefined>,
  horizon: ScorecardHorizon = "1w",
): PostScorecard {
  const scorecard: PostScorecard = {};

  for (const tickerSnap of snapshot.tickers) {
    const { ticker } = tickerSnap;
    const publishPrice = tickerSnap.price;
    const rawCurrent = currentPrices[ticker];
    const currentPrice =
      typeof rawCurrent === "number" && Number.isFinite(rawCurrent) ? rawCurrent : null;
    const bossAction = tickerSnap.bossDecision?.action ?? null;

    let pnlPct: number | null = null;
    if (publishPrice != null && currentPrice != null && publishPrice > 0) {
      pnlPct = ((currentPrice - publishPrice) / publishPrice) * 100;
    }

    const entry: PostScorecard[string] = {
      publishPrice,
      currentPrice,
      bossAction,
      pnlPct,
      horizon,
    };

    if (bossAction && publishPrice != null && currentPrice != null) {
      entry.correct = evaluateBossCall(bossAction, publishPrice, currentPrice);
    }

    scorecard[ticker] = entry;
  }

  return scorecard;
}
