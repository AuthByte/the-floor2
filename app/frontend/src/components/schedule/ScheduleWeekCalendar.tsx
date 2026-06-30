import { useMemo } from "react";

import {
  addDays,
  calendarGridHeightPx,
  calendarHourCount,
  CALENDAR_HOUR_START,
  CALENDAR_HOUR_HEIGHT_PX,
  collectOccurrences,
  eventHeightPx,
  eventTopPx,
  formatHourLabel,
  formatOccurrenceTime,
  getDisplayTimeZone,
  isSameDay,
  SCHEDULE_EVENT_ACCENTS,
  scheduleAccentIndex,
  zonedDayKey,
  type CalendarOccurrence,
} from "../../lib/scheduleCalendar";
import type { ShiftSchedule } from "../../lib/schedule";

interface Props {
  weekStart: Date;
  schedules: ShiftSchedule[];
  vacationMode: boolean;
  selectedKey: string | null;
  onSelectOccurrence: (occ: CalendarOccurrence | null) => void;
  onSlotClick?: (day: Date, hour: number) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleWeekCalendar({
  weekStart,
  schedules,
  vacationMode,
  selectedKey,
  onSelectOccurrence,
  onSlotClick,
}: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const rangeEnd = addDays(weekStart, 7);
  rangeEnd.setMilliseconds(-1);

  const occurrences = useMemo(
    () =>
      collectOccurrences(schedules, weekStart, rangeEnd, {
        includeDisabled: true,
        vacationMode,
      }),
    [schedules, weekStart, rangeEnd, vacationMode],
  );

  const displayTz = getDisplayTimeZone();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const day of days) {
      map.set(zonedDayKey(day, displayTz), []);
    }
    for (const occ of occurrences) {
      const key = zonedDayKey(occ.startsAt, displayTz);
      const bucket = map.get(key);
      if (bucket) bucket.push(occ);
    }
    return map;
  }, [occurrences, days, displayTz]);

  const hours = Array.from(
    { length: calendarHourCount() },
    (_, i) => CALENDAR_HOUR_START + i,
  );

  const gridH = calendarGridHeightPx();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-[52px_repeat(7,1fr)] border-b border-wire-900/80">
        <div className="border-r border-wire-900/60" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`border-r border-wire-900/60 px-1 py-2 text-center last:border-r-0 ${
                isToday ? "bg-brass/5" : ""
              }`}
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                {DAY_NAMES[day.getDay()]}
              </p>
              <p
                className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] font-semibold ${
                  isToday
                    ? "bg-brass text-ink-950"
                    : "text-wire-200"
                }`}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid grid-cols-[52px_repeat(7,1fr)]"
          style={{ minHeight: gridH }}
        >
          <div className="relative border-r border-wire-900/60">
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-wire-900/40 pr-1 text-right font-mono text-[9px] text-wire-600"
                style={{ height: CALENDAR_HOUR_HEIGHT_PX }}
              >
                <span className="-mt-2 inline-block">{formatHourLabel(hour)}</span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const isToday = isSameDay(day, today);
            const dayOccs = byDay.get(zonedDayKey(day, displayTz)) ?? [];

            return (
              <div
                key={`col-${day.toISOString()}`}
                className={`relative border-r border-wire-900/60 last:border-r-0 ${
                  isToday ? "bg-brass/[0.03]" : ""
                }`}
              >
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className="block w-full border-b border-wire-900/30 transition hover:bg-brass/[0.04]"
                    style={{ height: CALENDAR_HOUR_HEIGHT_PX }}
                    onClick={() => onSlotClick?.(day, hour)}
                    aria-label={`Add schedule ${DAY_NAMES[day.getDay()]} ${hour}:00`}
                  />
                ))}

                {isToday ? <NowLine gridH={gridH} /> : null}

                {dayOccs.map((occ) => {
                  const top = eventTopPx(occ.startsAt, displayTz);
                  const h = eventHeightPx();
                  if (top < 0 || top > gridH) return null;
                  const accent =
                    SCHEDULE_EVENT_ACCENTS[scheduleAccentIndex(occ.scheduleId)];
                  const dimmed = !occ.schedule.enabled || vacationMode;
                  const selected = selectedKey === occ.key;

                  return (
                    <button
                      key={occ.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOccurrence(selected ? null : occ);
                      }}
                      className={`absolute inset-x-0.5 z-10 overflow-hidden rounded-sm border-l-[3px] px-1.5 py-1 text-left shadow-sm transition ${accent} ${
                        dimmed ? "opacity-45" : ""
                      } ${selected ? "ring-1 ring-brass/60" : ""}`}
                      style={{ top, height: Math.max(h, 28), minHeight: 28 }}
                      title={`${occ.label} · ${formatOccurrenceTime(occ.startsAt, displayTz)}`}
                    >
                      <p className="truncate font-mono text-[9px] font-semibold leading-tight">
                        {occ.label}
                      </p>
                      <p className="truncate font-mono text-[8px] opacity-80">
                        {formatOccurrenceTime(occ.startsAt, displayTz)}
                      </p>
                      {h >= 36 ? (
                        <p className="truncate font-mono text-[8px] opacity-70">
                          {occ.tickersLabel}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine({ gridH }: { gridH: number }) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getDisplayTimeZone(),
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const top =
    ((hour - CALENDAR_HOUR_START) * 60 + minute) / 60 * CALENDAR_HOUR_HEIGHT_PX;

  if (top < 0 || top > gridH) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top }}
      aria-hidden
    >
      <div className="relative">
        <span className="absolute -left-1 h-2 w-2 -translate-y-1/2 rounded-full bg-siren" />
        <div className="h-px bg-siren/80" />
      </div>
    </div>
  );
}
