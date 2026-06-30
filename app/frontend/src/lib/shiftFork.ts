import type { CommitteeOpinion } from "./opinions";
import type { CompletePayload, FinalDecisionAction } from "./types";
import { computeShadowVerdict, type ShadowVerdict, type WeightMode } from "./shadowBench";

export interface ForkSnapshot {
  id: string;
  parentShiftId?: string;
  parentPostId?: string;
  createdAt: number;
  label: string;
  ticker: string;
  enabledAgents: string[];
  weightMode: WeightMode;
  preset: string;
  verdict: ShadowVerdict;
  bossDecision: FinalDecisionAction | null;
  refPrice?: number;
}

export interface ForkDiffRow {
  agentKey: string;
  agentName: string;
  beforeSignal: string;
  afterSignal: string;
  beforeTarget?: number;
  afterTarget?: number;
  changed: boolean;
}

export function diffForkOpinions(
  before: CommitteeOpinion[],
  after: CommitteeOpinion[],
): ForkDiffRow[] {
  const beforeMap = new Map(before.map((o) => [o.agentKey, o]));
  const keys = new Set([...beforeMap.keys(), ...after.map((a) => a.agentKey)]);
  const rows: ForkDiffRow[] = [];

  for (const key of keys) {
    const b = beforeMap.get(key);
    const a = after.find((x) => x.agentKey === key);
    if (!a && !b) continue;
    const beforeSignal = b?.signal ?? "—";
    const afterSignal = a?.signal ?? "—";
    rows.push({
      agentKey: key,
      agentName: a?.agentName ?? b?.agentName ?? key,
      beforeSignal,
      afterSignal,
      beforeTarget: b?.priceTarget,
      afterTarget: a?.priceTarget,
      changed:
        beforeSignal !== afterSignal ||
        b?.priceTarget !== a?.priceTarget ||
        Boolean(a && !b),
    });
  }

  return rows.sort((x, y) => Number(y.changed) - Number(x.changed));
}

export function buildForkSnapshot(params: {
  ticker: string;
  label: string;
  enabledAgents: string[];
  weightMode: WeightMode;
  preset: string;
  payload: CompletePayload;
  parentShiftId?: string;
  parentPostId?: string;
}): ForkSnapshot {
  const enabled: Record<string, boolean> = {};
  for (const k of params.enabledAgents) enabled[k] = true;
  const boss = params.payload.decisions?.[params.ticker] ?? null;
  const verdict = computeShadowVerdict(
    params.ticker,
    params.payload.analyst_signals ?? {},
    enabled,
    params.weightMode,
    boss,
  );
  if (!verdict) {
    throw new Error("Could not compute fork verdict");
  }
  return {
    id: `fork_${Date.now().toString(36)}`,
    parentShiftId: params.parentShiftId,
    parentPostId: params.parentPostId,
    createdAt: Date.now(),
    label: params.label,
    ticker: params.ticker,
    enabledAgents: [...params.enabledAgents],
    weightMode: params.weightMode,
    preset: params.preset,
    verdict,
    bossDecision: boss,
    refPrice: params.payload.current_prices?.[params.ticker],
  };
}

const FORK_STORAGE = "floor.forkSnapshots";

export function saveForkLocal(fork: ForkSnapshot): void {
  const raw = localStorage.getItem(FORK_STORAGE);
  const list: ForkSnapshot[] = raw ? (JSON.parse(raw) as ForkSnapshot[]) : [];
  list.unshift(fork);
  localStorage.setItem(FORK_STORAGE, JSON.stringify(list.slice(0, 20)));
}

export function loadForksLocal(): ForkSnapshot[] {
  try {
    const raw = localStorage.getItem(FORK_STORAGE);
    return raw ? (JSON.parse(raw) as ForkSnapshot[]) : [];
  } catch {
    return [];
  }
}
