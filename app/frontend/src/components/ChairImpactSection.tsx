import type { ChairImpact, FinalDecisionAction } from "../lib/types";
import type { ThesisRevision } from "../lib/opinions";

const PAPER = "#F4F1E8";
const INK = "#16140F";
const INK_SOFT = "#4A463C";
const FAINT = "#807A6B";
const HAIR = "rgba(22,20,15,0.16)";
const BRASS = "#A57E22";
const RED = "#C8442C";

function revisionSummary(rev: ThesisRevision): string {
  const b = rev.before;
  const a = rev.after;
  const delta =
    b && a
      ? `${a.signal ?? "—"} ${a.confidence != null ? `${Math.round(Number(a.confidence))}%` : ""} (was ${b.signal ?? "—"} ${b.confidence != null ? `${b.confidence}%` : ""})`
      : "";
  return rev.prompt ? `@consult: "${rev.prompt}" → ${delta}` : delta;
}

interface Props {
  impact: ChairImpact;
}

export function ChairImpactSection({ impact }: Props) {
  if (!impact.consult_count) return null;

  const pmChanged = Object.entries(impact.decisions).filter(([, d]) => d.changed);
  if (impact.material_count === 0 && pmChanged.length === 0 && impact.consult_count === 0) {
    return null;
  }

  return (
    <section
      className="mx-6 mb-4 mt-2 rounded-[2px] border px-4 py-3"
      style={{ borderColor: `${BRASS}66`, background: PAPER }}
    >
      <p
        className="font-mono text-[9px] uppercase tracking-[0.28em]"
        style={{ color: BRASS }}
      >
        changed by chair
      </p>
      <p className="mt-1 font-mono text-[9px] tracking-[0.08em]" style={{ color: FAINT }}>
        {impact.consult_count} consult{impact.consult_count === 1 ? "" : "s"} ·{" "}
        {impact.material_count} material
        {pmChanged.length > 0
          ? ` · PM action changed on ${pmChanged.map(([t]) => t).join(", ")}`
          : ""}
      </p>

      <div className="mt-3 space-y-3">
        {pmChanged.map(([ticker, rev]) => {
          const before = rev.before as FinalDecisionAction;
          const after = rev.after as FinalDecisionAction;
          return (
            <div
              key={ticker}
              className="rounded-[2px] border px-3 py-2"
              style={{ borderColor: HAIR }}
            >
              <p className="font-mono text-[10px] font-semibold" style={{ color: INK }}>
                [{ticker}] {(before?.action ?? "hold").toUpperCase()}{" "}
                {before?.confidence != null ? `${before.confidence}%` : ""}
                <span style={{ color: FAINT }}> → </span>
                {(after?.action ?? "hold").toUpperCase()}{" "}
                {after?.confidence != null ? `${after.confidence}%` : ""}
              </p>
            </div>
          );
        })}

        {impact.revisions.map((r, i) =>
          r.prompt ? (
            <p key={r.id ?? i} className="text-[9px] leading-snug" style={{ color: INK_SOFT }}>
              {revisionSummary(r)}
            </p>
          ) : null,
        )}

        {impact.debate_adjustments.map((adj) =>
          adj.cohort_changes?.length ? (
            <p key={adj.ticker} className="text-[8px]" style={{ color: FAINT }}>
              Debate [{adj.ticker}]:{" "}
              {adj.cohort_changes.map((c) => `${c.agent} → ${c.to_cohort}`).join("; ")}
            </p>
          ) : null,
        )}
      </div>

      {impact.propagation_errors?.length ? (
        <p className="mt-2 text-[8px]" style={{ color: RED }}>
          Partial apply: {impact.propagation_errors.join("; ")}
        </p>
      ) : null}
    </section>
  );
}
