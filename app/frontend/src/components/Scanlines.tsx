/**
 * Ambient overlay for the whole app. Replaces the old green CRT scanlines with a
 * calmer "after-hours" atmosphere: a faint brass/emerald aurora near the top, a
 * fine film grain, a soft vignette, and one slow brass light-sweep for life.
 * Fixed + pointer-events-none so it never interferes with scrolling or input.
 */
export function Scanlines({
  lite = false,
  offDuringShift = false,
}: {
  lite?: boolean;
  offDuringShift?: boolean;
}) {
  if (offDuringShift && lite) return null;
  if (lite) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
        <div className="absolute inset-0 animate-soft-float crt-vignette opacity-50" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      <div className="absolute inset-0 brass-aurora" />
      <div className="absolute inset-0 grain opacity-[0.05] mix-blend-soft-light" />
      <div className="absolute inset-0 crt-vignette" />
      <div className="absolute inset-x-0 -top-[220px] h-[220px] bg-gradient-to-b from-transparent via-brass/[0.06] to-transparent blur-2xl animate-scan" />
    </div>
  );
}
