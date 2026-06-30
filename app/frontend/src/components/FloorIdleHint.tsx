import type { RunState } from "../lib/types";

interface Props {
  runState: RunState;
  enabledCount: number;
  hasApiKey: boolean;
}

export function FloorIdleHint({ runState, enabledCount, hasApiKey }: Props) {
  if (runState !== "idle") return null;

  const ready = enabledCount > 0 && hasApiKey;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex animate-fade-in justify-center px-4">
      <div className="max-w-md animate-soft-float rounded-lg border border-wire-800/80 bg-ink-950/90 px-5 py-4 text-center shadow-float backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brass/80">
          floor standby
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-wire-300">
          {ready
            ? "Start a shift to wake the desks. Click any room for thesis history, or pan and zoom the floor."
            : "Arm your roster and add an OpenRouter key, then start a shift."}
        </p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-[9px] uppercase tracking-[0.2em] text-wire-600">
          <HintChip>click room</HintChip>
          <HintChip>drag to pan</HintChip>
          <HintChip>scroll zoom</HintChip>
          <HintChip>press ?</HintChip>
        </ul>
      </div>
    </div>
  );
}

function HintChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-wire-800/80 bg-ink-900/60 px-2 py-0.5 transition-transform duration-200 hover:scale-105">
      {children}
    </span>
  );
}
