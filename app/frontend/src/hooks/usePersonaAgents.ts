import { useCallback, useEffect, useState } from "react";

import { getApiBaseUrl, authHeaders } from "../lib/api";
import type { AgentDef } from "../lib/agents";
import { personaToAgentDef, type PersonaPackSummary } from "../lib/personaAgents";

export interface UsePersonaAgentsResult {
  personaAgents: AgentDef[];
  packs: PersonaPackSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetch minted persona packs and expose them as roster-ready AgentDefs.
 * Stub for PR6 — wired to GET /personas?mine=1 when auth is available.
 */
export function usePersonaAgents(enabled = true): UsePersonaAgentsResult {
  const [packs, setPacks] = useState<PersonaPackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/personas?mine=1`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Failed to load personas (${res.status})`);
      }
      const data = (await res.json()) as { packs?: PersonaPackSummary[] };
      setPacks(data.packs ?? []);
    } catch (err) {
      setPacks([]);
      setError(err instanceof Error ? err.message : "Failed to load personas");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const personaAgents = packs.map(personaToAgentDef);

  return { personaAgents, packs, loading, error, refresh };
}
