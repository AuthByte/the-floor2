import { useEffect, useMemo, useRef, useState } from "react";
import { OLLAMA_PROVIDER, OPENROUTER_MODELS, ollamaPreset } from "../lib/models";
import type { RunState } from "../lib/types";
import { parseWatchlistInput } from "../lib/tickerInput";
import { WATCHLIST_PRESETS } from "../lib/watchlists";

interface Props {
  tickers: string;
  onTickersChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  provider: string;
  ollamaModels: string[];
  initialCash: number;
  onCashChange: (v: number) => void;
  openrouterKey: string;
  onKeyChange: (v: string) => void;
  alpacaPaper: boolean;
  onAlpacaPaperChange: (v: boolean) => void;
  runRiskPipeline: boolean;
  onRunRiskPipelineChange: (v: boolean) => void;
  alpacaKeyId: string;
  onAlpacaKeyIdChange: (v: string) => void;
  alpacaSecret: string;
  onAlpacaSecretChange: (v: string) => void;
  memoEmail: boolean;
  onMemoEmailChange: (v: boolean) => void;
  digestEmail: string;
  onDigestEmailChange: (v: string) => void;
  resendApiKey: string;
  onResendApiKeyChange: (v: string) => void;
  runState: RunState;
  errorMsg: string | null;
  resolvingTickers?: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  enabledAnalystCount: number;
}

