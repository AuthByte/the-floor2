import type { SubagentResult, SubagentStatus } from "../lib/types";

interface Props {
  subagents: SubagentStatus[];
  results: SubagentResult[];
}

function statusTone(status: string): string {
  if (status === "done") return "text-phos";
  if (status === "failed") return "text-siren";
  if (status === "running") return "text-amber";
  return "text-wire-500";
}

export function SubAgentsPanel({ subagents, results }: Props) {
  if (!subagents.length && !results.length) return null;

  const resultsById = new Map(results.map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      {subagents.length > 0 ? (
        <div>
          <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-brass/80">
            Delegated sub-agents
          </div>
          <ul className="space-y-1.5 text-[11px]">
            {subagents.map((s) => (
              <li
                key={s.id}
                className="rounded border border-wire-800/60 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-wire-100">{s.label}</span>
                  <span className={`text-[10px] uppercase tracking-wider ${statusTone(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                {s.task ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-wire-500">{s.task}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div>
          <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-brass/80">
            Sub-agent briefs
          </div>
          <ul className="space-y-2.5 text-[11px]">
            {results.map((r) => {
              const live = resultsById.get(r.id) ?? r;
              return (
                <li
                  key={r.id}
                  className="rounded border border-wire-800/80 bg-ink-900/60 px-2.5 py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-wire-100">{live.label}</span>
                    {live.confidence != null ? (
                      <span className="font-mono text-[10px] text-wire-500">
                        {Math.round(live.confidence)}% conf
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 leading-relaxed text-wire-300">{live.summary}</p>
                  {live.key_findings?.length ? (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-[10px] text-wire-400">
                      {live.key_findings.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  ) : null}
                  {live.error ? (
                    <p className="mt-1 text-[10px] text-siren">{live.error}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
