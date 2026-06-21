import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: "?", desc: "Open shortcuts panel" },
  { keys: "L", desc: "Open shift ledger" },
  { keys: "B", desc: "Open Shadow Bench (after shift completes)" },
  { keys: "R", desc: "Open Shift Replay — scrub the time machine" },
  { keys: "W", desc: "Open Weather Report — post-shift committee climate" },
  { keys: "M", desc: "Re-open boss memo (after shift completes)" },
  { keys: "Esc", desc: "Close panels / room detail / debate theater" },
  { keys: "Click room", desc: "Open agent thesis, charts, and sub-agent briefs" },
  { keys: "Scroll live wire", desc: "Scroll up to pause auto-tail; click latest to re-pin" },
  { keys: "Click callsign", desc: "In the live wire, jump to that agent's room" },
] as const;

export function ShortcutsPanel({ open, onClose }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-rise-in overflow-hidden rounded-xl border border-wire-800 bg-ink-950 shadow-float">
        <header className="flex items-center justify-between border-b border-wire-800 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brass">
            desk shortcuts
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.2em] text-wire-500 hover:text-brass"
          >
            esc
          </button>
        </header>
        <ul className="divide-y divide-wire-900">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-[12px] text-wire-300">{s.desc}</span>
              <kbd className="shrink-0 rounded border border-wire-700 bg-ink-900 px-2 py-0.5 font-mono text-[11px] text-brass">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <footer className="border-t border-wire-900 px-4 py-2 text-[10px] text-wire-600">
          Press <span className="font-mono text-brass">?</span> anytime on the
          floor to toggle this panel.
        </footer>
      </div>
    </div>
  );
}
