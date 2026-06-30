import { AGENT_SELECTION_STORAGE, TOGGLEABLE_ANALYST_KEYS } from "../agentSelection";
import type { ShiftSummaryLine } from "../shiftLedger";
import { parseSummaryFromDecisions } from "../shiftLedger";
import type { WatchlistPreset } from "../watchlists";
import type { StoredShift, UserSettings } from "./types";

const SHIFT_STORAGE = "floor.shiftLedger";
const WATCHLIST_STORAGE = "floor.customWatchlists";
const MAX_SHIFTS = 40;

const THEME_STORAGE = "floor.theme";
const MODEL_STORAGE = "floor.model";
const TICKERS_STORAGE = "floor.tickers";
const ALPACA_PAPER_STORAGE = "floor.alpaca.paper";
const RISK_PIPELINE_STORAGE = "floor.risk.pipeline";
const MEMO_EMAIL_STORAGE = "floor.memo.email";
const DIGEST_EMAIL_STORAGE = "floor.digest.email";
const ONBOARDING_STORAGE = "floor.onboarding.done";

export function readLocalSettings(): UserSettings {
  const enabledAgents = readLocalEnabledAgents();
  return {
    model: localStorage.getItem(MODEL_STORAGE) || undefined,
    tickers: localStorage.getItem(TICKERS_STORAGE) || undefined,
    theme: readLocalTheme(),
    initialCash: undefined,
    enabledAgents: enabledAgents ? [...enabledAgents] : undefined,
    alpacaPaper: localStorage.getItem(ALPACA_PAPER_STORAGE) === "1",
    runRiskPipeline: localStorage.getItem(RISK_PIPELINE_STORAGE) !== "0",
    memoEmail: localStorage.getItem(MEMO_EMAIL_STORAGE) === "1",
    digestEmail: localStorage.getItem(DIGEST_EMAIL_STORAGE) || undefined,
    onboarding_completed: localStorage.getItem(ONBOARDING_STORAGE) === "1" || undefined,
  };
}

function readLocalTheme(): "light" | "dark" | undefined {
  const v = localStorage.getItem(THEME_STORAGE);
  return v === "light" || v === "dark" ? v : undefined;
}

function readLocalEnabledAgents(): string[] | null {
  try {
    const raw = localStorage.getItem(AGENT_SELECTION_STORAGE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = new Set<string>(TOGGLEABLE_ANALYST_KEYS);
    return parsed.filter((k): k is string => typeof k === "string" && valid.has(k));
  } catch {
    return null;
  }
}

/** Mirror non-secret prefs to localStorage for fast boot and offline fallback. */
export function writeLocalSettings(settings: UserSettings): void {
  if (settings.model != null) localStorage.setItem(MODEL_STORAGE, settings.model);
  if (settings.tickers != null) localStorage.setItem(TICKERS_STORAGE, settings.tickers);
  if (settings.theme != null) localStorage.setItem(THEME_STORAGE, settings.theme);
  if (settings.enabledAgents != null) {
    localStorage.setItem(AGENT_SELECTION_STORAGE, JSON.stringify(settings.enabledAgents));
  }
  if (settings.alpacaPaper != null) {
    localStorage.setItem(ALPACA_PAPER_STORAGE, settings.alpacaPaper ? "1" : "0");
  }
  if (settings.runRiskPipeline != null) {
    localStorage.setItem(RISK_PIPELINE_STORAGE, settings.runRiskPipeline ? "1" : "0");
  }
  if (settings.memoEmail != null) {
    localStorage.setItem(MEMO_EMAIL_STORAGE, settings.memoEmail ? "1" : "0");
  }
  if (settings.digestEmail != null) {
    localStorage.setItem(DIGEST_EMAIL_STORAGE, settings.digestEmail);
  }
  if (settings.onboarding_completed != null) {
    localStorage.setItem(ONBOARDING_STORAGE, settings.onboarding_completed ? "1" : "0");
  }
}

export function loadLocalShifts(): StoredShift[] {
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredShift).slice(0, MAX_SHIFTS);
  } catch {
    return [];
  }
}

export function persistLocalShifts(shifts: StoredShift[]): void {
  localStorage.setItem(SHIFT_STORAGE, JSON.stringify(shifts.slice(0, MAX_SHIFTS)));
}

export function loadLocalWatchlists(): WatchlistPreset[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWatchlist);
  } catch {
    return [];
  }
}

function isWatchlist(v: unknown): v is WatchlistPreset {
  if (!v || typeof v !== "object") return false;
  const o = v as WatchlistPreset;
  return typeof o.id === "string" && typeof o.label === "string" && typeof o.tickers === "string";
}

function isStoredShift(v: unknown): v is StoredShift {
  if (!v || typeof v !== "object") return false;
  const o = v as StoredShift;
  return typeof o.id === "string" && typeof o.ts === "number" && Array.isArray(o.tickers);
}

export function buildStoredShiftFromInput(
  input: import("./types").SaveShiftInput,
  id?: string,
): StoredShift {
  const tickers = input.tickers
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const decisions = input.payload.decisions ?? null;
  const summary: ShiftSummaryLine[] = parseSummaryFromDecisions(decisions);
  return {
    id: id ?? `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    tickers,
    model: input.model,
    initialCash: input.initialCash,
    analystCount: input.analystCount,
    decisions,
    prices: input.payload.current_prices ?? null,
    summary,
    payload: input.payload,
    replay: input.replay ?? null,
    runId: input.runId ?? null,
  };
}
