import { useMemo } from "react";

import {
  addDays,
  collectOccurrences,
  formatOccurrenceTime,
  getDisplayTimeZone,
  isSameDay,
  isSameMonth,
  SCHEDULE_EVENT_ACCENTS,
  scheduleAccentIndex,
  startOfMonth,
  startOfWeek,
  zonedDayKey,
  type CalendarOccurrence,
} from "../../lib/scheduleCalendar";
import type { ShiftSchedule } from "../../lib/schedule";

interface Props {
  monthDate: Date;
  schedules: ShiftSchedule[];
  vacationMode: boolean;
  selectedKey: string | null;
  onSelectOccurrence: (occ: CalendarOccurrence | null) => void;
  onDayClick: (day: Date) => void;
}

export function ScheduleMonthCalendar({
  monthDate,
  schedules,
  vacationMode,
  selectedKey,
  onSelectOccurrence,
  onDayClick,
}: Props) {
  const today = useMemo(() => new Date(), []);

  const monthStart = startOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, 0);
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );

  const rangeEnd = addDays(cells[cells.length - 1], 1);
  rangeEnd.setMilliseconds(-1);

  const occurrences = useMemo(
    () =>
      collectOccurrences(schedules, gridStart, rangeEnd, {
        includeDisabled: true,
        vacationMode,
      }),
    [schedules, gridStart, rangeEnd, vacationMode],
  );

  const displayTz = getDisplayTimeZone();

  const byDayKey = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occ of occurrences) {
      const key = zonedDayKey(occ.startsAt, displayTz);
      const list = map.get(key) ?? [];
      list.push(occ);
      map.set(key, list);
    }
    return map;
  }, [occurrences, displayTz]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-b border-wire-900/80">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="border-r border-wire-900/60 py-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {cells.map((day) => {
          const inMonth = isSameMonth(day, monthDate);
          const isToday = isSameDay(day, today);
          const key = zonedDayKey(day, displayTz);
          const dayOccs = (byDayKey.get(key) ?? []).slice(0, 4);
          const extra = (byDayKey.get(key)?.length ?? 0) - dayOccs.length;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              className={`flex min-h-[72px] flex-col border-b border-r border-wire-900/50 p-1 text-left transition hover:bg-brass/[0.04] ${
                !inMonth ? "bg-ink-950/50" : ""
              } ${isToday ? "bg-brass/[0.06]" : ""}`}
            >
              <span
                className={`mb-1 inline-flex h-6 w-6 items-center justify-center self-end rounded-full font-mono text-[11px] font-semibold ${
                  isToday
                    ? "bg-brass text-ink-950"
                    : inMonth
                      ? "text-wire-200"
                      : "text-wire-700"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {dayOccs.map((occ) => {
                  const accent =
                    SCHEDULE_EVENT_ACCENTS[scheduleAccentIndex(occ.scheduleId)];
                  const dimmed = !occ.schedule.enabled || vacationMode;
                  const selected = selectedKey === occ.key;
                  return (
                    <span
                      key={occ.key}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOccurrence(selected ? null : occ);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectOccurrence(selected ? null : occ);
                        }
                      }}
                      className={`truncate rounded-sm border-l-2 px-1 py-0.5 font-mono text-[8px] leading-tight ${accent} ${
                        dimmed ? "opacity-45" : ""
                      } ${selected ? "ring-1 ring-brass/50" : ""}`}
                    >
                      {formatOccurrenceTime(occ.startsAt, displayTz)} {occ.label}
                    </span>
                  );
                })}
                {extra > 0 ? (
                  <span className="font-mono text-[8px] text-wire-500">+{extra} more</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
