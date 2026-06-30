import type { RunState } from "../lib/types";

interface Props {
  runState: RunState;
  activeCount: number;
  doneCount: number;
  totalRooms: number;
  tickerHint: string;
  ledgerCount?: number;
  onOpenBacktest?: () => void;
  onOpenLedger?: () => void;
  onOpenShortcuts?: () => void;
  onOpenMemo?: () => void;
  onOpenShadowBench?: () => void;
  onOpenReplay?: () => void;
  onOpenWeather?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}

const STATUS_COPY: Record<
  RunState,
  { label: string; tone: string; dot: string; pulse: boolean }
> = {
  idle: {
    label: "Standby",
    tone: "text-wire-300",
    dot: "bg-wire-600",
    pulse: false,
  },
  running: {
    label: "On Shift",
    tone: "text-phos phos-glow-soft",
    dot: "bg-phos",
    pulse: true,
  },
  complete: {
    label: "Clocked Out",
    tone: "text-brass brass-glow-soft",
    dot: "bg-brass",
    pulse: false,
  },
  error: {
    label: "Fault",
    tone: "text-siren siren-glow",
    dot: "bg-siren",
    pulse: true,
  },
};

export function SystemBar({
  runState,
  activeCount,
  doneCount,
  totalRooms,
  tickerHint,
  ledgerCount = 0,
  onOpenBacktest,
  onOpenLedger,
  onOpenShortcuts,
  onOpenMemo,
  onOpenShadowBench,
  onOpenReplay,
  onOpenWeather,
  theme = "light",
  onToggleTheme,
}: Props) {
  const s = STATUS_COPY[runState];

  return (
    <header className="relative z-20 flex flex-col border-b border-wire-800/80 bg-ink-950/95 backdrop-blur-md">
      <div className="flex items-stretch">
      {/* hairline brass sheen along the very top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/45 to-transparent" />

      {/* Brand */}
      <div className="flex items-center gap-3 border-r border-wire-800/80 px-5 py-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-[3px] border border-brass/35 bg-gradient-to-b from-ink-800 to-ink-950 text-brass shadow-brass-soft">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d="M4 20V11M9 20V5M14 20V9M19 20V3"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="leading-none">
          <div className="text-[9px] font-medium uppercase tracking-[0.42em] text-brass/70">
            after-hours
          </div>
          <div className="mt-1 font-display text-[15px] font-bold tracking-[0.16em] text-wire-100">
            THE&nbsp;<span className="text-brass brass-glow-soft">FLOOR</span>
          </div>
        </div>
      </div>

      {/* Live stat rail */}
      <div className="hidden flex-1 items-stretch md:flex">
        <Stat label="tickers" value={tickerHint || "—"} wide />
        <Stat label="desks" value={String(totalRooms)} mono />
        <Stat
          label="working"
          value={String(activeCount)}
          mono
          tone={activeCount > 0 ? "text-phos phos-glow-soft" : "text-wire-400"}
        />
        <Stat label="cleared" value={String(doneCount)} mono />
      </div>

      <div className="ml-auto md:ml-0" />

      {/* Desk tools */}
      <div className="hidden items-center gap-2 border-l border-wire-800/80 px-3 sm:flex">
        {onOpenReplay && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenReplay}
            className="rounded border border-brass/40 bg-brass/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20 active:translate-y-px"
            title="Shift replay (R)"
          >
            replay
          </button>
        ) : null}
        {onOpenShadowBench && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenShadowBench}
            className="rounded border border-phos/40 bg-phos/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-phos transition hover:bg-phos/20 active:translate-y-px"
            title="Counterfactual committee (B)"
          >
            shadow
          </button>
        ) : null}
        {onOpenWeather && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenWeather}
            className="rounded border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber transition hover:bg-amber/20 active:translate-y-px"
            title="Shift weather report (W)"
          >
            weather
          </button>
        ) : null}
        {onOpenMemo && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenMemo}
            className="rounded border border-brass/50 bg-brass/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20 active:translate-y-px"
          >
            memo
          </button>
        ) : null}
        {onOpenBacktest ? (
          <button
            type="button"
            onClick={onOpenBacktest}
            title="Backtester"
            className="rounded border border-phos/40 bg-phos/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-phos transition hover:bg-phos/20 active:translate-y-px"
          >
            backtest
          </button>
        ) : null}
        {onOpenLedger ? (
          <button
            type="button"
            onClick={onOpenLedger}
            className="relative rounded border border-wire-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-300 transition hover:border-brass/60 hover:text-brass active:translate-y-px"
          >
            ledger
            {ledgerCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 font-mono text-[9px] font-bold text-ink-950">
                {ledgerCount > 99 ? "99" : ledgerCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {onOpenShortcuts ? (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts"
            className="rounded border border-wire-700 px-2 py-1.5 font-mono text-[11px] text-wire-400 transition hover:border-brass/60 hover:text-brass active:translate-y-px"
          >
            ?
          </button>
        ) : null}
        {onToggleTheme ? (
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to paper (light) theme" : "Switch to after-hours (dark) theme"}
            aria-label="Toggle color theme"
            className="rounded border border-wire-700 px-2 py-1.5 text-wire-400 transition hover:border-brass/60 hover:text-brass active:translate-y-px"
          >
            {theme === "dark" ? (
              /* sun — switch to light */
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M19.2 4.8l-1.8 1.8M6.6 17.4l-1.8 1.8" />
              </svg>
            ) : (
              /* moon — switch to dark */
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
              </svg>
            )}
          </button>
        ) : null}
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 border-l border-wire-800/80 px-5 py-3">
        <span className="relative flex h-2.5 w-2.5">
          {s.pulse ? (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${s.dot} animate-ping`}
            />
          ) : null}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`}
          />
        </span>
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.34em] ${s.tone}`}
        >
          {s.label}
        </span>
      </div>
      </div>

      {/* Mobile stat strip */}
      <div className="flex items-center justify-between gap-3 border-t border-wire-800/60 px-4 py-1.5 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="truncate font-mono text-[10px] text-wire-400">{tickerHint || "—"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-[10px] text-wire-500">
          <span>
            <span className="text-phos">{activeCount}</span> live
          </span>
          <span>
            <span className="text-brass">{doneCount}</span>/{totalRooms}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenReplay && runState === "complete" ? (
            <IconBtn label="Shift Replay" onClick={onOpenReplay}>
              R
            </IconBtn>
          ) : null}
          {onOpenShadowBench && runState === "complete" ? (
            <IconBtn label="Shadow Bench" onClick={onOpenShadowBench}>
              B
            </IconBtn>
          ) : null}
          {onOpenWeather && runState === "complete" ? (
            <IconBtn label="Weather Report" onClick={onOpenWeather}>
              W
            </IconBtn>
          ) : null}
          {onOpenMemo && runState === "complete" ? (
            <IconBtn label="Memo" onClick={onOpenMemo}>
              M
            </IconBtn>
          ) : null}
          {onOpenShortcuts ? (
            <IconBtn label="Shortcuts" onClick={onOpenShortcuts}>
              ?
            </IconBtn>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded border border-wire-700 px-2 py-1 font-mono text-[10px] text-wire-400 transition hover:border-brass/60 hover:text-brass active:translate-y-px"
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  mono,
  wide,
  tone = "text-wire-200",
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
  tone?: string;
}) {
  return (
    <div
      className={`flex flex-col justify-center gap-1 border-r border-wire-900/70 px-5 py-2.5 ${
        wide ? "min-w-0 max-w-[280px] flex-1" : ""
      }`}
    >
      <span className="text-[9px] uppercase tracking-[0.32em] text-wire-600">
        {label}
      </span>
      <span
        className={`truncate text-[13px] font-semibold tracking-[0.08em] ${
          mono ? "font-mono tabular-nums" : "font-display"
        } ${tone}`}
      >
        {value}
      </span>
    </div>
  );
}
