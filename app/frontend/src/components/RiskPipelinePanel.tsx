import type { RoomState } from "../lib/types";
import { parseEmbeddedArtifacts } from "../lib/parseAgentAnalysis";
import { ArtifactGallery } from "./analysis/ArtifactGallery";
import {
  RISK_FORGE_ID,
  RISK_RESEARCH_HUB_ID,
  RISK_WATCHTOWER_ID,
  SCENARIO_LAB_ID,
} from "../lib/layout";

interface Props {
  agentKey: string;
  state: RoomState;
}

function statusLight(status: string): string {
  if (status === "high") return "bg-siren";
  if (status === "medium") return "bg-amber";
  return "bg-phos";
}

export function RiskPipelinePanel({ agentKey, state }: Props) {
  const embedded = parseEmbeddedArtifacts(state.analysis);

  if (agentKey === RISK_FORGE_ID) {
    const items = state.riskInventory ?? [];
    return (
      <div className="space-y-4">
        {embedded.length > 0 ? <ArtifactGallery artifacts={embedded} /> : null}
        {!items.length ? (
          <p className="text-[11px] text-wire-500">
            Risk inventory appears here as the forge completes each ticker.
          </p>
        ) : (
          <ul className="space-y-2 text-[11px] text-wire-300">
            {items.map((r) => (
              <li key={r.id} className="rounded border border-wire-800/80 bg-ink-900/60 px-2.5 py-2">
                <div className="font-medium text-wire-100">{r.title}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-wire-500">
                  {r.category}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (agentKey === RISK_RESEARCH_HUB_ID) {
    const subs = state.riskSubagents ?? [];
    const reports = state.riskReports ?? [];
    return (
      <div className="space-y-4">
        {subs.length > 0 ? (
          <div>
            <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-brass/80">
              Specialist subagents
            </div>
            <ul className="space-y-1.5 text-[11px]">
              {subs.map((s) => (
                <li
                  key={`${s.id}-${s.risk_id}`}
                  className="flex items-center justify-between rounded border border-wire-800/60 px-2 py-1.5"
                >
                  <span className="text-wire-200">{s.id.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-wire-500">{s.status}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {reports.length > 0 ? (
          <div>
            <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-brass/80">
              Research scores
            </div>
            <ul className="space-y-2 text-[11px] text-wire-300">
              {reports.map((block, i) => (
                <li key={i} className="rounded border border-wire-800/80 bg-ink-900/60 px-2.5 py-2">
                  <div>
                    P≈{block.blended_probability_pct}% · severity{" "}
                    {block.blended_severity_score}/10
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-wire-500">Specialists dispatch as risks are routed.</p>
        )}
      </div>
    );
  }

  if (agentKey === SCENARIO_LAB_ID) {
    const scenarios = state.riskScenarios ?? [];
    return (
      <div className="space-y-4">
        {embedded.length > 0 ? <ArtifactGallery artifacts={embedded} /> : null}
        {!scenarios.length ? (
          <p className="text-[11px] text-wire-500">Scenario impacts model here after research.</p>
        ) : (
          <ul className="space-y-3 text-[11px]">
            {scenarios.map((sc, i) => (
              <li key={i} className="rounded border border-wire-800/80 bg-ink-900/60 px-2.5 py-2">
                <div className="font-medium text-wire-100">{sc.title}</div>
                <div className="mt-1 text-wire-400">P={sc.probability_pct}%</div>
                <div className="mt-1 text-siren">
                  Rev {sc.impacts?.revenue_pct}% · EPS {sc.impacts?.eps_pct}% · DCF{" "}
                  {sc.impacts?.dcf_pct}%
                </div>
                {sc.exposed_segments?.length ? (
                  <ul className="mt-2 text-[10px] text-wire-500">
                    {sc.exposed_segments.map((seg) => (
                      <li key={seg.name}>
                        {seg.name} — {seg.exposure}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (agentKey === RISK_WATCHTOWER_ID) {
    const mon = state.riskMonitoring ?? {};
    const entries = Object.entries(mon);
    if (!entries.length) {
      return <p className="text-[11px] text-wire-500">Live risk status updates appear after scan.</p>;
    }
    return (
      <ul className="space-y-3 text-[11px]">
        {entries.map(([id, row]) => (
          <li key={id} className="rounded border border-wire-800/80 bg-ink-900/60 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusLight(row.status)}`} />
              <span className="font-medium uppercase text-wire-100">{row.status}</span>
              <span className="text-wire-500">score {(row.score ?? 0) * 100}%</span>
            </div>
            {row.changes_this_month?.length ? (
              <ul className="mt-2 space-y-1 text-[10px] text-wire-400">
                {row.changes_this_month.map((c) => (
                  <li key={c.indicator}>
                    {c.indicator}: {c.delta_pct > 0 ? "+" : ""}
                    {c.delta_pct}%
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
