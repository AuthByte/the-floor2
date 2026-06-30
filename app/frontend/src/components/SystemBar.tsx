import type { RunState, PaperTradingSummary } from "../lib/types";
import { LAYOUT_SKIN_META, type LayoutSkin } from "../lib/layoutSkin";
import { AccountMenu } from "./AccountMenu";
import { NotificationBell } from "./social/NotificationBell";
import { PaperDeskChip } from "./PaperDeskChip";
import { LegalFooterLinks } from "./legal/LegalFooterLinks";

interface Props {
  runState: RunState;
  ledgerCount?: number;
  onOpenLedger?: () => void;
  onOpenShortcuts?: () => void;
  onOpenTour?: () => void;
  onOpenMemo?: () => void;
  onOpenShadowBench?: () => void;
  onOpenReplay?: () => void;
  onOpenWeather?: () => void;
  onOpenBacktest?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  layoutSkin?: LayoutSkin;
  onToggleLayoutSkin?: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
  onOpenAccountSettings?: () => void;
  planBadge?: "FREE" | "PRO" | null;
  activeView?: "floor" | "feed";
  onViewChange?: (view: "floor" | "feed") => void;
  onOpenPortfolio?: () => void;
  paperDeskSummary?: PaperTradingSummary | null;
  onOpenMemberDesks?: () => void;
  onOpenPersonaMint?: () => void;
  onOpenSchedule?: () => void;
  shelvedCount?: number;
  serverShiftLive?: boolean;
  nextScheduleChip?: string | null;
  onOpenPost?: (postId: string) => void;
  onOpenProfile?: (handle: string) => void;
  showNotifications?: boolean;
}

