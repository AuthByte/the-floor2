import type { RoomState } from "../lib/types";

/** Lightweight cubicle indicator — full thesis opens in the detail panel. */
export function RoomThesisHint({ state }: { state: RoomState }) {
  const working = state.status === "WORKING";
  const ready = !!state.analysis && state.status === "DONE";

  if (!working && !ready) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-1 right-1 z-[14] flex items-center gap-1 border border-wire-800/90 bg-ink-950/85 px-1 py-0.5 text-[8px] uppercase tracking-[0.2em] text-wire-500"
      aria-hidden
    >
      {working ? (
        <>
          <span className="inline-block h-1 w-1 animate-pulse bg-amber" />
          <span className="text-amber">live</span>
        </>
      ) : (
        <span className="text-phos">thesis</span>
      )}
    </div>
  );
}
