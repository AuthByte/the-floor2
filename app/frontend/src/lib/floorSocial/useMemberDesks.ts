import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../supabase";
import {
  applyMemberDesk,
  deleteMemberDesk,
  fetchMemberDesks,
  saveMemberDesk,
} from "./apiExtended";
import type { MemberDesk } from "./types";

export function useMemberDesks() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [desks, setDesks] = useState<MemberDesk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setDesks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMemberDesks(supabase, userId);
      setDesks(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load desks");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (desk: {
      id?: string;
      name: string;
      description?: string | null;
      enabledAgents: string[];
      model?: string | null;
      isPublic?: boolean;
    }) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return null;

      const saved = await saveMemberDesk(supabase, userId, desk);
      setDesks((prev) => {
        const idx = prev.findIndex((d) => d.id === saved.id);
        if (idx === -1) return [saved, ...prev];
        const next = [...prev];
        next[idx] = saved;
        return next;
      });
      return saved;
    },
    [userId],
  );

  const remove = useCallback(
    async (deskId: string) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return;

      await deleteMemberDesk(supabase, userId, deskId);
      setDesks((prev) => prev.filter((d) => d.id !== deskId));
    },
    [userId],
  );

  const apply = useCallback(
    async (deskId: string) => {
      const supabase = getSupabase();
      if (!supabase || !userId) return [];

      return applyMemberDesk(supabase, userId, deskId);
    },
    [userId],
  );

  return {
    desks,
    loading,
    error,
    refresh,
    save,
    remove,
    apply,
  };
}
