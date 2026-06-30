import {
  deleteSchedule,
  formatNextRun,
  formatTimeLocal,
  updateSchedule,
  type ShiftSchedule,
} from "../../lib/schedule";
import {
  formatOccurrenceDay,
  formatOccurrenceTime,
  occurrenceDetailLines,
  type CalendarOccurrence,
} from "../../lib/scheduleCalendar";

interface Props {
  occurrence: CalendarOccurrence | null;
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  onChange: () => void;
  onClose: () => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleEventInspector({
  occurrence,
  busyId,
  setBusyId,
  onChange,
  onClose,
}: Props) {
  if (!occurrence) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wire-600">
          Event detail
        </p>
        <p className="mt-2 max-w-[200px] font-mono text-[11px] leading-relaxed text-wire-500">
          Click a shift on the calendar to pause, resume, or delete it.
        </p>
      </div>
    );
  }

  const s: ShiftSchedule = occurrence.schedule;
  const tz = s.timezone || "America/New_York";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-wire-900/80 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-brass/80">
            {formatOccurrenceDay(occurrence.startsAt)}
          </p>
          <h3 className="mt-1 truncate font-display text-base font-bold text-wire-100">
            {occurrence.label}
          </h3>
          <p className="mt-1 font-mono text-[11px] text-wire-400">
            {formatOccurrenceTime(occurrence.startsAt, tz)} · {occurrence.tickersLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-wire-600 hover:text-wire-300"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <dl className="space-y-2 font-mono text-[10px] text-wire-500">
          <div>
            <dt className="text-wire-600">Cadence</dt>
            <dd className="mt-0.5 text-wire-300">
              {formatTimeLocal(s.time_local)} · {s.recurrence}
              {s.recurrence === "weekly" && s.days_of_week?.length
                ? ` · ${s.days_of_week.map((d) => DAY_LABELS[d] ?? d).join(", ")}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-wire-600">Timezone</dt>
            <dd className="mt-0.5 text-wire-300">{tz}</dd>
          </div>
          <div>
            <dt className="text-wire-600">Next fire</dt>
            <dd className="mt-0.5 text-brass/90">{formatNextRun(s.next_run_at)}</dd>
          </div>
          {s.watchlist_id ? (
            <div>
              <dt className="text-wire-600">Watchlist</dt>
              <dd className="mt-0.5 text-wire-300">Tickers refresh at fire time</dd>
            </div>
          ) : null}
          {!s.enabled ? (
            <p className="text-amber">Paused — not firing until resumed.</p>
          ) : null}
        </dl>

        {occurrenceDetailLines(s).map((line) => (
          <p key={line} className="font-mono text-[9px] text-wire-600">
            {line}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-wire-900/80 px-4 py-3">
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => {
            setBusyId(s.id);
            void updateSchedule(s.id, { enabled: !s.enabled }).finally(() => {
              setBusyId(null);
              onChange();
            });
          }}
          className="rounded border border-wire-700 bg-ink-900 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-wire-300 transition hover:border-brass/40 hover:text-brass"
        >
          {busyId === s.id ? "…" : s.enabled ? "Pause schedule" : "Resume schedule"}
        </button>
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => {
            if (!window.confirm("Delete this schedule?")) return;
            setBusyId(s.id);
            void deleteSchedule(s.id).finally(() => {
              setBusyId(null);
              onChange();
              onClose();
            });
          }}
          className="rounded border border-siren/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-siren/90 transition hover:bg-siren/10"
        >
          Delete schedule
        </button>
      </div>
    </div>
  );
}
