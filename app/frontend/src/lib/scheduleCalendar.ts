import type { ShiftSchedule } from "./schedule";
import { formatTimeLocal } from "./schedule";

export type CalendarView = "week" | "month";

export interface CalendarOccurrence {
  key: string;
  scheduleId: string;
  schedule: ShiftSchedule;
  startsAt: Date;
  label: string;
  tickersLabel: string;
}

const PY_WEEKDAY: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const HOUR_START = 6;
const HOUR_END = 20;
export const CALENDAR_HOUR_START = HOUR_START;
export const CALENDAR_HOUR_END = HOUR_END;
export const CALENDAR_HOUR_HEIGHT_PX = 52;
export const CALENDAR_EVENT_DURATION_MIN = 45;

export function calendarHourCount(): number {
  return HOUR_END - HOUR_START;
}

export function calendarGridHeightPx(): number {
  return calendarHourCount() * CALENDAR_HOUR_HEIGHT_PX;
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const y = weekStart.getFullYear();
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.toLocaleDateString(undefined, { month: "long" })} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${y}`;
  }
  return `${weekStart.toLocaleDateString(undefined, opts)} – ${weekEnd.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday ?? "Mon",
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function dateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const inv = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  const loc = new Date(utc.toLocaleString("en-US", { timeZone }));
  return new Date(utc.getTime() - (loc.getTime() - inv.getTime()));
}

function parseTimeLocal(timeLocal: string): { hour: number; minute: number } {
  const [h, m] = timeLocal.split(":");
  return { hour: Number(h) || 0, minute: Number(m) || 0 };
}

function runsOnPythonWeekday(schedule: ShiftSchedule, pyWeekday: number): boolean {
  if (schedule.recurrence === "weekly") {
    const days = schedule.days_of_week?.length ? schedule.days_of_week : [0, 1, 2, 3, 4];
    return days.includes(pyWeekday);
  }
  if (schedule.recurrence === "daily") {
    return pyWeekday <= 4;
  }
  return false;
}

function tickersLabel(schedule: ShiftSchedule): string {
  if (schedule.tickers?.length) return schedule.tickers.slice(0, 4).join(", ");
  if (schedule.watchlist_id) return "Watchlist";
  return "—";
}

export function expandScheduleOccurrences(
  schedule: ShiftSchedule,
  rangeStart: Date,
  rangeEnd: Date,
  options?: { includeDisabled?: boolean; vacationMode?: boolean },
): CalendarOccurrence[] {
  if (options?.vacationMode) return [];
  if (!schedule.enabled && !options?.includeDisabled) return [];

  const tz = schedule.timezone || "America/New_York";
  const { hour, minute } = parseTimeLocal(schedule.time_local || "09:30:00");
  const label = schedule.label || tickersLabel(schedule) || "Scheduled shift";
  const tickers = tickersLabel(schedule);
  const out: CalendarOccurrence[] = [];

  if (schedule.recurrence === "once") {
    if (!schedule.run_once_at) return out;
    const once = new Date(schedule.run_once_at);
    if (once >= rangeStart && once <= rangeEnd) {
      out.push({
        key: `${schedule.id}-${once.toISOString()}`,
        scheduleId: schedule.id,
        schedule,
        startsAt: once,
        label,
        tickersLabel: tickers,
      });
    }
    return out;
  }

  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const parts = zonedParts(cursor, tz);
    const py = PY_WEEKDAY[parts.weekday] ?? 0;
    if (runsOnPythonWeekday(schedule, py)) {
      const startsAt = dateInTimezone(parts.year, parts.month, parts.day, hour, minute, tz);
      if (startsAt >= rangeStart && startsAt <= rangeEnd) {
        out.push({
          key: `${schedule.id}-${parts.year}-${parts.month}-${parts.day}`,
          scheduleId: schedule.id,
          schedule,
          startsAt,
          label,
          tickersLabel: tickers,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

export function collectOccurrences(
  schedules: ShiftSchedule[],
  rangeStart: Date,
  rangeEnd: Date,
  options?: { includeDisabled?: boolean; vacationMode?: boolean },
): CalendarOccurrence[] {
  const all = schedules.flatMap((s) =>
    expandScheduleOccurrences(s, rangeStart, rangeEnd, options),
  );
  return all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function eventTopPx(startsAt: Date, timeZone: string): number {
  const parts = zonedParts(startsAt, timeZone);
  const mins = (parts.hour - HOUR_START) * 60 + parts.minute;
  return (mins / 60) * CALENDAR_HOUR_HEIGHT_PX;
}

export function eventHeightPx(): number {
  return (CALENDAR_EVENT_DURATION_MIN / 60) * CALENDAR_HOUR_HEIGHT_PX;
}

export function formatHourLabel(hour: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12} ${ampm}`;
}

export function formatOccurrenceTime(startsAt: Date, timeZone: string): string {
  return startsAt.toLocaleTimeString(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatOccurrenceDay(startsAt: Date): string {
  return startsAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getDisplayTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function zonedDayKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function scheduleAccentIndex(scheduleId: string): number {
  let h = 0;
  for (let i = 0; i < scheduleId.length; i++) h = (h * 31 + scheduleId.charCodeAt(i)) >>> 0;
  return h % 5;
}

export const SCHEDULE_EVENT_ACCENTS = [
  "border-l-phos bg-phos/15 text-phos hover:bg-phos/25",
  "border-l-brass bg-brass/15 text-brass hover:bg-brass/25",
  "border-l-amber bg-amber/15 text-amber hover:bg-amber/25",
  "border-l-wire-400 bg-wire-400/10 text-wire-300 hover:bg-wire-400/20",
  "border-l-siren bg-siren/15 text-siren hover:bg-siren/25",
] as const;

export function occurrenceDetailLines(schedule: ShiftSchedule): string[] {
  const lines = [
    `${formatTimeLocal(schedule.time_local)} · ${schedule.recurrence}`,
    `Next: ${schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : "—"}`,
  ];
  if (schedule.recurrence === "weekly" && schedule.days_of_week?.length) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    lines.unshift(
      days.filter((_, i) => schedule.days_of_week?.includes(i)).join(", "),
    );
  }
  return lines;
}
