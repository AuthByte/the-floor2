import { useEffect } from "react";
import type { AgentDef } from "../lib/agents";
import { getAgentProfile } from "../lib/agentProfiles";
import { AgentScorecardBadge } from "./AgentScorecardBadge";
import { AgentAnalysisView } from "./analysis/AgentAnalysisView";
import { tokenUsageLine } from "../lib/tokenUsage";
import { DATA_ANALYSTS, DEBATE_AGENT, RISK_PIPELINE_AGENTS } from "../lib/agents";
import { parseOutlookFromAnalysis } from "../lib/outlookFormat";
import { hasPriceTargetData, PriceTargetTable } from "./PriceTargetTable";
import { RiskPipelinePanel } from "./RiskPipelinePanel";
import { SubAgentsPanel } from "./SubAgentsPanel";
import { displayThesisText, extractSignal, formatTs } from "../lib/thesisText";
import type { RoomHistoryEntry, RoomState } from "../lib/types";

export interface RoomSelection {
  roomId: string;
  agent: AgentDef;
}

interface Props {
  selection: RoomSelection | null;
  state: RoomState | null;
  onClose: () => void;
}

const TIER_LABEL: Record<string, string> = {
  data: "T0 · Data feed",
  legend: "T1 · Legend",
  specialist: "Further analysis",
  risk: "T2 · Risk gate",
  portfolio: "T3 · Portfolio boss",
  debate: "Debate chamber",
  risk_pipeline: "Risk discovery",
};

function signalTone(signal?: string | null): string {
  if (signal === "bullish") return "text-phos";
  if (signal === "bearish") return "text-siren";
  return "text-wire-400";
}

