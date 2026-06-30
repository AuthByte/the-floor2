import { useEffect, useMemo, useState } from "react";
import type { ShiftRecord } from "../lib/shiftLedger";
import type { StoredShift } from "../lib/userData/types";
import { formatShiftDate } from "../lib/shiftLedger";

type LedgerEntry = ShiftRecord | StoredShift;

interface Props {
  open: boolean;
  onClose: () => void;
  entries: LedgerEntry[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onShare?: (entry: LedgerEntry) => void;
  onReplay?: (entry: LedgerEntry) => void;
  onScheduleAgain?: (entry: LedgerEntry) => void;
  cloudSynced?: boolean;
}

const ACTION_CHIP: Record<string, string> = {
  buy: "border-phos/40 bg-phos/10 text-phos",
  cover: "border-phos/30 bg-phos/5 text-phos",
  sell: "border-siren/40 bg-siren/10 text-siren",
  short: "border-siren/40 bg-siren/10 text-siren",
  hold: "border-amber/40 bg-amber/10 text-amber",
};

const ACTION_TEXT: Record<string, string> = {
  buy: "text-phos",
  cover: "text-phos",
  sell: "text-siren",
  short: "text-siren",
  hold: "text-amber",
};

export function ShiftLedgerPanel({
  open,
  onClose,
  entries,
  onDelete,
  onClearAll,
  onShare,
  onReplay,
  onScheduleAgain,
  cloudSynced = false,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const archiveHint = useMemo(
    () =>
      cloudSynced
        ? "Completed shifts sync to your account. Boss memos, replay data, and full payloads stay archived after you reset the floor."
        : "Completed shifts saved on this browser. Boss memos and verdicts stay here after you reset the floor.",
    [cloudSynced],
  );

  if (!open) return null;

  return (
    <div
      className="desk-backdrop absolute inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/55 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-lg animate-slide-in-right flex-col border-l border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="shift-ledger-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">
                desk archive
              </div>
              <h2
                id="shift-ledger-title"
                className="mt-1 font-display text-base font-bold tracking-wide text-wire-100"
              >
                Shift Ledger
              </h2>
              <p className="mt-1 text-[11px] text-wire-500">{archiveHint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>
          {entries.length > 0 ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Clear all archived shifts?")) return;
                  onClearAll();
                  setExpandedId(null);
                }}
                className="rounded border border-wire-800 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-wire-500 transition hover:border-siren/50 hover:text-siren"
              >
                clear all
              </button>
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="h-1.5 w-1.5 rounded-full bg-wire-700" />
              <p className="text-[11px] uppercase tracking-[0.28em] text-wire-600">
                ledger empty
              </p>
              <p className="max-w-[28ch] text-[11px] leading-relaxed text-wire-700">
                Finish a shift and the boss memo is archived here automatically.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <LedgerRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() =>
                    setExpandedId((id) => (id === entry.id ? null : entry.id))
                  }
                  onDelete={() => {
                    onDelete(entry.id);
                    if (expandedId === entry.id) setExpandedId(null);
                  }}
                  onShare={onShare ? () => onShare(entry) : undefined}
                  onReplay={
                    onReplay && entry.replay?.timeline?.length
                      ? () => onReplay(entry)
                      : undefined
                  }
                  onScheduleAgain={onScheduleAgain ? () => onScheduleAgain(entry) : undefined}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function LedgerRow({
  entry,
  expanded,
  onToggle,
  onDelete,
  onShare,
  onReplay,
  onScheduleAgain,
}: {
  entry: LedgerEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onShare?: () => void;
  onReplay?: () => void;
  onScheduleAgain?: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-lg border border-wire-800 bg-ink-900/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-ink-800/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] font-semibold tracking-wide text-wire-100">
              {entry.tickers.join(", ") || "—"}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-wire-600">
              {formatShiftDate(entry.ts)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entry.summary.length === 0 ? (
              <span className="text-[10px] text-wire-600">no decisions</span>
            ) : (
              entry.summary.map((s) => (
                <span
                  key={`${entry.id}-${s.ticker}`}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                    ACTION_CHIP[s.action] ?? "border-wire-700 text-wire-400"
                  }`}
                >
                  {s.ticker} {s.action}
                  {s.confidence != null ? ` ${s.confidence}%` : ""}
                </span>
              ))
            )}
          </div>
          <div className="mt-1.5 text-[10px] text-wire-600">
            {entry.analystCount} analysts · {entry.model.split("/").pop()} · $
            {entry.initialCash.toLocaleString()}
            {entry.replay?.timeline?.length ? " · replay saved" : ""}
            {entry.payload?.shift_artifacts
              ? ` · ${Object.keys(entry.payload.shift_artifacts).length} artifact sets`
              : ""}
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-brass/70">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <div className="border-t border-wire-800/80 px-3 py-3">
          {entry.summary.map((s) => {
            const full = entry.decisions?.[s.ticker];
            return (
              <div key={`${entry.id}-detail-${s.ticker}`} className="mb-3 last:mb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-wire-100">
                    {s.ticker}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                      ACTION_TEXT[s.action] ?? "text-wire-300"
                    }`}
                  >
                    {s.action}
                  </span>
                  {entry.prices?.[s.ticker] != null ? (
                    <span className="font-mono text-[10px] text-wire-500">
                      @ ${entry.prices[s.ticker].toFixed(2)}
                    </span>
                  ) : null}
                </div>
                {full?.reasoning ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-wire-400">
                    {full.reasoning}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="mt-3 flex flex-wrap gap-3">
            {onReplay ? (
              <button
                type="button"
                onClick={onReplay}
                className="rounded border border-phos/40 bg-phos/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-phos transition hover:bg-phos/20"
              >
                play replay
              </button>
            ) : null}
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="rounded border border-brass/40 bg-brass/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20"
              >
                share to feed
              </button>
            ) : null}
            {onScheduleAgain ? (
              <button
                type="button"
                onClick={onScheduleAgain}
                className="rounded border border-phos/30 bg-phos/5 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-phos transition hover:bg-phos/15"
              >
                schedule again
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDelete}
              className="text-[9px] uppercase tracking-[0.2em] text-wire-600 transition hover:text-siren"
            >
              delete entry
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
