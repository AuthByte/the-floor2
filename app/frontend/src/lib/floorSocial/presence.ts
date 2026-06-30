import type { SupabaseClient } from "@supabase/supabase-js";

export const PRESENCE_STALE_MS = 90_000;

export interface PresenceHeartbeat {
  tickers: string[];
  model: string;
  analystCount: number;
  visible: boolean;
}

export interface ShiftPresenceRow {
  userId: string;
  tickers: string[];
  model: string;
  analystCount: number;
  visible: boolean;
  startedAt: string;
  updatedAt: string;
}

export function isPresenceFresh(updatedAt: string | Date, now = Date.now()): boolean {
  const ts = typeof updatedAt === "string" ? Date.parse(updatedAt) : updatedAt.getTime();
  return Number.isFinite(ts) && now - ts < PRESENCE_STALE_MS;
}

/** Upsert live desk presence — consumers treat rows older than 90s as stale. */
export async function heartbeatPresence(
  supabase: SupabaseClient,
  userId: string,
  payload: PresenceHeartbeat,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("shift_presence").upsert(
    {
      user_id: userId,
      tickers: payload.tickers,
      model: payload.model,
      analyst_count: payload.analystCount,
      visible: payload.visible,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function clearPresence(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("shift_presence").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function fetchFreshPresence(
  supabase: SupabaseClient,
  limit = 24,
): Promise<ShiftPresenceRow[]> {
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from("shift_presence")
    .select("user_id, tickers, model, analyst_count, visible, started_at, updated_at")
    .eq("visible", true)
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Array<{
    user_id: string;
    tickers: string[];
    model: string;
    analyst_count: number;
    visible: boolean;
    started_at: string;
    updated_at: string;
  }>).map((row) => ({
    userId: row.user_id,
    tickers: row.tickers ?? [],
    model: row.model ?? "",
    analystCount: row.analyst_count ?? 0,
    visible: row.visible,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  }));
}
