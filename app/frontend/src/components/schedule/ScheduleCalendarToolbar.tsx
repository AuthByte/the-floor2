import type { CalendarView } from "../../lib/scheduleCalendar";
import { formatMonthYear, formatWeekRange } from "../../lib/scheduleCalendar";

interface Props {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  anchorDate: Date;
  weekStart: Date;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ScheduleCalendarToolbar({
  view,
  onViewChange,
  anchorDate,
  weekStart,
  onToday,
  onPrev,
  onNext,
}: Props) {
  const rangeLabel =
    view === "week" ? formatWeekRange(weekStart) : formatMonthYear(anchorDate);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wire-900/80 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          className="rounded border border-wire-700 bg-ink-900 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-wire-300 transition hover:border-brass/50 hover:text-brass"
        >
          Today
        </button>
        <div className="flex items-center rounded border border-wire-800">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            className="px-2.5 py-1.5 font-mono text-sm text-wire-400 transition hover:bg-ink-800 hover:text-wire-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="border-l border-wire-800 px-2.5 py-1.5 font-mono text-sm text-wire-400 transition hover:bg-ink-800 hover:text-wire-100"
          >
            ›
          </button>
        </div>
        <h3 className="font-display text-sm font-semibold tracking-wide text-wire-100">
          {rangeLabel}
        </h3>
      </div>

      <div className="flex rounded border border-wire-800 p-0.5">
        {(["week", "month"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
              view === v
                ? "bg-brass/15 text-brass"
                : "text-wire-500 hover:text-wire-300"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
