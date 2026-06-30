import { useEffect, useState } from "react";

import { getApiBaseUrl } from "./api";

async function scorecardHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const { getSupabase } = await import("./supabase");
    const sb = getSupabase();
    if (!sb) return headers;
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    /* optional auth */
  }
  return headers;
}

export interface AgentScorecard {
  agent_key: string;
  predictions_scored?: number;
  with_price_target?: number;
  direction_hit_rate?: number | null;
  target_hit_rate?: number | null;
  avg_confidence?: number | null;
  updated_at?: string;
}

export interface LeaderboardEntry {
  rank: number;
  agent_key: string;
  display_name: string;
  tier: string;
  predictions_scored?: number;
  direction_hit_rate?: number | null;
  target_hit_rate?: number | null;
  avg_confidence?: number | null;
  with_price_target?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  meta: {
    tier: string;
    sort: string;
    min_n: number;
    total: number;
    offset: number;
    limit: number;
    snapshot_at?: string | null;
  };
}

let cache: Record<string, AgentScorecard> | null = null;
let cacheTs = 0;
const keyedCache: Record<string, AgentScorecard> = {};
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export async function fetchAgentScorecards(
  keys?: string[],
): Promise<Record<string, AgentScorecard>> {
  const now = Date.now();
  if (cache && now - cacheTs < 60_000 && !keys?.length) return cache;

  const qs = keys?.length ? `?keys=${encodeURIComponent(keys.join(","))}` : "";
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/agents/scorecards${qs}`, {
    headers: await scorecardHeaders(),
  });
  if (!res.ok) return keys?.length ? keyedCache : cache ?? {};
  const data = (await res.json()) as { scorecards?: Record<string, AgentScorecard> };
  const cards = data.scorecards ?? {};
  Object.assign(keyedCache, cards);
  notifyListeners();
  if (!keys?.length) {
    cache = cards;
    cacheTs = now;
  }
  return cards;
}

export async function prefetchAgentScorecards(keys: string[]): Promise<Record<string, AgentScorecard>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return keyedCache;
  return fetchAgentScorecards(unique);
}

export function getCachedAgentScorecard(agentKey: string): AgentScorecard | null {
  return keyedCache[agentKey] ?? cache?.[agentKey] ?? null;
}

export function useAgentScorecard(agentKey: string): AgentScorecard | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return getCachedAgentScorecard(agentKey);
}

export async function fetchLeaderboard(params?: {
  tier?: string;
  sort?: string;
  min_n?: number;
  limit?: number;
  offset?: number;
}): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();
  if (params?.tier) search.set("tier", params.tier);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.min_n != null) search.set("min_n", String(params.min_n));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(
    `${getApiBaseUrl()}/hedge-fund/agents/leaderboard${qs ? `?${qs}` : ""}`,
    { headers: await scorecardHeaders() },
  );
  if (!res.ok) {
    return {
      entries: [],
      meta: {
        tier: params?.tier ?? "all",
        sort: params?.sort ?? "direction_hit_rate",
        min_n: params?.min_n ?? 10,
        total: 0,
        offset: params?.offset ?? 0,
        limit: params?.limit ?? 50,
      },
    };
  }
  return (await res.json()) as LeaderboardResponse;
}

export function formatHitRate(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function isLowSample(n: number | undefined): boolean {
  return typeof n === "number" && n >= 5 && n < 10;
}
