import {
  deleteSchedule,
  formatNextRun,
  formatTimeLocal,
  updateSchedule,
  type ShiftSchedule,
} from "../../lib/schedule";

interface Props {
  schedules: ShiftSchedule[];
  onChange: () => void;
  busyId: string | null;
  setBusyId: (id: string | null) => void;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleList({ schedules, onChange, busyId, setBusyId }: Props) {
  if (!schedules.length) {
    return (
      <p className="font-mono text-[11px] text-wire-600">
        No schedules yet — ask the desk agent or pick a template below.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {schedules.map((s) => (
        <li
          key={s.id}
          className={`rounded-sm border px-3 py-2.5 ${
            s.enabled
              ? "border-wire-800 bg-ink-900/60"
              : "border-wire-900/60 bg-ink-950/40 opacity-70"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[12px] font-semibold text-wire-100">
                {s.label || s.tickers?.join(", ") || "Scheduled shift"}
              </p>
              <p className="mt-1 font-mono text-[10px] text-wire-500">
                {formatTimeLocal(s.time_local)} · {s.recurrence}
                {s.recurrence === "weekly" && s.days_of_week?.length
                  ? ` · ${s.days_of_week.map((d) => DAY_LABELS[d] ?? d).join(", ")}`
                  : ""}
              </p>
              <p className="mt-1 font-mono text-[10px] text-brass/80">
                Next: {formatNextRun(s.next_run_at)}
              </p>
              {s.watchlist_id ? (
                <p className="mt-0.5 font-mono text-[9px] text-wire-600">
                  Linked watchlist · tickers refresh at fire time
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
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
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-wire-500 hover:text-brass"
              >
                {busyId === s.id ? "…" : s.enabled ? "Pause" : "Resume"}
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
                  });
                }}
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-siren/80 hover:text-siren"
              >
                Delete
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
