import { Scanlines } from "./Scanlines";
import { floorClosedMessage, floorHoursLabel } from "../lib/floorHours";

/** Shown when the API is scheduled off (overnight ECS scale-to-zero). */
export function FloorClosed() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 py-12 text-wire-200">
      <Scanlines />
      <div className="relative z-10 w-full max-w-md text-center">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.38em] text-brass">
          After hours
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[0.12em] text-wire-100">
          THE FLOOR IS CLOSED
        </h1>
        <p className="mt-4 font-mono text-[12px] leading-relaxed text-wire-400">
          {floorClosedMessage()}
        </p>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-wire-600">
          Open {floorHoursLabel()}
        </p>
      </div>
    </div>
  );
}
