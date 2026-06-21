import { parseAgentAnalysis } from "../../lib/parseAgentAnalysis";
import { formatHorizonMonths, formatPriceTarget, formatUpsidePct } from "../../lib/outlookFormat";
import { displayThesisText } from "../../lib/thesisText";
import { ArtifactGallery } from "./ArtifactGallery";
import { FundamentalsView } from "./FundamentalsView";

interface Props {
  agentKey: string;
  analysis: string | null;
  ticker: string | null;
}

export function AgentAnalysisView({ agentKey, analysis, ticker }: Props) {
  const parsed = parseAgentAnalysis(analysis, agentKey);

  if (!parsed) {
    return (
      <p className="text-[11px] text-wire-600">
        No analysis captured for this room yet.
      </p>
    );
  }

  if (parsed.kind === "fundamentals") {
    return (
      <div className="space-y-4">
        <ArtifactGallery artifacts={parsed.data.artifacts} />
        <FundamentalsView data={parsed.data} ticker={ticker} />
      </div>
    );
  }

  if (parsed.kind === "metrics") {
    const d = parsed.data;
    return (
      <div className="space-y-3">
        {(d.signal || d.confidence != null) && (
          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.2em]">
            {ticker ? (
              <span className="border border-wire-800 px-1.5 text-wire-400">{ticker}</span>
            ) : null}
            {d.signal ? (
              <span
                className={`border px-1.5 ${
                  d.signal === "bullish"
                    ? "border-phos/40 text-phos"
                    : d.signal === "bearish"
                      ? "border-siren/50 text-siren"
                      : "border-wire-800 text-wire-500"
                }`}
              >
                {d.signal}
              </span>
            ) : null}
          </div>
        )}
        <ArtifactGallery artifacts={d.artifacts} />
        <div className="grid gap-2 sm:grid-cols-2">
          {d.rows.map((row) => (
            <div
              key={row.label}
              className="border border-wire-800 bg-ink-900/60 px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-[0.16em] text-wire-500">
                  {row.label}
                </span>
                {row.signal ? (
                  <span className="text-[8px] uppercase text-phos/90">{row.signal}</span>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-wire-200">{row.value}</p>
            </div>
          ))}
        </div>
        {d.summary && d.rows.length === 0 ? (
          <pre className="whitespace-pre-wrap text-[10px] text-wire-300">{d.summary}</pre>
        ) : null}
      </div>
    );
  }

  if (parsed.kind === "investor_json") {
    const d = parsed.data;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.2em]">
          {ticker ? (
            <span className="border border-wire-800 px-1.5 text-wire-400">{ticker}</span>
          ) : null}
          {d.signal ? (
            <span
              className={`border px-1.5 ${
                d.signal === "bullish"
                  ? "border-phos/40 text-phos"
                  : d.signal === "bearish"
                    ? "border-siren/50 text-siren"
                    : "border-wire-800 text-wire-500"
              }`}
            >
              {d.signal}
            </span>
          ) : null}
          {d.confidence != null ? (
            <span className="border border-wire-800 px-1.5 text-wire-300">
              {Math.round(d.confidence)}% confidence
            </span>
          ) : null}
          {d.priceTarget != null ? (
            <span className="border border-wire-800 px-1.5 font-mono text-wire-200">
              PT {formatPriceTarget(d.priceTarget)}
            </span>
          ) : null}
          {d.timeHorizonMonths != null ? (
            <span className="border border-wire-800 px-1.5 text-wire-400">
              {formatHorizonMonths(d.timeHorizonMonths)}
            </span>
          ) : null}
          {d.upsidePct != null ? (
            <span
              className={`border px-1.5 font-mono ${
                d.upsidePct >= 0 ? "border-phos/35 text-phos" : "border-siren/40 text-siren"
              }`}
            >
              {formatUpsidePct(d.upsidePct)}
            </span>
          ) : null}
        </div>
        {d.thesisSummary ? (
          <div className="border border-phos/30 bg-phos/5 px-2 py-1.5">
            <div className="text-[8px] uppercase tracking-[0.2em] text-phos/70">
              thesis headline
            </div>
            <p className="text-[10px] leading-snug text-wire-100">{d.thesisSummary}</p>
          </div>
        ) : null}
        <ArtifactGallery artifacts={d.artifacts} />
        <div className="border border-wire-800 bg-ink-900/60 px-2 py-2">
          <div className="mb-1 text-[8px] uppercase tracking-[0.2em] text-wire-500">
            full thesis
          </div>
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-wire-200">
            {d.reasoning}
          </p>
        </div>
        {d.evidence.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {d.evidence.map((row) => (
              <div
                key={row.label}
                className="border border-wire-800 bg-ink-900/60 px-2 py-1.5"
              >
                <div className="text-[9px] uppercase tracking-[0.16em] text-wire-500">
                  {row.label}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-snug text-wire-300">
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap break-words border border-wire-800 bg-ink-900/80 p-3 text-[11px] leading-relaxed text-wire-100">
      {parsed.text || displayThesisText(analysis ?? "")}
    </pre>
  );
}
