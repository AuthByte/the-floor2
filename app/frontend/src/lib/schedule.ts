import { authHeaders, getApiBaseUrl } from "./api";

export type ScheduleRecurrence = "daily" | "weekly" | "once";

export interface ShiftSchedule {
  id: string;
  user_id?: string;
  label?: string | null;
  tickers: string[];
  ticker_query?: string | null;
  enabled: boolean;
  timezone: string;
  recurrence: ScheduleRecurrence;
  time_local: string;
  days_of_week?: number[] | null;
  run_once_at?: string | null;
  enabled_agent_keys: string[];
  watchlist_id?: string | null;
  source_shift_id?: string | null;
  template_key?: string | null;
  auto_publish: boolean;
  notify_email: boolean;
  initial_cash: number;
  run_risk_pipeline: boolean;
  model_name?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleSuggestion {
  label: string;
  tickers?: string[];
  watchlist_id?: string;
  recurrence?: ScheduleRecurrence;
  days_of_week?: number[];
  time_local?: string;
  template_key?: string;
  reason?: string;
}

export interface SchedulerChatResponse {
  reply: string;
  conversation_id: string;
  schedules: ShiftSchedule[];
  suggestions?: ScheduleSuggestion[];
  tool_trace?: unknown[];
}

export interface SchedulerPrefs {
  timezone: string;
  vacation_mode: boolean;
  max_active_schedules: number;
}

export interface ScheduleCreatePayload {
  label?: string;
  tickers?: string[];
  ticker_query?: string;
  enabled?: boolean;
  timezone?: string;
  recurrence?: ScheduleRecurrence;
  time_local?: string;
  days_of_week?: number[];
  run_once_at?: string;
  enabled_agent_keys?: string[];
  watchlist_id?: string;
  source_shift_id?: string;
  template_key?: string;
  auto_publish?: boolean;
  notify_email?: boolean;
  initial_cash?: number;
  run_risk_pipeline?: boolean;
  model_name?: string;
}

export const SCHEDULE_TEMPLATES = [
  {
    key: "market_open",
    label: "Opening Bell Desk",
    time_local: "09:30:00",
    recurrence: "weekly" as const,
    days_of_week: [0, 1, 2, 3, 4],
    description: "Weekday open — full committee at the bell.",
  },
  {
    key: "midday_pulse",
    label: "Midday Pulse",
    time_local: "12:00:00",
    recurrence: "daily" as const,
    description: "Mid-session check on your watchlist.",
  },
  {
    key: "pre_close",
    label: "Pre-close Memo",
    time_local: "15:45:00",
    recurrence: "daily" as const,
    description: "Late-day verdict before the close.",
  },
] as const;

export async function fetchSchedules(): Promise<{
  schedules: ShiftSchedule[];
  suggestions: ScheduleSuggestion[];
}> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/schedules`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function createSchedule(payload: ScheduleCreatePayload): Promise<ShiftSchedule> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/schedules`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateSchedule(
  id: string,
  payload: Partial<ScheduleCreatePayload> & { enabled?: boolean },
): Promise<ShiftSchedule> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/schedules/${id}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteSchedule(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/schedules/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function postSchedulerChat(
  message: string,
  conversationId?: string | null,
): Promise<SchedulerChatResponse> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/scheduler/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSchedulerPrefs(): Promise<SchedulerPrefs> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/scheduler/prefs`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSchedulerPrefs(
  prefs: Partial<SchedulerPrefs>,
): Promise<SchedulerPrefs> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/scheduler/prefs`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchActiveServerShifts(): Promise<{ active: unknown[] }> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/schedules/active`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return { active: [] };
  return res.json();
}

export function scheduleCalendarUrl(): string {
  return `${getApiBaseUrl()}/hedge-fund/schedules/calendar.ics`;
}

export function formatNextRun(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatTimeLocal(t: string): string {
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = parts[1] ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/** Earliest enabled schedule with a known next_run_at. */
export function pickNextSchedule(schedules: ShiftSchedule[]): ShiftSchedule | null {
  const upcoming = schedules
    .filter((s) => s.enabled && s.next_run_at)
    .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)));
  return upcoming[0] ?? null;
}

export function formatNextScheduleChip(schedule: ShiftSchedule): string {
  const when = formatNextRun(schedule.next_run_at);
  const label = schedule.label || schedule.tickers?.slice(0, 2).join(", ") || "Shift";
  return `${when} · ${label}`;
}
