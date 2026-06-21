import { ANALYSTS } from "./agents";

export const AGENT_SELECTION_STORAGE = "floor.enabledAgents";

/** Analyst agent keys the user can enable/disable (excludes PM & risk). */
export const TOGGLEABLE_ANALYST_KEYS: readonly string[] = ANALYSTS.map((a) => a.key);

export function defaultEnabledKeys(): Set<string> {
  return new Set(TOGGLEABLE_ANALYST_KEYS);
}

export function loadEnabledKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(AGENT_SELECTION_STORAGE);
    if (!raw) return defaultEnabledKeys();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultEnabledKeys();
    const valid = new Set<string>(TOGGLEABLE_ANALYST_KEYS);
    const keys = parsed.filter(
      (k): k is string => typeof k === "string" && valid.has(k),
    );
    if (keys.length === 0) return defaultEnabledKeys();
    // New analysts since last save are enabled by default
    for (const k of TOGGLEABLE_ANALYST_KEYS) {
      if (!keys.includes(k)) keys.push(k);
    }
    return new Set(keys);
  } catch {
    return defaultEnabledKeys();
  }
}

export function saveEnabledKeys(keys: Set<string>): void {
  localStorage.setItem(AGENT_SELECTION_STORAGE, JSON.stringify([...keys]));
}

export function isAnalystEnabled(
  agentKey: string,
  enabled: Set<string>,
): boolean {
  return enabled.has(agentKey);
}