export function RoomDetailPanel({ selection, state, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!selection || !state) return null;

  const { agent } = selection;
  const profile = getAgentProfile(agent.key);
  const isDebate = agent.key === DEBATE_AGENT.key;
  const isRiskPipeline = RISK_PIPELINE_AGENTS.some((a) => a.key === agent.key);
  const isDataAgent = DATA_ANALYSTS.some((a) => a.key === agent.key);
  const signal = extractSignal(state.analysis);
  const past = [...(state.thesisHistory ?? [])].reverse();
  const outlook = parseOutlookFromAnalysis(state.analysis);
  const priceTargetRows =
    state.ticker && (state.verdict?.priceTarget != null || outlook.price_target != null)
      ? [
          {
            agentName: agent.name,
            agentKey: agent.key,
            currentPrice:
              state.verdict?.referencePrice ?? outlook.reference_price,
            priceTarget: state.verdict?.priceTarget ?? outlook.price_target,
            upsidePct: state.verdict?.upsidePct ?? outlook.upside_pct,
            timeHorizonMonths:
              state.verdict?.timeHorizonMonths ?? outlook.time_horizon_months ?? 12,
          },
        ]
      : [];
  const showPriceTargets = hasPriceTargetData(priceTargetRows);

  return (
    <div
      className="desk-backdrop absolute inset-0 z-30 flex animate-fade-in justify-end bg-ink-950/55 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="room-detail-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">
                {TIER_LABEL[profile.tier] ?? "Agent"}
              </div>
              <h2
                id="room-detail-title"
                className="mt-1 truncate font-display text-base font-bold tracking-[0.06em] text-wire-100"
              >
                {agent.name}
              </h2>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-500">
                {agent.callsign} · {agent.desk}
              </div>
              <AgentScorecardBadge agentKey={agent.key} />
              {state.tokenUsage?.total_tokens ? (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-500">
                  <span className="text-brass/80">tokens · </span>
                  {tokenUsageLine(state.tokenUsage)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-wire-400">
            {profile.investingStyle}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.18em]">
            <Badge label={state.status} />
            {state.ticker ? <Badge label={state.ticker} accent /> : null}
            {signal ? (
              <Badge
                label={signal}
                accent={signal === "bullish"}
                warn={signal === "bearish"}
              />
            ) : null}
          </div>
          {state.message ? (
            <p className="mt-2 text-[10px] text-wire-600">{state.message}</p>
          ) : null}
        </header>

        <div className="desk-stagger min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isRiskPipeline ? (
            <section className="mb-5">
              <SectionTitle tone="siren">risk pipeline</SectionTitle>
              <RiskPipelinePanel agentKey={agent.key} state={state} />
            </section>
          ) : null}

          {!isRiskPipeline && (state.subagents?.length || state.subagentResults?.length) ? (
            <section className="mb-5">
              <SectionTitle tone="brass">sub-agents</SectionTitle>
              <SubAgentsPanel
                subagents={state.subagents ?? []}
                results={state.subagentResults ?? []}
              />
            </section>
          ) : null}

          {isDebate ? (
            <section className="mb-5">
              <SectionTitle tone="siren">live debate</SectionTitle>
              <p className="mb-2.5 text-[11px] text-wire-500">
                Thesis text is hidden here — use the debate theater for the live
                argument.
              </p>
              {(state.debateRounds?.length ?? 0) > 0 ? (
                <ul className="mb-3 max-h-32 space-y-1.5 overflow-y-auto">
                  {state.debateRounds!.map((r) => (
                    <li
                      key={r.ticker}
                      className="rounded-md border border-wire-800/80 bg-ink-900/50 p-2 text-[9px] text-wire-400"
                    >
                      <span className="font-mono text-wire-200">
                        {r.ticker}
                      </span>
                      : {r.left.name} vs {r.right.name}
                      <span className="text-wire-600">
                        {" "}
                        · {r.participant_count ?? r.participants?.length ?? 2}{" "}
                        voices
                      </span>
                      {r.mode ? (
                        <span className="text-wire-600">
                          {" "}
                          · {r.mode.replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {r.winner_name ? (
                        <span className="text-phos"> · {r.winner_name}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {state.debateFeed && state.debateFeed.length > 0 ? (
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {state.debateFeed.map((line, i) => (
                    <li
                      key={`${line.ts}-${i}`}
                      className="rounded-md border border-wire-800 bg-ink-900/60 p-2.5 text-[10px] leading-snug text-wire-200"
                    >
                      <span className="font-semibold text-brass/90">
                        {line.name}
                      </span>
                      {line.ticker ? (
                        <span className="text-wire-500"> · {line.ticker}</span>
                      ) : null}
                      : {line.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-wire-600">
                  {state.status === "WORKING"
                    ? "Debate starting…"
                    : "No debate lines yet."}
                </p>
              )}
            </section>
          ) : (
            <section className="mb-5">
              {state.verdict ? (
                <div className="mb-3 rounded-lg border border-wire-800 bg-ink-900/70 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                    <span
                      className={`font-mono font-semibold ${signalTone(state.verdict.signal)}`}
                    >
                      {state.verdict.signal} ·{" "}
                      {Math.round(state.verdict.confidence)}%
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-wire-100">
                    {state.verdict.summary}
                  </p>
                  {showPriceTargets ? (
                    <div className="mt-3">
                      <PriceTargetTable rows={priceTargetRows} variant="floor" />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <SectionTitle>
                {isDataAgent ? "data desk · live feed" : "full thesis"}
              </SectionTitle>
              {state.analysis || state.status === "WORKING" ? (
                <AgentAnalysisView
                  agentKey={agent.key}
                  analysis={state.analysis}
                  ticker={state.ticker}
                />
              ) : (
                <p className="text-[11px] text-wire-600">
                  No analysis captured for this room yet.
                </p>
              )}
            </section>
          )}

          <section>
            <SectionTitle>past theses · this session</SectionTitle>
            {past.length === 0 ? (
              <p className="text-[11px] text-wire-600">
                Completed theses appear here after each ticker run.
              </p>
            ) : (
              <ul className="space-y-2">
                {past.map((entry, i) => (
                  <HistoryCard key={`${entry.ts}-${i}`} entry={entry} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({
  children,
  tone = "brass",
}: {
  children: React.ReactNode;
  tone?: "brass" | "siren";
}) {
  const dot = tone === "siren" ? "bg-siren/70" : "bg-brass/70";
  const text = tone === "siren" ? "text-siren/80" : "text-brass/80";
  return (
    <h3
      className={`mb-2.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em] ${text}`}
    >
      <span className={`h-1 w-3 rounded-full ${dot}`} />
      {children}
    </h3>
  );
}

function HistoryCard({ entry }: { entry: RoomHistoryEntry }) {
  const preview = entry.analysis ? displayThesisText(entry.analysis) : null;

  return (
    <li className="rounded-md border border-wire-800/80 bg-ink-900/50 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-wire-500">
        <span className="font-mono">{formatTs(entry.ts)}</span>
        {entry.ticker ? (
          <span className="font-mono text-wire-300">{entry.ticker}</span>
        ) : null}
        {entry.signal ? (
          <span className={signalTone(entry.signal)}>{entry.signal}</span>
        ) : null}
        <span className="text-wire-600">{entry.status}</span>
      </div>
      {preview ? (
        <p className="whitespace-pre-wrap text-[10px] leading-snug text-wire-300">
          {preview}
        </p>
      ) : (
        <p className="text-[10px] text-wire-600">{entry.status}</p>
      )}
    </li>
  );
}

function Badge({
  label,
  accent,
  warn,
}: {
  label: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono ${
        warn
          ? "border-siren/50 text-siren"
          : accent
            ? "border-phos/40 text-phos"
            : "border-wire-800 text-wire-500"
      }`}
    >
      {label}
    </span>
  );
}
