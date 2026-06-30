import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../supabase";
import { fetchNotifications, markNotificationsRead } from "./apiExtended";
import type { AppNotification } from "./types";

export function useNotifications(pollMs = 60_000) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await fetchNotifications(supabase, userId);
      setNotifications(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollMs || !userId) return;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  const markRead = useCallback(
    async (ids?: string[]) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return;

      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => {
          if (n.readAt) return n;
          if (ids?.length && !ids.includes(n.id)) return n;
          return { ...n, readAt: now };
        }),
      );

      try {
        await markNotificationsRead(supabase, userId, ids);
      } catch {
        void refresh();
      }
    },
    [refresh, userId],
  );

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
  };
}
