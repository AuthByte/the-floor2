import type { CompletePayload, FinalDecisionAction } from "./types";

const STORAGE_KEY = "floor.shiftLedger";
const MAX_ENTRIES = 40;

export interface ShiftSummaryLine {
  ticker: string;
  action: string;
  confidence: number | null;
}

export interface ShiftRecord {
  id: string;
  ts: number;
  tickers: string[];
  model: string;
  initialCash: number;
  analystCount: number;
  decisions: Record<string, FinalDecisionAction> | null;
  prices: Record<string, number> | null;
  summary: ShiftSummaryLine[];
}

export interface SaveShiftInput {
  tickers: string;
  model: string;
  initialCash: number;
  analystCount: number;
  payload: CompletePayload;
}

function parseSummary(
  decisions: Record<string, FinalDecisionAction> | null,
): ShiftSummaryLine[] {
  if (!decisions) return [];
  return Object.entries(decisions).map(([ticker, d]) => ({
    ticker,
    action: d.action,
    confidence:
      typeof d.confidence === "number"
        ? Math.round(Math.max(0, Math.min(100, d.confidence)))
        : null,
  }));
}

export function loadShiftLedger(): ShiftRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isShiftRecord);
  } catch {
    return [];
  }
}

function isShiftRecord(v: unknown): v is ShiftRecord {
  if (!v || typeof v !== "object") return false;
  const o = v as ShiftRecord;
  return typeof o.id === "string" && typeof o.ts === "number" && Array.isArray(o.tickers);
}

function persist(entries: ShiftRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function saveShiftRecord(input: SaveShiftInput): ShiftRecord {
  const tickers = input.tickers
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const decisions = input.payload.decisions ?? null;
  const record: ShiftRecord = {
    id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    tickers,
    model: input.model,
    initialCash: input.initialCash,
    analystCount: input.analystCount,
    decisions,
    prices: input.payload.current_prices ?? null,
    summary: parseSummary(decisions),
  };
  const next = [record, ...loadShiftLedger()].slice(0, MAX_ENTRIES);
  persist(next);
  return record;
}

export function deleteShiftRecord(id: string): void {
  persist(loadShiftLedger().filter((e) => e.id !== id));
}

export function clearShiftLedger(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatShiftDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
