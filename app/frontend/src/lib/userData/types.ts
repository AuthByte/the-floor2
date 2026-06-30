import type { CompletePayload, DebateRound } from "../types";
import type { ReplayEvent } from "../shiftReplay";
import type { LogLine } from "../types";
import type { ShiftSummaryLine } from "../shiftLedger";
import type { WatchlistPreset } from "../watchlists";

export interface DebateReplayBundle {
  rounds: DebateRound[];
  activeTicker?: string | null;
}

export interface ShiftReplayArchive {
  shiftStartedAt: number;
  timeline: ReplayEvent[];
  roomIds: string[];
  log?: LogLine[];
  debate?: DebateReplayBundle;
}

export interface WatchlistDigestPrefs {
  enabled?: boolean;
  cadence?: "daily" | "weekly";
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hourUtc?: number;
  email?: boolean;
  emailAddress?: string;
  includeScorecardHits?: boolean;
}

export interface UserSettings {
  model?: string;
  tickers?: string;
  theme?: "light" | "dark";
  initialCash?: number;
  enabledAgents?: string[];
  alpacaPaper?: boolean;
  runRiskPipeline?: boolean;
  memoEmail?: boolean;
  digestEmail?: string;
  watchlistDigest?: WatchlistDigestPrefs;
  migratedFromLocal?: boolean;
  onboarding_completed?: boolean;
}

export interface SaveShiftInput {
  tickers: string;
  model: string;
  initialCash: number;
  analystCount: number;
  payload: CompletePayload;
  replay?: ShiftReplayArchive | null;
  runId?: string | null;
}

export interface StoredShift {
  id: string;
  ts: number;
  runId?: string | null;
  tickers: string[];
  model: string;
  initialCash: number;
  analystCount: number;
  decisions: CompletePayload["decisions"];
  prices: Record<string, number> | null;
  summary: ShiftSummaryLine[];
  payload: CompletePayload | null;
  replay: ShiftReplayArchive | null;
}

export type { WatchlistPreset };
