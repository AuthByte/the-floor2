import { collectCommitteeOpinions, tallyCommitteeOpinions } from "../opinions";
import type { AgentArtifact } from "../parseAgentAnalysis";
import type { CompletePayload, DebateRound, ShiftArtifact } from "../types";
import { weatherForTicker } from "../weatherReport";
import type { FloorPostSnapshot, ShiftArchiveInput, TickerSnapshot } from "./types";

function isEphemeralArtifactUrl(url: string): boolean {
  return url.startsWith("/artifacts/") || url.includes("127.0.0.1") || url.includes("localhost");
}

function toAgentArtifact(art: ShiftArtifact): AgentArtifact {
  return {
    id: art.id,
    title: art.title,
    caption: art.caption,
    url: art.url,
    width: art.width,
    height: art.height,
    kind: art.kind,
    data: art.data,
    graph: art.graph as AgentArtifact["graph"],
  };
}

function collectArtifacts(payload: CompletePayload | null): {
  artifacts: AgentArtifact[];
  warnings: string[];
} {
  if (!payload) return { artifacts: [], warnings: [] };
  const byId = new Map<string, AgentArtifact>();
  const warnings: string[] = [];

  for (const list of Object.values(payload.shift_artifacts ?? {})) {
    for (const art of list ?? []) {
      if (!art?.id) continue;
      const mapped = toAgentArtifact(art);
      if (mapped.url && isEphemeralArtifactUrl(mapped.url)) {
        warnings.push(`${art.title}: local URL omitted from share`);
        if (mapped.kind && mapped.data) {
          byId.set(art.id, { ...mapped, url: undefined });
        }
        continue;
      }
      byId.set(art.id, mapped);
    }
  }

  for (const byTicker of Object.values(payload.analyst_signals ?? {})) {
    if (!byTicker || typeof byTicker !== "object") continue;
    for (const bucket of Object.values(byTicker)) {
      if (!bucket || typeof bucket !== "object") continue;
      const rawArts = (bucket as Record<string, unknown>).artifacts;
      if (!Array.isArray(rawArts)) continue;
      for (const art of rawArts) {
        if (!art || typeof art !== "object") continue;
        const a = art as ShiftArtifact;
        if (!a.id || byId.has(a.id)) continue;
        const mapped = toAgentArtifact(a);
        if (mapped.url && isEphemeralArtifactUrl(mapped.url)) {
          if (mapped.kind && mapped.data) {
            byId.set(a.id, { ...mapped, url: undefined });
          }
          continue;
        }
        byId.set(a.id, mapped);
      }
    }
  }

  return { artifacts: [...byId.values()], warnings: [...new Set(warnings)] };
}

function debateRoundsForTicker(
  payload: CompletePayload | null,
  ticker: string,
): DebateRound[] {
  const rounds = payload?.debate_rounds;
  if (!Array.isArray(rounds)) return [];
  const upper = ticker.toUpperCase();
  return rounds.filter((r) => r.ticker?.toUpperCase() === upper);
}

function buildTickerSnapshots(shift: ShiftArchiveInput): TickerSnapshot[] {
  const payload = shift.payload;
  const signals = payload?.analyst_signals ?? {};

  return shift.tickers.map((ticker) => {
    const upper = ticker.toUpperCase();
    const opinions = collectCommitteeOpinions(upper, signals);
    const dossier = payload?.ticker_dossiers?.[upper];
    const summaryLine = shift.summary.find((s) => s.ticker.toUpperCase() === upper) ?? null;

    return {
      ticker: upper,
      bossDecision: shift.decisions?.[upper] ?? shift.decisions?.[ticker] ?? null,
      price: shift.prices?.[upper] ?? shift.prices?.[ticker] ?? null,
      summaryLine,
      opinions,
      tally: tallyCommitteeOpinions(opinions),
      weather: weatherForTicker(payload, upper),
      disputes:
        dossier?.disputes
          ?.filter((d) => d.summary)
          .map((d) => ({
            summary: d.summary!,
            agents: d.agent ? [d.agent] : undefined,
          })) ??
        (payload?.weather_reports?.[upper]?.top_disputes ?? []).map((d) => ({
          summary: d.summary,
          agents: d.agents,
        })),
      debateRounds: debateRoundsForTicker(payload, upper),
    };
  });
}

export function buildPostSnapshot(shift: ShiftArchiveInput): FloorPostSnapshot {
  const { artifacts, warnings } = collectArtifacts(shift.payload);
  return {
    tickers: buildTickerSnapshots(shift),
    artifacts,
    ephemeralArtifactWarnings: warnings,
  };
}

export function pickHeroArtifactUrl(snapshot: FloorPostSnapshot): string | null {
  const withUrl = snapshot.artifacts.find((a) => a.url && !isEphemeralArtifactUrl(a.url));
  return withUrl?.url ?? null;
}
