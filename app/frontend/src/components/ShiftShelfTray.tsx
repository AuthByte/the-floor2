import { useEffect, useState } from "react";
import type { ShiftSession } from "../lib/shiftSession";

interface Props {
  runs: ShiftSession[];
  onRestore: (shelfId: string) => void;
  onDiscard: (shelfId: string) => void;
  onOpenMemo: (session: ShiftSession) => void;
}

function formatElapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function statusDot(status: ShiftSession["status"]): string {
  switch (status) {
    case "running":
      return "bg-phos animate-pulse-dot";
    case "complete":
      return "bg-brass";
    case "error":
      return "bg-siren";
    default:
      return "bg-wire-600";
  }
}

export function ShiftShelfTray({ runs, onRestore, onDiscard, onOpenMemo }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!runs.some((r) => r.status === "running")) return;
    const id = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [runs]);

  if (runs.length === 0) return null;

  return (
    <div className="desk-shelf-tray relative z-[25] shrink-0 border-b border-wire-800/70 bg-ink-950/92 px-4 py-2 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2">
        <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-wire-500">
          shelf
        </span>
        {runs.map((run) => (
          <div
            key={run.shelfId}
            className="flex items-center gap-2 rounded-md border border-wire-800/90 bg-ink-900/80 px-2.5 py-1.5"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(run.status)}`} />
            <div className="min-w-0">
              <p className="truncate font-mono text-[11px] tracking-[0.06em] text-wire-200">
                {run.label}
              </p>
              <p className="text-[9px] uppercase tracking-[0.18em] text-wire-600">
                {run.status === "running"
                  ? `running · ${formatElapsed(run.startedAt)}`
                  : run.status === "complete"
                    ? "clocked out"
                    : "fault"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 border-l border-wire-800/80 pl-2">
              <button
                type="button"
                onClick={() => onRestore(run.shelfId)}
                className="rounded border border-wire-700 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-wire-400 transition hover:border-brass/50 hover:text-brass"
              >
                restore
              </button>
              {run.status === "complete" && run.decisions ? (
                <button
                  type="button"
                  onClick={() => onOpenMemo(run)}
                  className="rounded border border-brass/40 bg-brass/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-brass transition hover:bg-brass/20"
                >
                  memo
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDiscard(run.shelfId)}
                className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-wire-600 transition hover:text-siren"
                title="Discard shelved shift"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
