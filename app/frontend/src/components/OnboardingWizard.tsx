import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { Scanlines } from "./Scanlines";
import { agentForRoomId } from "../lib/agents";
import { STARTER_LEGEND_KEYS } from "../lib/onboarding";
import { ROOM_ASSETS } from "../lib/roomAssets";
import { WATCHLIST_PRESETS } from "../lib/watchlists";

export interface OnboardingResult {
  watchlistPresetId: string;
  tickers: string;
  enabledAgents: string[];
  openrouterKey: string;
}

interface Props {
  open: boolean;
  onComplete: (result: OnboardingResult, startShift: boolean) => void;
}

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "watchlist", label: "Watchlist" },
  { id: "legends", label: "Committee" },
  { id: "keys", label: "Clearance" },
] as const;

const STARTER_LEGENDS = STARTER_LEGEND_KEYS.map((key) => {
  const agent = agentForRoomId(key);
  const assets = ROOM_ASSETS[key];
  return {
    key,
    name: agent?.name ?? key,
    callsign: agent?.callsign ?? "—",
    desk: agent?.desk ?? "",
    roomImage: assets?.roomImage ?? `/rooms/${key}.png`,
  };
});

function StepDots({ index }: { index: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((s, i) => (
        <span
          key={s.id}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === index ? "w-5 bg-brass" : i < index ? "w-1.5 bg-brass/40" : "w-1.5 bg-wire-800"
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function OnboardingWizard({ open, onComplete }: Props) {
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [presetId, setPresetId] = useState(WATCHLIST_PRESETS[0]?.id ?? "mag7");
  const [enabledLegends, setEnabledLegends] = useState<Set<string>>(
    () => new Set(STARTER_LEGEND_KEYS),
  );
  const [openrouterKey, setOpenrouterKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPresetId(WATCHLIST_PRESETS[0]?.id ?? "mag7");
    setEnabledLegends(new Set(STARTER_LEGEND_KEYS));
    setOpenrouterKey("");
  }, [open]);

  const selectedPreset =
    WATCHLIST_PRESETS.find((p) => p.id === presetId) ?? WATCHLIST_PRESETS[0];

  const toggleLegend = useCallback((key: string) => {
    setEnabledLegends((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const finish = useCallback(
    (startShift: boolean) => {
      const tickers = selectedPreset?.tickers ?? "AAPL, MSFT, NVDA";
      onComplete(
        {
          watchlistPresetId: selectedPreset?.id ?? presetId,
          tickers,
          enabledAgents: [...enabledLegends],
          openrouterKey: openrouterKey.trim(),
        },
        startShift,
      );
    },
    [onComplete, selectedPreset, presetId, enabledLegends, openrouterKey],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const canRunShift = openrouterKey.trim().length > 0 && enabledLegends.size > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="pointer-events-auto absolute inset-0 bg-ink-950/88 backdrop-blur-[3px]"
        aria-hidden
      />
      <Scanlines lite />

      <div className="onboarding-wizard-card relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-wire-700/90 bg-ink-950/98 shadow-[0_32px_100px_rgba(0,0,0,0.55)] animate-scale-in">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/55 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brass/[0.06] blur-3xl" />

        <header className="border-b border-wire-900/80 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.38em] text-brass/80">
              member onboarding · {step + 1}/{STEPS.length}
            </p>
            <button
              type="button"
              onClick={() => finish(false)}
              className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-500 transition hover:text-brass"
            >
              skip
            </button>
          </div>
          <StepDots index={step} />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08]">
                <span className="font-display text-2xl font-bold tracking-[0.14em] text-brass">
                  TF
                </span>
              </div>
              <h2
                id={titleId}
                className="font-display text-2xl font-semibold tracking-[0.1em] text-wire-100"
              >
                Welcome to the floor
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-wire-400">
                After-hours committee intelligence — pixel desks, live debate, and
                post-shift memos. A quick setup and you&apos;re cleared for your first
                shift.
              </p>
              <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
                {[
                  "Pick a starter watchlist",
                  "Seat your first legend desks",
                  "Add an API key when you're ready",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-wire-500"
                  >
                    <span className="mt-0.5 text-brass/70">▸</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2
                id={titleId}
                className="font-display text-xl font-semibold tracking-[0.08em] text-wire-100"
              >
                Pick a watchlist
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-wire-500">
                Choose a preset to seed your first shift. You can edit tickers anytime
                from the control console.
              </p>
              <div className="mt-5 grid gap-2">
                {WATCHLIST_PRESETS.map((preset) => {
                  const active = preset.id === presetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPresetId(preset.id)}
                      className={`group rounded-lg border px-4 py-3 text-left transition ${
                        active
                          ? "border-brass/50 bg-brass/[0.08] shadow-[inset_0_0_0_1px_rgba(201,162,39,0.12)]"
                          : "border-wire-800/90 bg-ink-900/40 hover:border-wire-700 hover:bg-ink-900/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`font-mono text-[11px] font-semibold uppercase tracking-[0.24em] ${
                            active ? "text-brass" : "text-wire-300"
                          }`}
                        >
                          {preset.label}
                        </span>
                        {preset.hint ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                            {preset.hint}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 truncate font-mono text-[10px] text-wire-600 group-hover:text-wire-500">
                        {preset.tickers}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2
                id={titleId}
                className="font-display text-xl font-semibold tracking-[0.08em] text-wire-100"
              >
                Seat your committee
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-wire-500">
                Three starter legends — value, growth, and the press wire. Toggle any
                off, but keep at least one desk active.
              </p>
              <div className="mt-5 space-y-2.5">
                {STARTER_LEGENDS.map((legend) => {
                  const on = enabledLegends.has(legend.key);
                  return (
                    <button
                      key={legend.key}
                      type="button"
                      onClick={() => toggleLegend(legend.key)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                        on
                          ? "border-brass/45 bg-brass/[0.06]"
                          : "border-wire-800/80 bg-ink-900/30 opacity-60 hover:opacity-80"
                      }`}
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-wire-800/80 bg-ink-950">
                        <img
                          src={legend.roomImage}
                          alt=""
                          className="h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                        {on ? (
                          <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brass text-[9px] font-bold text-ink-950">
                            ✓
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-[14px] font-semibold tracking-[0.04em] text-wire-100">
                            {legend.name}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] text-brass/70">
                            {legend.callsign}
                          </span>
                        </div>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-wire-600">
                          {legend.desk}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] ${
                          on
                            ? "border-brass/40 text-brass"
                            : "border-wire-700 text-wire-600"
                        }`}
                      >
                        {on ? "seated" : "empty"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2
                id={titleId}
                className="font-display text-xl font-semibold tracking-[0.08em] text-wire-100"
              >
                API clearance
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-wire-500">
                Shifts route through OpenRouter. Paste a key now or skip — you can add
                one later in account settings.
              </p>

              <label className="mt-5 block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.32em] text-wire-600">
                  OpenRouter API key
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder="sk-or-…"
                  className="w-full rounded-[3px] border border-wire-700 bg-ink-950 px-3 py-2.5 font-mono text-sm text-wire-100 outline-none transition placeholder:text-wire-700 focus:border-brass/50"
                />
              </label>

              <div className="mt-4 rounded-lg border border-wire-800/70 bg-ink-900/35 px-3.5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-wire-500">
                  Ready to run
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-wire-400">
                  <span className="text-wire-300">{selectedPreset?.label}</span>
                  {" · "}
                  <span className="text-wire-300">{enabledLegends.size}</span> desks
                  {openrouterKey.trim() ? (
                    <span className="text-emerald-400/80"> · key on file</span>
                  ) : (
                    <span className="text-wire-600"> · no key yet</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-wire-900/80 px-5 py-4 sm:px-6">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded border border-wire-700 px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-wire-400 transition enabled:hover:border-brass/50 enabled:hover:text-brass disabled:opacity-30"
          >
            back
          </button>

          {isLast ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded border border-wire-700 px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-wire-400 transition hover:border-wire-600 hover:text-wire-200"
              >
                enter floor
              </button>
              <button
                type="button"
                disabled={!canRunShift}
                onClick={() => finish(true)}
                title={canRunShift ? undefined : "Add an OpenRouter key to run a shift"}
                className="rounded border border-brass/50 bg-brass/15 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass transition enabled:hover:bg-brass/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                run first shift
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded border border-brass/50 bg-brass/15 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass transition hover:bg-brass/25"
            >
              continue
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
