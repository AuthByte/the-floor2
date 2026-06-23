import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import { getSupabase } from "../lib/supabase";
import {
  deleteAllShifts,
  deleteShiftById,
  fetchShifts,
  fetchUserSettings,
  fetchWatchlists,
  insertShift,
  migrateLocalShifts,
  replaceWatchlists,
  upsertUserSettings,
} from "../lib/userData/cloud";
import {
  buildStoredShiftFromInput,
  loadLocalShifts,
  loadLocalWatchlists,
  persistLocalShifts,
  readLocalSettings,
  writeLocalSettings,
} from "../lib/userData/local";
import type { SaveShiftInput, StoredShift, UserSettings, WatchlistPreset } from "../lib/userData/types";

interface UserDataContextValue {
  ready: boolean;
  cloud: boolean;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  shifts: StoredShift[];
  saveShift: (input: SaveShiftInput) => Promise<StoredShift | null>;
  deleteShift: (id: string) => Promise<void>;
  clearShifts: () => Promise<void>;
  watchlists: WatchlistPreset[];
  setWatchlists: (lists: WatchlistPreset[]) => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

function mergeSettings(base: UserSettings, patch: Partial<UserSettings>): UserSettings {
  return { ...base, ...patch };
}

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { session, configured: authConfigured } = useAuth();
  const cloud = authConfigured && Boolean(session);
  const [ready, setReady] = useState(!authConfigured);
  const [settings, setSettings] = useState<UserSettings>(() => readLocalSettings());
  const [shifts, setShifts] = useState<StoredShift[]>(() => loadLocalShifts());
  const [watchlists, setWatchlistsState] = useState<WatchlistPreset[]>(() =>
    loadLocalWatchlists(),
  );
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrating = useRef(false);

  useEffect(() => {
    if (!authConfigured) {
      setReady(true);
      return;
    }
    if (!session) {
      setSettings(readLocalSettings());
      setShifts(loadLocalShifts());
      setWatchlistsState(loadLocalWatchlists());
      setReady(true);
      return;
    }

    let cancelled = false;
    hydrating.current = true;
    setReady(false);

    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setReady(true);
        hydrating.current = false;
        return;
      }

      const userId = session.user.id;
      try {
        let remoteSettings = await fetchUserSettings(supabase, userId);
        const localSettings = readLocalSettings();
        const localShifts = loadLocalShifts();
        const localWatchlists = loadLocalWatchlists();

        if (!remoteSettings.migratedFromLocal) {
          const merged = mergeSettings(localSettings, remoteSettings);
          merged.migratedFromLocal = true;
          await upsertUserSettings(supabase, userId, merged);
          if (localShifts.length) await migrateLocalShifts(supabase, userId, localShifts);
          if (localWatchlists.length) await replaceWatchlists(supabase, userId, localWatchlists);
          remoteSettings = merged;
        }

        const [remoteShifts, remoteWatchlists] = await Promise.all([
          fetchShifts(supabase, userId),
          fetchWatchlists(supabase, userId),
        ]);

        if (cancelled) return;

        writeLocalSettings(remoteSettings);
        persistLocalShifts(remoteShifts);

        setSettings(remoteSettings);
        setShifts(remoteShifts);
        setWatchlistsState(remoteWatchlists.length ? remoteWatchlists : localWatchlists);
      } catch (err) {
        console.error("Failed to hydrate user data from Supabase:", err);
        if (!cancelled) {
          setSettings(readLocalSettings());
          setShifts(loadLocalShifts());
          setWatchlistsState(loadLocalWatchlists());
        }
      } finally {
        if (!cancelled) {
          setReady(true);
          hydrating.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authConfigured, session?.user.id]);

  const persistSettings = useCallback(
    async (next: UserSettings) => {
      writeLocalSettings(next);
      if (!cloud || !session) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        await upsertUserSettings(supabase, session.user.id, next);
      } catch (err) {
        console.error("Failed to save settings:", err);
      }
    },
    [cloud, session],
  );

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = mergeSettings(prev, patch);
        if (settingsTimer.current) clearTimeout(settingsTimer.current);
        settingsTimer.current = setTimeout(() => {
          void persistSettings(next);
        }, 400);
        return next;
      });
    },
    [persistSettings],
  );

  const saveShift = useCallback(
    async (input: SaveShiftInput): Promise<StoredShift | null> => {
      const record = buildStoredShiftFromInput(input);

      setShifts((cur) => {
        const next = [record, ...cur].slice(0, 40);
        persistLocalShifts(next);
        return next;
      });

      if (!cloud || !session) return record;
      const supabase = getSupabase();
      if (!supabase) return record;

      try {
        const saved = await insertShift(supabase, session.user.id, record);
        setShifts((cur) =>
          [saved, ...cur.filter((s) => s.id !== record.id && s.id !== saved.id)].slice(0, 40),
        );
        return saved;
      } catch (err) {
        console.error("Failed to save shift to Supabase:", err);
        return record;
      }
    },
    [cloud, session],
  );

  const deleteShift = useCallback(
    async (id: string) => {
      setShifts((cur) => {
        const next = cur.filter((s) => s.id !== id);
        persistLocalShifts(next);
        return next;
      });
      if (!cloud || !session) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        await deleteShiftById(supabase, session.user.id, id);
      } catch (err) {
        console.error("Failed to delete shift:", err);
      }
    },
    [cloud, session],
  );

  const clearShifts = useCallback(async () => {
    setShifts([]);
    persistLocalShifts([]);
    if (!cloud || !session) return;
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      await deleteAllShifts(supabase, session.user.id);
    } catch (err) {
      console.error("Failed to clear shifts:", err);
    }
  }, [cloud, session]);

  const setWatchlists = useCallback(
    async (lists: WatchlistPreset[]) => {
      setWatchlistsState(lists);
      localStorage.setItem("floor.customWatchlists", JSON.stringify(lists));
      if (!cloud || !session) return;
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        await replaceWatchlists(supabase, session.user.id, lists);
      } catch (err) {
        console.error("Failed to save watchlists:", err);
      }
    },
    [cloud, session],
  );

  const value = useMemo<UserDataContextValue>(
    () => ({
      ready,
      cloud,
      settings,
      updateSettings,
      shifts,
      saveShift,
      deleteShift,
      clearShifts,
      watchlists,
      setWatchlists,
    }),
    [
      ready,
      cloud,
      settings,
      updateSettings,
      shifts,
      saveShift,
      deleteShift,
      clearShifts,
      watchlists,
      setWatchlists,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error("useUserData must be used within UserDataProvider");
  return ctx;
}

export function useUserDataOptional(): UserDataContextValue | null {
  return useContext(UserDataContext);
}
