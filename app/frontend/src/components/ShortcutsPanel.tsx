import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onRestartTour?: () => void;
}

const SHORTCUTS = [
  { keys: "?", desc: "Open shortcuts & guide" },
  { keys: "L", desc: "Open shift ledger" },
  { keys: "S", desc: "Schedule desk — week/month calendar + AI scheduler" },
  { keys: "Shift+S", desc: "Shelf active shift — run another on the floor" },
  { keys: "B", desc: "Open Shadow Bench (after shift completes)" },
  { keys: "T", desc: "Open Committee Backtest (no prior shift needed)" },
  { keys: "R", desc: "Open Shift Replay — scrub the time machine (after shift)" },
  { keys: "W", desc: "Open Weather Report — post-shift committee climate" },
  { keys: "M", desc: "Re-open boss memo (after shift completes)" },
  { keys: "Esc", desc: "Close panels / room detail / debate theater" },
  { keys: "Space / ← →", desc: "In replay: play/pause and step events" },
  { keys: "[ ]", desc: "In replay: slower / faster playback" },
  { keys: "/", desc: "Focus live wire search" },
  { keys: "Click room", desc: "Open agent thesis, charts, and artifacts" },
] as const;

/** Where to find newer floor features — shown in the ? panel. */
const FEATURE_GUIDE = [
  {
    title: "Before you run",
    items: [
      { label: "Watchlists + auto-publish", where: "Console · Manage" },
      { label: "Alpaca paper execute", where: "Boss memo · paper execute" },
      { label: "Form 4 Watch desk", where: "Roster · enable FORM4" },
      { label: "Mint a persona agent", where: "System bar · mint" },
    ],
  },
  {
    title: "During a shift",
    items: [
      { label: "Chair @mention consult", where: "Consult bar · @agent …" },
      { label: "Debate theater (live)", where: "Auto · Argument Room overlay" },
      { label: "Paper P&L chip", where: "System bar · after paper orders" },
    ],
  },
  {
    title: "After shift",
    items: [
      { label: "Boss memo + chair impact", where: "M or System bar · Memo" },
      { label: "Export memo / copy link", where: "Memo footer · outbound bar" },
      { label: "Shadow bench + publish fork", where: "B or System bar · Shadow" },
      { label: "Agent scorecard plaque", where: "Click any legend room" },
    ],
  },
  {
    title: "Social feed",
    items: [
      { label: "Member posts & forks", where: "System bar · feed" },
      { label: "Replay on floor", where: "Post · Replay on floor" },
      { label: "Watch debate (replay)", where: "Replay panel · Watch debate" },
      { label: "Share replay / embed", where: "Post detail · share links" },
      { label: "Agent leaderboard", where: "/leaderboard" },
    ],
  },
  {
    title: "Shareable links",
    items: [
      { label: "Public replay", where: "?replay=<postId>" },
      { label: "Embed card", where: "?embed=<postId>" },
      { label: "Boss memo deep link", where: "?memo=<runId>" },
      { label: "Feed post", where: "?view=feed&post=<id>" },
    ],
  },
] as const;

export function ShortcutsPanel({ open, onClose, onRestartTour }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink-950/80 p-4 backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(88vh,720px)] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-xl border border-wire-800 bg-ink-950 shadow-float">
        <header className="flex shrink-0 items-center justify-between border-b border-wire-800 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brass">
            desk shortcuts & guide
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.2em] text-wire-500 hover:text-brass"
          >
            esc
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section>
            <h2 className="sticky top-0 z-[1] border-b border-wire-900 bg-ink-950/95 px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.26em] text-wire-500 backdrop-blur-sm">
              Keyboard
            </h2>
            <ul className="divide-y divide-wire-900">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.keys}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <span className="text-[12px] text-wire-300">{s.desc}</span>
                  <kbd className="shrink-0 rounded border border-wire-700 bg-ink-900 px-2 py-0.5 font-mono text-[11px] text-brass">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>

          {FEATURE_GUIDE.map((section) => (
            <section key={section.title}>
              <h2 className="sticky top-0 z-[1] border-b border-wire-900 bg-ink-950/95 px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.26em] text-wire-500 backdrop-blur-sm">
                {section.title}
              </h2>
              <ul className="divide-y divide-wire-900">
                {section.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-[12px] leading-snug text-wire-300">{item.label}</span>
                    <span className="shrink-0 max-w-[46%] text-right font-mono text-[10px] leading-snug text-brass/90">
                      {item.where}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-wire-900 px-4 py-2.5 text-[10px] text-wire-600">
          <span>
            Press <span className="font-mono text-brass">?</span> on the floor to toggle this
            panel
          </span>
          {onRestartTour ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRestartTour();
              }}
              className="rounded border border-brass/40 bg-brass/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20"
            >
              restart desk tour
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
