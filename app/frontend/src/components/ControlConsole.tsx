import { useEffect, useMemo, useRef, useState } from "react";
import { OPENROUTER_MODELS } from "../lib/models";
import type { RunState } from "../lib/types";
import { parseWatchlistInput } from "../lib/tickerInput";
import { WATCHLIST_PRESETS, isBuiltinPreset, type WatchlistPreset } from "../lib/watchlists";

interface Props {
  tickers: string;
  onTickersChange: (v: string) => void;
  extraWatchlists?: WatchlistPreset[];
  model: string;
  onModelChange: (v: string) => void;
  initialCash: number;
  onCashChange: (v: number) => void;
  openrouterKey: string;
  runState: RunState;
  errorMsg: string | null;
  resolvingTickers?: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onShelf?: () => void;
  canShelf?: boolean;
  enabledAnalystCount: number;
  onOpenSettings?: () => void;
  onManageWatchlists?: () => void;
}

export function ControlConsole(p: Props) {
  const tickerRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!popRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const isRunning = p.runState === "running";
  const isResolving = Boolean(p.resolvingTickers);
  const canStart =
    p.tickers.trim().length > 0 &&
    p.openrouterKey.trim().length > 0 &&
    p.enabledAnalystCount > 0 &&
    !isRunning &&
    !isResolving;

  const startBlockers = useMemo(() => {
    if (canStart || isRunning || isResolving) return [];
    const blockers: string[] = [];
    if (!p.tickers.trim()) blockers.push("Enter tickers or describe a watchlist");
    if (!p.openrouterKey.trim()) blockers.push("Add OpenRouter key in account settings");
    if (p.enabledAnalystCount === 0) blockers.push("Enable analysts in Manage Roster");
    return blockers;
  }, [canStart, isRunning, isResolving, p.tickers, p.openrouterKey, p.enabledAnalystCount]);

  const watchlistPresets = useMemo(
    () => [...WATCHLIST_PRESETS, ...(p.extraWatchlists ?? [])],
    [p.extraWatchlists],
  );

  const activeModel =
    OPENROUTER_MODELS.find((m) => m.id === p.model)?.label ?? p.model;

  return (
    <section
      data-tour="control-console"
      className="desk-control-console relative z-10 border-b border-wire-800/80 bg-ink-900/80 backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-[1700px] grid-cols-1 gap-x-6 gap-y-3 px-5 py-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-end">
        <TickerField
          tickers={p.tickers}
          onTickersChange={p.onTickersChange}
          disabled={isRunning}
          tickerRef={tickerRef}
          watchlistPresets={watchlistPresets}
          onManageWatchlists={p.onManageWatchlists}
        />

        <Field label="model" hint="openrouter">
          <div ref={popRef} className="relative w-full">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 bg-transparent text-left text-base font-semibold tracking-[0.04em] text-wire-100 outline-none"
            >
              <span className="truncate">{activeModel}</span>
              <Caret open={menuOpen} />
            </button>
            {menuOpen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-3 max-h-72 overflow-auto rounded-lg border border-wire-700 bg-ink-950/98 p-1 shadow-float backdrop-blur-md">
                {OPENROUTER_MODELS.map((m) => {
                  const active = m.id === p.model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        p.onModelChange(m.id);
                        setMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-xs tracking-[0.04em] transition ${
                        active
                          ? "bg-brass/10 text-brass"
                          : "text-wire-200 hover:bg-wire-900/70"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brass" : "bg-wire-700"}`}
                        />
                        {m.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-600">
                        {m.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Field>

        <Field label="cash" hint="usd float">
          <div className="flex w-full items-baseline gap-1">
            <span className="text-sm text-wire-500">$</span>
            <input
              value={Number.isFinite(p.initialCash) ? String(p.initialCash) : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                p.onCashChange(v ? Number(v) : 0);
              }}
              className="w-full bg-transparent font-mono text-base font-semibold tracking-[0.08em] tabular-nums text-wire-100 outline-none"
            />
          </div>
        </Field>

        <div className="flex flex-col items-end justify-end gap-2 pb-2">
          {startBlockers.length > 0 ? (
            <ul className="max-w-[220px] text-right text-[9px] leading-relaxed text-wire-600">
              {startBlockers.map((b) => (
                <li key={b}>
                  {b.includes("account settings") && p.onOpenSettings ? (
                    <button
                      type="button"
                      onClick={p.onOpenSettings}
                      className="text-brass/90 underline decoration-brass/30 underline-offset-2 transition hover:text-brass"
                    >
                      {b}
                    </button>
                  ) : (
                    b
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-2">
            {p.runState === "complete" || p.runState === "error" ? (
              <button
                type="button"
                onClick={p.onReset}
                className="rounded-md border border-wire-700 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-wire-300 transition hover:border-wire-500 hover:text-wire-100 active:translate-y-px"
              >
                reset
              </button>
            ) : null}
            {isRunning ? (
              <>
                {p.onShelf ? (
                  <button
                    type="button"
                    onClick={p.onShelf}
                    disabled={!p.canShelf}
                    title={
                      p.canShelf
                        ? "Park this shift on the shelf and start another"
                        : "Shelf full — discard a shelved shift first"
                    }
                    className={`rounded-md border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] transition active:translate-y-px ${
                      p.canShelf
                        ? "border-brass/50 bg-brass/10 text-brass hover:bg-brass/20"
                        : "cursor-not-allowed border-wire-800 text-wire-700"
                    }`}
                  >
                    shelf
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={p.onStop}
                  className="group flex animate-scale-in items-center gap-2 rounded-md border border-siren/70 bg-siren/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] text-siren shadow-siren transition hover:bg-siren hover:text-ink-950 active:translate-y-px"
                >
                  <span className="h-2 w-2 animate-pulse-dot rounded-[1px] bg-siren group-hover:bg-ink-950" />
                  kill shift
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={p.onStart}
                disabled={!canStart}
                className={`group relative flex items-center gap-2 overflow-hidden rounded-md border px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] transition active:translate-y-px ${
                  canStart
                    ? "border-brass/70 bg-brass/15 text-brass shadow-brass hover:bg-brass hover:text-ink-950"
                    : "cursor-not-allowed border-wire-800 text-wire-700"
                }`}
              >
                {canStart ? (
                  <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/15 animate-sheen" />
                ) : null}
                <span
                  className={`h-2 w-2 rounded-[1px] ${canStart ? "bg-brass group-hover:bg-ink-950" : "bg-wire-800"}`}
                />
                {isResolving ? "resolving…" : "start shift"}
              </button>
            )}
          </div>
        </div>
      </div>
      {p.errorMsg ? (
        <div className="flex animate-wire-in items-center gap-2 border-t border-siren/30 bg-siren/[0.06] px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-siren">
          <span className="text-siren siren-glow">▲</span> fault
          <span className="text-siren/60">//</span>
          <span className="normal-case tracking-normal text-siren/90">
            {p.errorMsg}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function TickerField({
  tickers,
  onTickersChange,
  disabled,
  tickerRef,
  watchlistPresets,
  onManageWatchlists,
}: {
  tickers: string;
  onTickersChange: (v: string) => void;
  disabled: boolean;
  tickerRef: React.RefObject<HTMLInputElement>;
  watchlistPresets: WatchlistPreset[];
  onManageWatchlists?: () => void;
}) {
  const mode = useMemo(() => parseWatchlistInput(tickers), [tickers]);
  const modeHint =
    mode.kind === "direct"
      ? `${mode.tickers.length} symbol${mode.tickers.length === 1 ? "" : "s"} · instant`
      : tickers.trim()
        ? "natural language · resolves on start"
        : "symbols or natural language";

  return (
    <div className="group block">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[9px] font-medium uppercase tracking-[0.34em] text-wire-500 transition-colors group-focus-within:text-brass/80">
          watchlist
        </span>
        <div className="flex items-center gap-2">
          {onManageWatchlists ? (
            <button
              type="button"
              onClick={onManageWatchlists}
              className="text-[9px] uppercase tracking-[0.18em] text-brass/80 underline decoration-brass/30 underline-offset-2 transition hover:text-brass"
            >
              Manage
            </button>
          ) : null}
          <span
            className={`text-[9px] uppercase tracking-[0.22em] transition-colors ${
              mode.kind === "direct" ? "text-phos/90" : "text-wire-600"
            }`}
          >
            {modeHint}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-wire-800 pb-2 transition-colors focus-within:border-brass">
        <span className="text-brass/80">&rsaquo;</span>
        <input
          ref={tickerRef}
          value={tickers}
          onChange={(e) => onTickersChange(e.target.value)}
          placeholder="AAPL, MSFT — or analyze Mag 7 tech leaders"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="characters"
          disabled={disabled}
          className="w-full bg-transparent font-mono text-base font-semibold tracking-[0.14em] text-wire-100 placeholder-wire-700 outline-none disabled:opacity-50"
        />
        <span className="ml-1 inline-block h-3.5 w-[2px] bg-brass/80 opacity-0 transition-opacity group-focus-within:animate-blink group-focus-within:opacity-100" />
      </div>
      {!disabled ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {watchlistPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onTickersChange(preset.tickers)}
              title={preset.hint}
              className="relative rounded border border-wire-800 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-wire-500 transition hover:border-brass/50 hover:text-brass active:translate-y-px"
            >
              {preset.autoPublish && !isBuiltinPreset(preset.id) ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-phos"
                  aria-hidden
                />
              ) : null}
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="group block">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[9px] font-medium uppercase tracking-[0.34em] text-wire-500 transition-colors group-focus-within:text-brass/80">
          {label}
        </span>
        {hint ? (
          <span className="text-[9px] uppercase tracking-[0.22em] text-wire-600">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 border-b border-wire-800 pb-2 transition-colors focus-within:border-brass">
        <span className="text-brass/80">&rsaquo;</span>
        {children}
        <span className="ml-1 inline-block h-3.5 w-[2px] bg-brass/80 opacity-0 transition-opacity group-focus-within:animate-blink group-focus-within:opacity-100" />
      </div>
    </label>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-brass transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
