import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoredShift, UserSettings, WatchlistPreset } from "./types";

interface ShiftRow {
  id: string;
  client_id: string | null;
  run_id: string | null;
  ts_ms: number;
  tickers: string[];
  model: string;
  initial_cash: number;
  analyst_count: number;
  summary: unknown;
  decisions: unknown;
  prices: unknown;
  payload: unknown;
  replay: unknown;
}

interface WatchlistRow {
  id: string;
  label: string;
  tickers: string;
  hint: string | null;
  sort_order: number;
}

export async function fetchUserSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.settings as UserSettings | undefined) ?? {};
}

export async function upsertUserSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: UserSettings,
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function fetchShifts(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<StoredShift[]> {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("user_id", userId)
    .order("ts_ms", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ShiftRow[]).map(rowToShift);
}

export async function insertShift(
  supabase: SupabaseClient,
  userId: string,
  shift: StoredShift,
): Promise<StoredShift> {
  const row = shiftToRow(userId, shift);
  const { data, error } = await supabase
    .from("shifts")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToShift(data as ShiftRow);
}

export async function deleteShiftById(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAllShifts(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("shifts").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function fetchWatchlists(
  supabase: SupabaseClient,
  userId: string,
): Promise<WatchlistPreset[]> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as WatchlistRow[]).map((row) => ({
    id: row.id,
    label: row.label,
    tickers: row.tickers,
    hint: row.hint ?? undefined,
  }));
}

export async function replaceWatchlists(
  supabase: SupabaseClient,
  userId: string,
  watchlists: WatchlistPreset[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw delErr;
  if (!watchlists.length) return;
  const rows = watchlists.map((w, i) => ({
    user_id: userId,
    id: w.id.startsWith("wl-") ? undefined : w.id,
    label: w.label,
    tickers: w.tickers,
    hint: w.hint ?? null,
    sort_order: i,
  }));
  const { error } = await supabase.from("watchlists").insert(rows);
  if (error) throw error;
}

function rowToShift(row: ShiftRow): StoredShift {
  return {
    id: row.id,
    ts: row.ts_ms,
    runId: row.run_id,
    tickers: row.tickers ?? [],
    model: row.model ?? "",
    initialCash: Number(row.initial_cash ?? 100000),
    analystCount: row.analyst_count ?? 0,
    summary: Array.isArray(row.summary) ? row.summary : [],
    decisions: (row.decisions as StoredShift["decisions"]) ?? null,
    prices: (row.prices as Record<string, number> | null) ?? null,
    payload: (row.payload as StoredShift["payload"]) ?? null,
    replay: (row.replay as StoredShift["replay"]) ?? null,
  };
}

function shiftToRow(userId: string, shift: StoredShift) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(shift.id);
  const base = {
    user_id: userId,
    client_id: isUuid ? null : shift.id,
    run_id: shift.runId ?? null,
    ts_ms: shift.ts,
    tickers: shift.tickers,
    model: shift.model,
    initial_cash: shift.initialCash,
    analyst_count: shift.analystCount,
    summary: shift.summary,
    decisions: shift.decisions,
    prices: shift.prices,
    payload: shift.payload,
    replay: shift.replay,
  };
  return isUuid ? { ...base, id: shift.id } : base;
}

/** Bulk-insert local shifts during first-login migration. */
export async function migrateLocalShifts(
  supabase: SupabaseClient,
  userId: string,
  shifts: StoredShift[],
): Promise<void> {
  if (!shifts.length) return;
  const rows = shifts.map((s) => shiftToRow(userId, s));
  const { error } = await supabase.from("shifts").upsert(rows, {
    onConflict: "user_id,run_id",
    ignoreDuplicates: false,
  });
  if (error) throw error;
}
