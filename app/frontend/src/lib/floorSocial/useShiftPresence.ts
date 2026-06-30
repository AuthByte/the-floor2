import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../supabase";
import {
  clearShiftPresence,
  fetchActivePresence,
  upsertShiftPresence,
} from "./apiExtended";
import type { ShiftPresence } from "./types";

const PRESENCE_POLL_MS = 60_000;

export function useShiftPresence() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [active, setActive] = useState<ShiftPresence[]>([]);
  const [mine, setMine] = useState<ShiftPresence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setActive([]);
      setMine(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await fetchActivePresence(supabase);
      setActive(rows);
      setMine(userId ? rows.find((r) => r.userId === userId) ?? null : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load presence");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, PRESENCE_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const presenceLiveRef = useRef(false);
  const clearInFlightRef = useRef<Promise<void> | null>(null);

  const publish = useCallback(
    async (data: {
      tickers: string[];
      model: string;
      analystCount: number;
      visible?: boolean;
    }) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return null;

      const row = await upsertShiftPresence(supabase, userId, data);
      presenceLiveRef.current = data.visible !== false;
      setMine(row);
      setActive((prev) => {
        const rest = prev.filter((p) => p.userId !== userId);
        return data.visible === false ? rest : [row, ...rest];
      });
      return row;
    },
    [userId],
  );

  const clear = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId || !presenceLiveRef.current) return;
    if (clearInFlightRef.current) {
      await clearInFlightRef.current;
      return;
    }

    const run = (async () => {
      await clearShiftPresence(supabase, userId);
      presenceLiveRef.current = false;
      setMine(null);
      setActive((prev) => prev.filter((p) => p.userId !== userId));
    })();
    clearInFlightRef.current = run;
    try {
      await run;
    } finally {
      clearInFlightRef.current = null;
    }
  }, [userId]);

  return {
    active,
    mine,
    loading,
    error,
    refresh,
    publish,
    clear,
  };
}
