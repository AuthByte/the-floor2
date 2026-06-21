import {
  deriveShiftPhase,
  stepIndex,
  visibleShiftSteps,
} from "../lib/shiftPhase";
import type { RoomState, RunState } from "../lib/types";

interface Props {
  runState: RunState;
  resolvingTickers: boolean;
  rooms: Record<string, RoomState>;
  enabledAgentKeys: Set<string>;
  runRiskPipeline: boolean;
}

const RESOLVING_COPY = "Resolving watchlist into tickers…";

export function ShiftPhaseRail(p: Props) {
  const phase = deriveShiftPhase(p);
  const steps = visibleShiftSteps(p.runRiskPipeline);
  const activeIdx = stepIndex(phase, steps);
  const show =
    p.runState === "running" || phase === "resolving" || p.runState === "complete";

  if (!show) return null;

  if (phase === "resolving") {
    return (
      <div className="relative z-10 border-b border-wire-800/60 bg-ink-950/70 px-5 py-2">
        <div className="mx-auto flex max-w-[1700px] items-center gap-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brass animate-pulse-dot" />
          <span className="text-[10px] uppercase tracking-[0.28em] text-brass">{RESOLVING_COPY}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 border-b border-wire-800/60 bg-ink-950/70 px-5 py-2.5">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-wire-600">
          shift pipeline
        </span>
        <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {steps.map((step, i) => {
            const state = phaseState(i, activeIdx, p.runState);
            return (
              <li key={step.id} className="flex items-center gap-1.5">
                {i > 0 ? (
                  <span
                    className={`hidden h-px w-3 sm:block ${
                      state === "done" ? "bg-brass/50" : "bg-wire-800"
                    }`}
                    aria-hidden
                  />
                ) : null}
                <PhaseChip step={step} state={state} />
              </li>
            );
          })}
        </ol>
        {p.runState === "complete" ? (
          <span className="text-[10px] uppercase tracking-[0.24em] text-brass">clocked out</span>
        ) : null}
      </div>
    </div>
  );
}

type ChipState = "pending" | "active" | "done";

function phaseState(index: number, activeIdx: number, runState: RunState): ChipState {
  if (runState === "complete") return "done";
  if (activeIdx < 0) return "pending";
  if (index < activeIdx) return "done";
  if (index === activeIdx) return "active";
  return "pending";
}

function PhaseChip({
  step,
  state,
}: {
  step: { label: string; short: string };
  state: ChipState;
}) {
  const tone =
    state === "active"
      ? "border-phos/50 bg-phos/10 text-phos"
      : state === "done"
        ? "border-brass/40 bg-brass/5 text-brass/90"
        : "border-wire-800/80 bg-ink-900/40 text-wire-600";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] transition-colors ${tone}`}
      title={step.label}
    >
      {state === "active" ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-phos animate-pulse-dot" />
      ) : state === "done" ? (
        <span className="font-mono text-[8px] text-brass">ok</span>
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wire-700" />
      )}
      <span className="hidden sm:inline">{step.label}</span>
      <span className="sm:hidden">{step.short}</span>
    </span>
  );
}
