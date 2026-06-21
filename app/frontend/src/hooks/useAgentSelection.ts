import { useCallback, useEffect, useMemo, useState } from "react";
import { DATA_ANALYSTS, NAMED_ANALYSTS, SPECIALIST_ANALYSTS } from "../lib/agents";
import {
  defaultEnabledKeys,
  loadEnabledKeys,
  saveEnabledKeys,
  TOGGLEABLE_ANALYST_KEYS,
} from "../lib/agentSelection";

export function useAgentSelection() {
  const [enabled, setEnabled] = useState<Set<string>>(() => loadEnabledKeys());

  useEffect(() => {
    saveEnabledKeys(enabled);
  }, [enabled]);

  const toggle = useCallback((key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const setTier = useCallback((keys: string[], on: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) {
        for (const k of keys) next.add(k);
      } else {
        for (const k of keys) next.delete(k);
        if (next.size === 0) return prev;
      }
      return next;
    });
  }, []);

  const enableAll = useCallback(() => {
    setEnabled(defaultEnabledKeys());
  }, []);

  const disableAllExceptOne = useCallback(() => {
    setEnabled(new Set([TOGGLEABLE_ANALYST_KEYS[0]]));
  }, []);

  const enabledKeys = useMemo(() => [...enabled], [enabled]);
  const enabledCount = enabled.size;
  const totalToggleable = TOGGLEABLE_ANALYST_KEYS.length;

  const dataKeys = useMemo(
    () => DATA_ANALYSTS.map((a) => a.key),
    [],
  );
  const namedKeys = useMemo(
    () => NAMED_ANALYSTS.map((a) => a.key),
    [],
  );
  const specialistKeys = useMemo(
    () => SPECIALIST_ANALYSTS.map((a) => a.key),
    [],
  );

  return {
    enabled,
    enabledKeys,
    enabledCount,
    totalToggleable,
    toggle,
    setTier,
    enableAll,
    disableAllExceptOne,
    dataKeys,
    namedKeys,
    specialistKeys,
  };
}