export function ControlConsole(p: Props) {
  const [showKey, setShowKey] = useState(false);
  const [keysShelved, setKeysShelved] = useState(() => {
    try {
      return localStorage.getItem("hf-keys-shelved") !== "false";
    } catch {
      return true;
    }
  });
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

  useEffect(() => {
    try {
      localStorage.setItem("hf-keys-shelved", keysShelved ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [keysShelved]);

  const isRunning = p.runState === "running";
  const isResolving = Boolean(p.resolvingTickers);
  const isLocalProvider = p.provider === OLLAMA_PROVIDER;
  const needsKey = !isLocalProvider;
  const canStart =
    p.tickers.trim().length > 0 &&
    (!needsKey || p.openrouterKey.trim().length > 0) &&
    p.enabledAnalystCount > 0 &&
    !isRunning &&
    !isResolving;

  const startBlockers = useMemo(() => {
    if (canStart || isRunning || isResolving) return [];
    const blockers: string[] = [];
    if (!p.tickers.trim()) blockers.push("Enter tickers or describe a watchlist");
    if (needsKey && !p.openrouterKey.trim())
      blockers.push("Add OpenRouter key (unshelve keys below)");
    if (p.enabledAnalystCount === 0) blockers.push("Enable analysts in Manage Roster");
    return blockers;
  }, [canStart, isRunning, isResolving, needsKey, p.tickers, p.openrouterKey, p.enabledAnalystCount]);

  const ollamaPresets = useMemo(
    () => p.ollamaModels.map((name) => ollamaPreset(name)),
    [p.ollamaModels],
  );

  const activeModel =
    OPENROUTER_MODELS.find((m) => m.id === p.model)?.label ??
    ollamaPresets.find((m) => m.id === p.model)?.label ??
    p.model;

  return (
    <section className="relative z-10 border-b border-wire-800/80 bg-ink-900/80 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1700px] grid-cols-1 gap-x-6 gap-y-3 px-5 py-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-end">
        <TickerField
          tickers={p.tickers}
          onTickersChange={p.onTickersChange}
          disabled={isRunning}
          tickerRef={tickerRef}
        />

        <Field label="model" hint={isLocalProvider ? "ollama · local" : "openrouter"}>
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
                <ModelGroup label="OpenRouter" hint="cloud" />
                {OPENROUTER_MODELS.map((m) => (
                  <ModelRow
                    key={m.id}
                    preset={m}
                    active={m.id === p.model}
                    onPick={() => {
                      p.onModelChange(m.id);
                      setMenuOpen(false);
                    }}
                  />
                ))}
                {ollamaPresets.length > 0 ? (
                  <>
                    <ModelGroup label="Local · Ollama" hint="no key" />
                    {ollamaPresets.map((m) => (
                      <ModelRow
                        key={m.id}
                        preset={m}
                        active={m.id === p.model}
                        onPick={() => {
                          p.onModelChange(m.id);
                          setMenuOpen(false);
                        }}
                      />
                    ))}
                  </>
                ) : null}
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

        <div className="flex flex-col items-end justify-end gap-2">
          {startBlockers.length > 0 ? (
            <ul className="max-w-[220px] text-right text-[9px] leading-relaxed text-wire-600">
              {startBlockers.map((b) => (
                <li key={b}>{b}</li>
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
            <button
              type="button"
              onClick={p.onStop}
              className="group flex items-center gap-2 rounded-md border border-siren/70 bg-siren/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] text-siren shadow-siren transition hover:bg-siren hover:text-ink-950 active:translate-y-px"
            >
              <span className="h-2 w-2 rounded-[1px] bg-siren group-hover:bg-ink-950" />
              kill shift
            </button>
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

      <div className="border-t border-wire-800/80 px-5 py-2">
        <button
          type="button"
          onClick={() => setKeysShelved((v) => !v)}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-wire-800/90 bg-ink-950/40 px-3 py-2 text-left transition hover:border-brass/40"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-wire-400">
            {keysShelved ? "Keys shelved" : "Keys & integrations"}
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-wire-600">
            {keysShelved ? "show openrouter · alpaca · resend" : "hide"}
          </span>
        </button>
      </div>

      {!keysShelved ? (
        <div className="border-t border-wire-800/80 px-5 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              label="openrouter key"
              hint={
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-[10px] uppercase tracking-[0.2em] text-wire-500 transition hover:text-brass"
                >
                  {showKey ? "hide" : "reveal"}
                </button>
              }
            >
              <input
                value={p.openrouterKey}
                onChange={(e) => p.onKeyChange(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="sk-or-v1-…"
                spellCheck={false}
                autoCorrect="off"
                className="w-full bg-transparent font-mono text-sm text-wire-100 placeholder-wire-700 outline-none"
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="border-t border-wire-800/80 px-5 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={p.alpacaPaper}
            onChange={(e) => p.onAlpacaPaperChange(e.target.checked)}
            disabled={isRunning}
            className="h-3.5 w-3.5 rounded border-wire-600 bg-ink-950 text-brass accent-brass"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-wire-300">
            Alpaca paper
          </span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-wire-600">
            submit boss orders after shift
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={p.runRiskPipeline}
            onChange={(e) => p.onRunRiskPipelineChange(e.target.checked)}
            disabled={isRunning}
            className="h-3.5 w-3.5 rounded border-wire-600 bg-ink-950 text-brass accent-brass"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-wire-300">
            Risk pipeline
          </span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-wire-600">
            forge → research → scenarios → watchtower
          </span>
        </label>
        {p.alpacaPaper && !keysShelved ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="alpaca key id" hint="or .env">
              <input
                value={p.alpacaKeyId}
                onChange={(e) => p.onAlpacaKeyIdChange(e.target.value)}
                type="password"
                placeholder="PK…"
                spellCheck={false}
                disabled={isRunning}
                className="w-full bg-transparent font-mono text-sm text-wire-100 placeholder-wire-700 outline-none disabled:opacity-50"
              />
            </Field>
            <Field label="alpaca secret" hint="paper only">
              <input
                value={p.alpacaSecret}
                onChange={(e) => p.onAlpacaSecretChange(e.target.value)}
                type="password"
                placeholder="••••"
                spellCheck={false}
                disabled={isRunning}
                className="w-full bg-transparent font-mono text-sm text-wire-100 placeholder-wire-700 outline-none disabled:opacity-50"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="border-t border-wire-800/80 px-5 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={p.memoEmail}
            onChange={(e) => p.onMemoEmailChange(e.target.checked)}
            disabled={isRunning}
            className="h-3.5 w-3.5 rounded border-wire-600 bg-ink-950 text-brass accent-brass"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-wire-300">
            Email boss memo
          </span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-wire-600">
            Resend digest when shift completes
          </span>
        </label>
        {p.memoEmail && !keysShelved ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="your email" hint="must match Resend account in test mode">
              <input
                value={p.digestEmail}
                onChange={(e) => p.onDigestEmailChange(e.target.value)}
                type="email"
                placeholder="you@example.com"
                spellCheck={false}
                disabled={isRunning}
                className="w-full bg-transparent font-mono text-sm text-wire-100 placeholder-wire-700 outline-none disabled:opacity-50"
              />
            </Field>
            <p className="sm:col-span-2 text-[10px] leading-relaxed text-wire-600">
              Uses Resend. With the default test sender{" "}
              <span className="font-mono text-wire-500">onboarding@resend.dev</span>, mail
              only delivers to the email you signed up with on Resend — not arbitrary
              addresses. Verify a domain to send anywhere.
            </p>
            <Field label="resend api key" hint="or .env">
              <input
                value={p.resendApiKey}
                onChange={(e) => p.onResendApiKeyChange(e.target.value)}
                type="password"
                placeholder="re_…"
                spellCheck={false}
                disabled={isRunning}
                className="w-full bg-transparent font-mono text-sm text-wire-100 placeholder-wire-700 outline-none disabled:opacity-50"
              />
            </Field>
          </div>
        ) : null}
      </div>

      {p.errorMsg ? (
        <div className="flex items-center gap-2 border-t border-siren/30 bg-siren/[0.06] px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-siren">
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
}: {
  tickers: string;
  onTickersChange: (v: string) => void;
  disabled: boolean;
  tickerRef: React.RefObject<HTMLInputElement>;
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
        <span
          className={`text-[9px] uppercase tracking-[0.22em] transition-colors ${
            mode.kind === "direct" ? "text-phos/90" : "text-wire-600"
          }`}
        >
          {modeHint}
        </span>
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
          {WATCHLIST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onTickersChange(preset.tickers)}
              title={preset.hint}
              className="rounded border border-wire-800 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-wire-500 transition hover:border-brass/50 hover:text-brass active:translate-y-px"
            >
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

function ModelGroup({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2 first:pt-1">
      <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-wire-500">
        {label}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-700">
        {hint}
      </span>
    </div>
  );
}

function ModelRow({
  preset,
  active,
  onPick,
}: {
  preset: { id: string; label: string; hint: string };
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-xs tracking-[0.04em] transition ${
        active ? "bg-brass/10 text-brass" : "text-wire-200 hover:bg-wire-900/70"
      }`}
    >
      <span className="flex items-center gap-2 truncate">
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brass" : "bg-wire-700"}`}
        />
        {preset.label}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-600">
        {preset.hint}
      </span>
    </button>
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