export function SystemBar({
  runState,
  ledgerCount = 0,
  onOpenLedger,
  onOpenShortcuts,
  onOpenTour,
  onOpenMemo,
  onOpenShadowBench,
  onOpenReplay,
  onOpenWeather,
  onOpenBacktest,
  theme = "light",
  onToggleTheme,
  layoutSkin = "ops",
  onToggleLayoutSkin,
  userEmail,
  onSignOut,
  onOpenAccountSettings,
  planBadge = null,
  activeView = "floor",
  onViewChange,
  onOpenPortfolio,
  paperDeskSummary = null,
  onOpenMemberDesks,
  onOpenPersonaMint,
  onOpenSchedule,
  shelvedCount = 0,
  serverShiftLive = false,
  nextScheduleChip = null,
  onOpenPost,
  onOpenProfile,
  showNotifications = false,
}: Props) {
  const layoutMeta = LAYOUT_SKIN_META[layoutSkin];
  const altSkin: LayoutSkin = layoutSkin === "ops" ? "gallery" : "ops";
  const altMeta = LAYOUT_SKIN_META[altSkin];

  return (
    <header className="desk-system-bar relative z-20 flex flex-col border-b border-wire-800/80 bg-ink-950/95 backdrop-blur-md">
      <div className="flex items-stretch">
      {/* hairline brass sheen along the very top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/45 to-transparent" />

      {/* Brand */}
      <div className="flex items-center gap-3 border-r border-wire-800/80 px-5 py-3">
        <div className="relative flex h-10 w-10 animate-soft-float items-center justify-center rounded-[3px] border border-brass/35 bg-gradient-to-b from-ink-800 to-ink-950 text-brass shadow-brass-soft">
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
        {onViewChange ? (
          <div
            data-tour="view-toggle"
            className="ml-2 flex items-center gap-1 border-l border-wire-800/80 pl-3"
          >
            {(["floor", "feed"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => onViewChange(view)}
                className={`rounded px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] transition ${
                  activeView === view
                    ? "border border-brass/40 bg-brass/10 text-brass"
                    : "border border-transparent text-wire-600 hover:text-wire-300"
                }`}
              >
                {view}
              </button>
            ))}
            {onOpenTour ? (
              <button
                type="button"
                onClick={onOpenTour}
                title="Guided desk tour"
                className="ml-1 rounded border border-wire-700 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-wire-500 transition hover:border-brass/60 hover:text-brass"
              >
                tour
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* Desk tools */}
      <div
        data-tour="system-bar-tools"
        className="hidden items-center gap-2 border-l border-wire-800/80 px-3 sm:flex"
      >
        {onOpenBacktest && runState !== "running" ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenBacktest();
            }}
            className="desk-toolbar-btn rounded border border-wire-600/50 bg-ink-900 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-300 hover:border-brass/40 hover:text-brass"
            title="Historical committee backtest"
          >
            backtest
          </button>
        ) : null}
        {onOpenSchedule ? (
          <>
            {nextScheduleChip ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSchedule();
                }}
                className="hidden max-w-[220px] truncate rounded border border-wire-800 bg-ink-900/80 px-2.5 py-1.5 font-mono text-[9px] tracking-[0.06em] text-wire-400 transition hover:border-phos/35 hover:text-phos lg:block"
                title={`Next scheduled shift: ${nextScheduleChip}`}
              >
                <span className="text-wire-600">Next · </span>
                {nextScheduleChip}
              </button>
            ) : null}
            <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSchedule();
            }}
            className="desk-toolbar-btn relative rounded border border-phos/35 bg-phos/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-phos hover:bg-phos/20"
            title="Schedule desk (S)"
          >
            schedule
            {serverShiftLive ? (
              <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-phos shadow-[0_0_6px_rgb(var(--phos)/0.8)]" />
            ) : null}
          </button>
          </>
        ) : null}
        {onOpenReplay && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenReplay}
            className="desk-toolbar-btn rounded border border-brass/40 bg-brass/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass hover:bg-brass/20"
            title="Shift replay (R)"
          >
            replay
          </button>
        ) : null}
        {onOpenShadowBench && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenShadowBench}
            className="desk-toolbar-btn rounded border border-phos/40 bg-phos/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-phos hover:bg-phos/20"
            title="Counterfactual committee (B)"
          >
            shadow
          </button>
        ) : null}
        {onOpenWeather && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenWeather}
            className="desk-toolbar-btn rounded border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber hover:bg-amber/20"
            title="Shift weather report (W)"
          >
            weather
          </button>
        ) : null}
        {onOpenMemo && runState === "complete" ? (
          <button
            type="button"
            onClick={onOpenMemo}
            className="desk-toolbar-btn rounded border border-brass/50 bg-brass/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass hover:bg-brass/20"
          >
            memo
          </button>
        ) : null}
        {shelvedCount > 0 ? (
          <span
            className="desk-toolbar-btn rounded border border-wire-700/80 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-500"
            title="Shifts on the shelf — scroll to tray below system bar"
          >
            shelf · {shelvedCount}
          </span>
        ) : null}
        {onOpenLedger ? (
          <button
            type="button"
            onClick={onOpenLedger}
            className="desk-toolbar-btn relative rounded border border-wire-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-300 hover:border-brass/60 hover:text-brass"
          >
            ledger
            {ledgerCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 animate-pop-in items-center justify-center rounded-full bg-brass px-1 font-mono text-[9px] font-bold text-ink-950">
                {ledgerCount > 99 ? "99" : ledgerCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {onOpenMemberDesks ? (
          <button
            type="button"
            onClick={onOpenMemberDesks}
            className="desk-toolbar-btn rounded border border-wire-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-300 hover:border-brass/60 hover:text-brass"
            title="Saved member desks"
          >
            desks
          </button>
        ) : null}
        {onOpenPersonaMint && runState !== "running" ? (
          <button
            type="button"
            onClick={onOpenPersonaMint}
            className="desk-toolbar-btn rounded border border-amber-900/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/90 hover:border-amber-600/60 hover:text-amber-300"
            title="Mint a persona agent from public text or X profile"
          >
            mint
          </button>
        ) : null}
        {onOpenPortfolio ? (
          <PaperDeskChip
            summary={paperDeskSummary}
            onClick={onOpenPortfolio}
          />
        ) : null}
        {showNotifications && onOpenPost ? (
          <NotificationBell onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} />
        ) : null}
        {onOpenShortcuts ? (
          <button
            type="button"
            data-tour="shortcuts-btn"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts"
            className="rounded border border-wire-700 px-2 py-1.5 font-mono text-[11px] text-wire-400 transition hover:border-brass/60 hover:text-brass active:translate-y-px"
          >
            ?
          </button>
        ) : null}
        {onToggleLayoutSkin ? (
          <button
            type="button"
            onClick={onToggleLayoutSkin}
            title={`Switch to ${altMeta.label} — ${altMeta.description}`}
            className={`desk-layout-toggle desk-toolbar-btn rounded border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] transition hover:border-brass/60 hover:text-brass ${
              layoutSkin === "gallery"
                ? "border-brass/50 bg-brass/10 text-brass"
                : "border-wire-700 text-wire-400"
            }`}
          >
            {layoutMeta.short}
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

      <AccountMenu
        runState={runState}
        userEmail={userEmail}
        onSignOut={onSignOut}
        onOpenSettings={onOpenAccountSettings}
        planBadge={planBadge}
      />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-wire-800/50 px-4 py-1">
        <LegalFooterLinks variant="desk" className="!text-[9px] !tracking-[0.12em]" />
        <p className="hidden font-mono text-[9px] tracking-[0.1em] text-wire-700 sm:block">
          Simulation only · not investment advice
        </p>
      </div>

      {/* Mobile toolbar */}
      <div className="flex items-center justify-end gap-1.5 border-t border-wire-800/60 px-3 py-1.5 sm:hidden">
          {onOpenBacktest && runState !== "running" ? (
            <IconBtn label="Backtest" onClick={() => onOpenBacktest?.()}>
              BT
            </IconBtn>
          ) : null}
          {onOpenSchedule ? (
            <IconBtn label="Schedule desk" onClick={onOpenSchedule}>
              S
            </IconBtn>
          ) : null}
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
