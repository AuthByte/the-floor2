import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  fetchSchedules,
  fetchSchedulerPrefs,
  scheduleCalendarUrl,
  updateSchedulerPrefs,
  type ShiftSchedule,
} from "../../lib/schedule";
import {
  addDays,
  startOfMonth,
  startOfWeek,
  type CalendarOccurrence,
  type CalendarView,
} from "../../lib/scheduleCalendar";
import { ScheduleCalendarToolbar } from "./ScheduleCalendarToolbar";
import { ScheduleEventInspector } from "./ScheduleEventInspector";
import { ScheduleMonthCalendar } from "./ScheduleMonthCalendar";
import { ScheduleTemplateCards } from "./ScheduleTemplateCards";
import { ScheduleWeekCalendar } from "./ScheduleWeekCalendar";
import { SchedulerChat } from "./SchedulerChat";

interface Props {
  open: boolean;
  onClose: () => void;
  tickers: string;
  enabledAgentKeys: string[];
  initialPrompt?: string | null;
  onClearInitialPrompt?: () => void;
}

export function ScheduleDeskPanel({
  open,
  onClose,
  tickers,
  enabledAgentKeys,
  initialPrompt,
  onClearInitialPrompt,
}: Props) {
  const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
  const [vacationMode, setVacationMode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedOccurrence, setSelectedOccurrence] = useState<CalendarOccurrence | null>(null);
  const [agentExpanded, setAgentExpanded] = useState(false);
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchorDate, 0), [anchorDate]);
  const monthDate = useMemo(() => startOfMonth(anchorDate), [anchorDate]);

  const reload = useCallback(async () => {
    try {
      const data = await fetchSchedules();
      setSchedules(data.schedules);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedules");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
    void fetchSchedulerPrefs()
      .then((p) => setVacationMode(p.vacation_mode))
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, reload]);

  useEffect(() => {
    if (!open) onClearInitialPrompt?.();
  }, [open, onClearInitialPrompt]);

  useEffect(() => {
    if (initialPrompt) setAgentExpanded(true);
  }, [initialPrompt]);

  const handleSlotClick = useCallback((day: Date, hour: number) => {
    const label = day.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? "PM" : "AM";
    setChatPrefill(`Schedule a shift on ${label} at ${h12}:00 ${ampm} Eastern with my current roster.`);
    setAgentExpanded(true);
  }, []);

  const handleDayClick = useCallback((day: Date) => {
    setAnchorDate(day);
    setView("week");
  }, []);

  if (!open) return null;

  const panel = (
    <div
      className="desk-backdrop fixed inset-0 z-[70] flex animate-fade-in justify-center bg-ink-950/60 p-2 backdrop-blur-[2px] sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-6xl animate-scale-in flex-col overflow-hidden rounded-lg border border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="schedule-desk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-4 py-3 sm:px-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                Shift calendar
              </p>
              <h2
                id="schedule-desk-title"
                className="mt-0.5 font-display text-lg font-bold tracking-wide text-wire-100"
              >
                Schedule desk
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-[10px] text-wire-500">
                <input
                  type="checkbox"
                  checked={vacationMode}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setVacationMode(v);
                    void updateSchedulerPrefs({ vacation_mode: v });
                  }}
                  className="accent-brass"
                />
                Vacation mode
              </label>
              <a
                href={scheduleCalendarUrl()}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-brass hover:text-brass-glow"
                target="_blank"
                rel="noreferrer"
              >
                Export .ics
              </a>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-wire-600 hover:text-wire-300"
              >
                Esc
              </button>
            </div>
          </div>
        </header>

        {loadError ? (
          <p className="shrink-0 border-b border-siren/20 bg-siren/5 px-4 py-2 font-mono text-[10px] text-siren">
            {loadError}
          </p>
        ) : null}

        <ScheduleCalendarToolbar
          view={view}
          onViewChange={setView}
          anchorDate={anchorDate}
          weekStart={weekStart}
          onToday={() => setAnchorDate(new Date())}
          onPrev={() => {
            if (view === "week") setAnchorDate((d) => addDays(d, -7));
            else setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
          }}
          onNext={() => {
            if (view === "week") setAnchorDate((d) => addDays(d, 7));
            else setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
          }}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-wire-900/80 lg:border-b-0 lg:border-r">
            {view === "week" ? (
              <ScheduleWeekCalendar
                weekStart={weekStart}
                schedules={schedules}
                vacationMode={vacationMode}
                selectedKey={selectedOccurrence?.key ?? null}
                onSelectOccurrence={setSelectedOccurrence}
                onSlotClick={handleSlotClick}
              />
            ) : (
              <ScheduleMonthCalendar
                monthDate={monthDate}
                schedules={schedules}
                vacationMode={vacationMode}
                selectedKey={selectedOccurrence?.key ?? null}
                onSelectOccurrence={setSelectedOccurrence}
                onDayClick={handleDayClick}
              />
            )}
          </div>

          <aside className="flex min-h-[200px] flex-col lg:min-h-0">
            <ScheduleEventInspector
              occurrence={selectedOccurrence}
              busyId={busyId}
              setBusyId={setBusyId}
              onChange={() => void reload()}
              onClose={() => setSelectedOccurrence(null)}
            />
          </aside>
        </div>

        <div className="shrink-0 border-t border-wire-900/80">
          <button
            type="button"
            onClick={() => setAgentExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-500 transition hover:bg-ink-900/60 hover:text-brass"
          >
            <span>Desk agent & templates</span>
            <span className="text-wire-600">{agentExpanded ? "−" : "+"}</span>
          </button>

          {agentExpanded ? (
            <div className="grid gap-4 border-t border-wire-900/60 px-4 py-4 lg:grid-cols-[1fr_minmax(0,340px)]">
              <div className="flex h-[200px] flex-col rounded-sm border border-wire-900 bg-ink-900/40 p-3">
                <SchedulerChat
                  initialPrompt={initialPrompt}
                  prefill={chatPrefill}
                  onSchedulesUpdated={(s) => {
                    setSchedules(s);
                    void reload();
                  }}
                />
              </div>
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
                  Quick templates
                </p>
                <ScheduleTemplateCards
                  tickers={tickers}
                  enabledAgentKeys={enabledAgentKeys}
                  onCreated={() => void reload()}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
