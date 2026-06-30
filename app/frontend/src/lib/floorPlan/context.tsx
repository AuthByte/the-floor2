import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  FLOOR_LAYOUT_META,
  initialFloorLayoutMode,
  persistFloorLayoutMode,
  type FloorLayoutMode,
} from "../floorLayoutMode";
import {
  getActiveFloorPlan,
  setActiveFloorPlanMode,
} from "./registry";
import type { FloorPlan } from "./types";

interface FloorPlanContextValue {
  mode: FloorLayoutMode;
  plan: FloorPlan;
  toggleMode: () => void;
  setMode: (mode: FloorLayoutMode) => void;
}

const FloorPlanContext = createContext<FloorPlanContextValue | null>(null);

export function FloorPlanProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<FloorLayoutMode>(() => {
    const stored = initialFloorLayoutMode();
    setActiveFloorPlanMode(stored);
    return stored;
  });

  const plan = useMemo(() => getActiveFloorPlan(), [mode]);

  const setMode = useCallback((next: FloorLayoutMode) => {
    setActiveFloorPlanMode(next);
    persistFloorLayoutMode(next);
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "stack" ? "wings" : "stack");
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, plan, toggleMode, setMode }),
    [mode, plan, toggleMode, setMode],
  );

  return (
    <FloorPlanContext.Provider value={value}>{children}</FloorPlanContext.Provider>
  );
}

export function useFloorPlan(): FloorPlanContextValue {
  const ctx = useContext(FloorPlanContext);
  if (!ctx) {
    throw new Error("useFloorPlan must be used within FloorPlanProvider");
  }
  return ctx;
}

export function useFloorPlanMeta(mode: FloorLayoutMode) {
  return FLOOR_LAYOUT_META[mode];
}
