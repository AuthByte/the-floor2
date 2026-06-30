import { useMemo } from "react";

import { formatNextRun, type ShiftSchedule } from "../../lib/schedule";

interface Props {
  schedules: ShiftSchedule[];
}

export function ScheduleCalendarStrip({ schedules }: Props) {
  const upcoming = useMemo(() => {
    return [...schedules]
      .filter((s) => s.enabled && s.next_run_at)
      .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))
      .slice(0, 7);
  }, [schedules]);

  if (!upcoming.length) return null;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-2 pb-1">
        {upcoming.map((s) => (
          <div
            key={s.id}
            className="w-[120px] shrink-0 rounded-sm border border-wire-900 bg-ink-950/90 px-2 py-2"
          >
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-brass">
              {s.label || "Shift"}
            </p>
            <p className="mt-1 font-mono text-[10px] text-wire-300">
              {formatNextRun(s.next_run_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
