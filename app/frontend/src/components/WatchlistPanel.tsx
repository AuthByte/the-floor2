import { useCallback, useEffect, useState } from "react";

import { useUserData } from "../contexts/UserDataContext";
import {
  buildDigestCaptionRich,
  parseWatchlistTickers,
} from "../lib/watchlistDigest";
import {
  isBuiltinPreset,
  WATCHLIST_PRESETS,
  type WatchlistPreset,
} from "../lib/watchlists";

interface Props {
  open: boolean;
  onClose: () => void;
  lastShiftPreview?: {
    tickers: string[];
    summary: import("../lib/shiftLedger").ShiftSummaryLine[];
    snapshot?: import("../lib/floorSocial/types").FloorPostSnapshot | null;
  } | null;
}

function newWatchlistId(): string {
  return crypto.randomUUID();
}

function normalizeTickersInput(raw: string): string {
  return parseWatchlistTickers(raw).join(", ");
}

export function WatchlistPanel({ open, onClose, lastShiftPreview }: Props) {
  const { watchlists, setWatchlists, cloud } = useUserData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftTickers, setDraftTickers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(
    async (next: WatchlistPreset[]) => {
      setBusy(true);
      setError(null);
      try {
        await setWatchlists(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save watchlists");
      } finally {
        setBusy(false);
      }
    },
    [setWatchlists],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function startEdit(wl: WatchlistPreset) {
    setEditingId(wl.id);
    setDraftLabel(wl.label);
    setDraftTickers(wl.tickers);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftLabel("");
    setDraftTickers("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const label = draftLabel.trim();
    const tickers = normalizeTickersInput(draftTickers);
    if (!label) {
      setError("List name is required.");
      return;
    }
    if (!tickers) {
      setError("Add at least one ticker.");
      return;
    }
    const next = watchlists.map((w) =>
      w.id === editingId ? { ...w, label, tickers } : w,
    );
    await persist(next);
    cancelEdit();
  }

  async function handleCreate() {
    const tickers = "AAPL, MSFT";
    const next: WatchlistPreset[] = [
      ...watchlists,
      {
        id: newWatchlistId(),
        label: "New watchlist",
        tickers,
        autoPublish: false,
      },
    ];
    await persist(next);
    const created = next[next.length - 1];
    startEdit(created);
  }

  async function handleDelete(id: string) {
    await persist(watchlists.filter((w) => w.id !== id));
    if (editingId === id) cancelEdit();
  }

  async function handleToggleAutoPublish(id: string) {
    const next = watchlists.map((w) =>
      w.id === id ? { ...w, autoPublish: !w.autoPublish } : w,
    );
    await persist(next);
  }

  async function handleDuplicatePreset(preset: WatchlistPreset) {
    const next: WatchlistPreset[] = [
      ...watchlists,
      {
        id: newWatchlistId(),
        label: `${preset.label} clone`,
        tickers: preset.tickers,
        hint: preset.hint,
        autoPublish: false,
      },
    ];
    await persist(next);
  }

  async function moveList(id: string, direction: -1 | 1) {
    const idx = watchlists.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= watchlists.length) return;
    const next = [...watchlists];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    await persist(next);
  }

  const previewWatchlist =
    watchlists.find((w) => w.autoPublish) ?? watchlists[0] ?? null;

  const previewCaption =
    previewWatchlist && lastShiftPreview
      ? buildDigestCaptionRich(
          previewWatchlist,
          lastShiftPreview.tickers,
          lastShiftPreview.summary,
          lastShiftPreview.snapshot,
        )
      : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[46] flex animate-fade-in items-stretch justify-center bg-ink-950/70 p-0 backdrop-blur-[3px] sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-lg animate-scale-in flex-col overflow-hidden border border-brass/20 bg-ink-950 shadow-float sm:my-auto sm:max-h-[88vh] sm:rounded-lg"
        role="dialog"
        aria-labelledby="watchlist-panel-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
            ticker baskets
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <h2
                id="watchlist-panel-title"
                className="font-display text-lg font-bold tracking-wide text-wire-100"
              >
                My Watchlists
              </h2>
              <p className="mt-1 text-[11px] text-wire-500">
                Curate lists for shifts — auto-publish matching runs to your feed
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy}
              className="shrink-0 rounded border border-brass/50 bg-brass/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-brass hover:bg-brass/20 disabled:opacity-40"
            >
              + New
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!cloud ? (
            <p className="rounded border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-amber/90">
              Sign in to sync watchlists and auto-publish across devices.
            </p>
          ) : null}

          {error ? <p className="text-[11px] text-siren">{error}</p> : null}

          {watchlists.length === 0 ? (
            <p className="text-[11px] text-wire-500">
              No custom lists yet. Duplicate a floor preset or create a new list.
            </p>
          ) : (
            <ul className="space-y-2">
              {watchlists.map((wl, index) => (
                <li
                  key={wl.id}
                  className="rounded border border-wire-800 bg-ink-900/40 p-3"
                >
                  {editingId === wl.id ? (
                    <div className="space-y-2">
                      <input
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        className="w-full rounded border border-wire-800 bg-ink-950 px-3 py-2 text-[12px] text-wire-200 outline-none focus:border-brass/50"
                        placeholder="List name"
                        maxLength={80}
                      />
                      <textarea
                        value={draftTickers}
                        onChange={(e) => setDraftTickers(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded border border-wire-800 bg-ink-950 px-3 py-2 font-mono text-[11px] tracking-wide text-wire-200 outline-none focus:border-brass/50"
                        placeholder="AAPL, MSFT, NVDA"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={busy}
                          className="rounded border border-brass/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-brass"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded border border-wire-700 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button
                          type="button"
                          disabled={index === 0 || busy}
                          onClick={() => void moveList(wl.id, -1)}
                          className="text-[10px] text-wire-600 hover:text-brass disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === watchlists.length - 1 || busy}
                          onClick={() => void moveList(wl.id, 1)}
                          className="text-[10px] text-wire-600 hover:text-brass disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-wire-100">
                          {wl.label}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-wire-500">
                          {parseWatchlistTickers(wl.tickers).join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggleAutoPublish(wl.id)}
                          disabled={busy || isBuiltinPreset(wl.id)}
                          title={
                            isBuiltinPreset(wl.id)
                              ? "Built-in presets cannot auto-publish"
                              : wl.autoPublish
                                ? "Auto-publish on"
                                : "Auto-publish off"
                          }
                          className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] transition ${
                            wl.autoPublish
                              ? "border-phos/50 bg-phos/10 text-phos"
                              : "border-wire-700 text-wire-600 hover:border-wire-500"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          Auto {wl.autoPublish ? "●" : "○"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(wl)}
                          disabled={busy}
                          className="rounded border border-wire-700 px-2 py-0.5 font-mono text-[9px] text-wire-400 hover:border-brass/40 hover:text-brass"
                          aria-label={`Edit ${wl.label}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(wl.id)}
                          disabled={busy}
                          className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-wire-600 hover:border-siren/40 hover:text-siren"
                          aria-label={`Delete ${wl.label}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <section className="rounded border border-wire-800/80 bg-ink-900/30 p-3">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
              Duplicate floor preset
            </h3>
            <p className="mt-1 text-[10px] text-wire-500">
              Built-in chips are read-only — save a copy to enable auto-publish.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WATCHLIST_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => void handleDuplicatePreset(preset)}
                  disabled={busy}
                  className="rounded border border-wire-800 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-wire-500 transition hover:border-brass/40 hover:text-brass disabled:opacity-40"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded border border-wire-800/60 bg-ink-950/50 p-3">
            <p className="text-[10px] leading-relaxed text-wire-500">
              Auto-publish posts when a completed shift&apos;s tickers are{" "}
              <span className="text-wire-400">all</span> in this list. Debounced 5 min per
              list on this device.
            </p>
            {previewCaption ? (
              <div className="mt-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">
                  Preview (last shift)
                </p>
                <pre className="mt-1 whitespace-pre-wrap rounded border border-wire-800/80 bg-ink-900/50 p-2 font-mono text-[10px] leading-relaxed text-wire-300">
                  {previewCaption}
                </pre>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="shrink-0 border-t border-wire-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded border border-wire-700 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 hover:border-wire-500 hover:text-wire-200"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
