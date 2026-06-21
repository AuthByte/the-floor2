import { useEffect, useMemo, useState } from "react";
import {
  collectCommitteeOpinions,
  tallyCommitteeOpinions,
  type CommitteeOpinion,
} from "../lib/opinions";
import { outlookPlaqueLine } from "../lib/outlookFormat";
import type {
  CompletePayload,
  FinalDecisionAction,
  MemoEmailResult,
  PaperTradingResult,
  ShiftArtifact,
  TickerDossier,
  TickerRiskPipeline,
} from "../lib/types";
import { ArtifactGallery } from "./analysis/ArtifactGallery";
import type { AgentArtifact } from "../lib/parseAgentAnalysis";

interface Props {
  data: CompletePayload | null;
  open: boolean;
  onDismiss: () => void;
}

/**
 * The Boss Memo — the portfolio manager's signed verdict, rendered as a
 * physical paper document that drops onto the desk (matching the landing-page
 * comp). Always paper-themed regardless of app light/dark mode. Each position
 * has an expandable dropdown revealing exactly how every committee agent voted.
 */

/* fixed paper-memo palette (independent of app theme) */
const PAPER = "#F4F1E8";
const PAPER_HI = "#FAF7EF";
const INK = "#16140F";
const INK_SOFT = "#4A463C";
const FAINT = "#807A6B";
const HAIR = "rgba(22,20,15,0.16)";
const BRASS = "#A57E22";
const EMERALD = "#0E9F6E";
const RED = "#C8442C";
const AMBER = "#B07A1E";

type Verdict = { label: string; color: string; glyph: string };

function verdictFor(action: string): Verdict {
  switch (action) {
    case "buy":
    case "cover":
      return { label: action.toUpperCase(), color: EMERALD, glyph: "▲" };
    case "sell":
    case "short":
      return { label: action.toUpperCase(), color: RED, glyph: "▼" };
    case "hold":
      return { label: "HOLD", color: AMBER, glyph: "■" };
    default:
      return { label: action.toUpperCase(), color: INK_SOFT, glyph: "◆" };
  }
}

export function DecisionsTerminal({ data, open, onDismiss }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!data || !open) return null;

  const close = () => {
    onDismiss();
  };

  const decisions = data.decisions || {};
  const entries = Object.entries(decisions) as [string, FinalDecisionAction][];
  const analystSignals = data.analyst_signals ?? {};
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, rgba(40,34,22,0.78), rgba(8,7,5,0.92))",
        backdropFilter: "blur(3px)",
      }}
    >
      <div className="absolute inset-0" onClick={close} aria-hidden />

      {/* desk contact shadow */}
      <div
        className="pointer-events-none absolute h-[78vh] w-full max-w-[760px] rounded-[40%]"
        style={{
          bottom: "8vh",
          background: "rgba(0,0,0,0.55)",
          filter: "blur(38px)",
          transformOrigin: "center bottom",
          animation: "memo-shadow 0.9s cubic-bezier(0.22,1,0.36,1) both",
        }}
        aria-hidden
      />

      {/* the memo sheet */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[4px] font-mono"
        role="dialog"
        aria-label="Boss memo"
        style={{
          background: PAPER,
          color: INK,
          border: `1px solid ${HAIR}`,
          boxShadow:
            "0 60px 120px -40px rgba(0,0,0,0.8), 0 2px 0 0 rgba(255,255,255,0.5) inset",
          transformOrigin: "center top",
          animation: "memo-drop 0.95s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* paper grain */}
        <div className="pointer-events-none absolute inset-0 lp-grain opacity-70" aria-hidden />

        {/* header */}
        <header
          className="relative flex shrink-0 items-start justify-between gap-4 px-6 py-4"
          style={{ borderBottom: `1px solid ${HAIR}` }}
        >
          <div>
            <h2 className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
              BOSS MEMO
            </h2>
            <p className="mt-0.5 text-[10px] tracking-[0.22em]" style={{ color: INK_SOFT }}>
              PORTFOLIO MANAGER → TRADING DESK
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[9.5px] tracking-[0.16em] sm:block" style={{ color: FAINT }}>
              {stamp} UTC
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-[2px] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] transition-colors"
              style={{ border: `1px solid ${HAIR}`, color: INK_SOFT }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = BRASS;
                e.currentTarget.style.borderColor = `${BRASS}88`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = INK_SOFT;
                e.currentTarget.style.borderColor = HAIR;
              }}
            >
              esc
            </button>
          </div>
        </header>

        {/* positions */}
        <div className="relative min-h-0 flex-1 overflow-auto px-6 py-2">
          {entries.length === 0 ? (
            <p className="py-12 text-center text-[12px] tracking-[0.2em]" style={{ color: FAINT }}>
              NO DECISIONS RETURNED
            </p>
          ) : (
            entries.map(([ticker, action], i) => (
              <MemoRow
                key={ticker}
                ticker={ticker}
                action={action}
                analystSignals={analystSignals}
                shiftArtifacts={data.shift_artifacts?.[ticker]}
                first={i === 0}
              />
            ))
          )}

          {data.paper_trading ? <PaperTradingSection paper={data.paper_trading} /> : null}
          {data.ticker_dossiers && Object.keys(data.ticker_dossiers).length > 0 ? (
            <DossierSection dossiers={data.ticker_dossiers} />
          ) : null}
          {data.risk_pipeline && Object.keys(data.risk_pipeline).length > 0 ? (
            <RiskPipelineSection pipeline={data.risk_pipeline} />
          ) : null}
          {data.memo_email?.enabled ? (
            <MemoEmailStatus mail={data.memo_email} />
          ) : null}
        </div>

        {/* signature + seal */}
        <footer
          className="relative flex shrink-0 items-end justify-between gap-4 px-6 py-5"
          style={{ borderTop: `1px solid ${HAIR}` }}
        >
          <div>
            <p
              className="text-[22px] italic"
              style={{ color: INK, transform: "rotate(-3deg)", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              The Boss
            </p>
            <p className="mt-1 text-[9px] tracking-[0.18em]" style={{ color: FAINT }}>
              {entries.length} POSITION{entries.length === 1 ? "" : "S"} ·{" "}
              {data.paper_trading?.enabled ? "ALPACA PAPER" : "PAPER ONLY"}
            </p>
          </div>
          <div className="relative flex flex-col items-center" style={{ animation: "seal-stamp 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.7s both" }}>
            <img
              src="/landing/wax-seal.png"
              alt=""
              className="h-16 w-16 select-none object-contain"
              draggable={false}
            />
            <span
              className="mt-0.5 text-[7.5px] tracking-[0.2em]"
              style={{ color: BRASS }}
            >
              {data.paper_trading?.enabled ? "EXECUTED · PAPER DESK" : "SIGNED OFF"}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision row with expandable committee dropdown                     */
/* ------------------------------------------------------------------ */

function MemoRow({
  ticker,
  action,
  analystSignals,
  shiftArtifacts,
  first,
}: {
  ticker: string;
  action: FinalDecisionAction;
  analystSignals: Record<string, Record<string, unknown>>;
  shiftArtifacts?: ShiftArtifact[];
  first: boolean;
}) {
  const [open, setOpen] = useState(true);
  const v = verdictFor(action.action);
  const pct =
    typeof action.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(action.confidence)))
      : null;

  const opinions = useMemo(
    () => collectCommitteeOpinions(ticker, analystSignals),
    [ticker, analystSignals],
  );
  const tally = useMemo(() => tallyCommitteeOpinions(opinions), [opinions]);
  const shiftArts = useMemo(
    () => (shiftArtifacts ?? []) as AgentArtifact[],
    [shiftArtifacts],
  );

  return (
    <article
      className="py-4"
      style={{ borderTop: first ? undefined : `1px solid ${HAIR}` }}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[18px] font-bold tracking-[0.06em]" style={{ color: INK }}>
          {ticker}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-[12px] font-bold tracking-[0.14em]"
          style={{ border: `1px solid ${v.color}66`, color: v.color }}
        >
          <span aria-hidden>{v.glyph}</span>
          {v.label}
          {action.quantity != null ? (
            <span style={{ color: INK_SOFT }}> {action.quantity}</span>
          ) : null}
        </span>

        {pct != null ? (
          <span className="ml-auto flex items-center gap-2.5 text-[9px] uppercase tracking-[0.22em]" style={{ color: FAINT }}>
            conviction
            <span className="relative h-1.5 w-24 overflow-hidden rounded-full" style={{ background: HAIR }}>
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, background: v.color }}
              />
            </span>
            <span className="w-9 text-right text-[12px] font-bold" style={{ color: v.color }}>
              {pct}%
            </span>
          </span>
        ) : null}
      </header>

      {action.reasoning ? (
        <p className="mt-3 max-w-[74ch] text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
          {action.reasoning}
        </p>
      ) : null}

      {/* committee dropdown */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={opinions.length === 0}
        className="mt-3 flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left transition-colors disabled:cursor-default"
        style={{
          border: `1px solid ${HAIR}`,
          background: open ? PAPER_HI : "transparent",
        }}
      >
        <span
          aria-hidden
          className="text-[10px] transition-transform duration-300"
          style={{ color: BRASS, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span className="text-[9.5px] uppercase tracking-[0.2em]" style={{ color: INK_SOFT }}>
          committee vote · {opinions.length} analyst{opinions.length === 1 ? "" : "s"}
        </span>
        {/* quick tally */}
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {tally.bullish > 0 ? (
            <Tally color={EMERALD} label="bull" n={tally.bullish} />
          ) : null}
          {tally.bearish > 0 ? (
            <Tally color={RED} label="bear" n={tally.bearish} />
          ) : null}
          {tally.neutral > 0 ? (
            <Tally color={FAINT} label="neut" n={tally.neutral} />
          ) : null}
        </span>
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-500 ease-out"
        style={{ maxHeight: open ? 1400 : 0, opacity: open ? 1 : 0 }}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {opinions.map((op, idx) => (
            <OpinionCard key={`${ticker}-${op.agentName}-${idx}`} op={op} index={idx} open={open} />
          ))}
        </div>
        {shiftArts.length > 0 ? (
          <div className="mt-4 rounded-[3px] border p-2" style={{ borderColor: HAIR, background: PAPER_HI }}>
            <ArtifactGallery artifacts={shiftArts} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Tally({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 tracking-[0.12em]" style={{ color }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {n}&nbsp;<span style={{ color: FAINT }}>{label}</span>
    </span>
  );
}

function OpinionCard({
  op,
  index,
  open,
}: {
  op: CommitteeOpinion;
  index: number;
  open: boolean;
}) {
  const sigColor =
    op.signal === "bullish" ? EMERALD : op.signal === "bearish" ? RED : FAINT;
  const outlookLine = outlookPlaqueLine(op);
  return (
    <div
      className="rounded-[3px] px-2.5 py-2"
      style={{
        border: `1px solid ${HAIR}`,
        background: PAPER_HI,
        animation: open ? `theater-slide 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(index * 45, 360)}ms both` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10.5px] font-semibold tracking-[0.04em]" style={{ color: INK }}>
          {op.agentName}
        </span>
        <span className="shrink-0 text-[10px] font-bold tracking-[0.08em]" style={{ color: sigColor }}>
          {op.signal.toUpperCase()}
          {op.confidence != null ? ` · ${op.confidence}%` : ""}
        </span>
      </div>
      {op.summary ? (
        <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: INK_SOFT }}>
          {op.summary}
        </p>
      ) : null}
      {outlookLine ? (
        <p className="mt-1 font-mono text-[10px] tabular-nums" style={{ color: FAINT }}>
          {outlookLine}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Email delivery status                                              */
/* ------------------------------------------------------------------ */

function MemoEmailStatus({ mail }: { mail: MemoEmailResult }) {
  const ok = mail.sent;
  const color = ok ? EMERALD : RED;
  return (
    <section
      className="mt-2 rounded-[3px] px-4 py-3"
      style={{
        border: `1px solid ${color}44`,
        background: ok ? "rgba(14,159,110,0.06)" : "rgba(200,68,44,0.06)",
      }}
    >
      <h3
        className="text-[9.5px] font-semibold uppercase tracking-[0.24em]"
        style={{ color }}
      >
        {ok ? "Memo emailed" : "Memo email failed"}
      </h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: INK_SOFT }}>
        {ok
          ? `Sent to ${mail.to ?? "your inbox"}. Check spam if it is not there yet.`
          : mail.error ??
            `Could not send to ${mail.to ?? "recipient"}. Enable “Email boss memo” before the shift and use your Resend account email while on the test sender.`}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Paper trading (restyled for the memo)                              */
/* ------------------------------------------------------------------ */

function PaperTradingSection({ paper }: { paper: PaperTradingResult }) {
  if (!paper.enabled && paper.skipped_reason) {
    return (
      <section
        className="mt-2 rounded-[3px] px-4 py-3"
        style={{ border: `1px solid ${AMBER}44`, background: "rgba(176,122,30,0.06)" }}
      >
        <h3 className="text-[9.5px] font-semibold uppercase tracking-[0.24em]" style={{ color: AMBER }}>
          Alpaca paper
        </h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: INK_SOFT }}>
          {paper.skipped_reason}
        </p>
      </section>
    );
  }

  const acct = paper.account;
  const equity = acct?.equity;
  const cash = acct?.cash;
  const pnl =
    equity != null && acct?.last_equity != null ? equity - acct.last_equity : null;

  return (
    <section
      className="mt-2 rounded-[3px] px-4 py-3"
      style={{ border: `1px solid ${BRASS}44`, background: "rgba(165,126,34,0.05)" }}
    >
      <h3 className="text-[9.5px] font-semibold uppercase tracking-[0.24em]" style={{ color: BRASS }}>
        Alpaca paper desk
      </h3>
      {acct ? (
        <div className="mt-2.5 flex flex-wrap gap-4 text-[11px] uppercase tracking-[0.12em]" style={{ color: INK_SOFT }}>
          <span>
            equity <span style={{ color: INK }}>{equity != null ? fmtUsd(equity) : "—"}</span>
          </span>
          <span>
            cash <span style={{ color: INK }}>{cash != null ? fmtUsd(cash) : "—"}</span>
          </span>
          {pnl != null ? (
            <span>
              day p&amp;l{" "}
              <span style={{ color: pnl >= 0 ? EMERALD : RED }}>
                {pnl >= 0 ? "+" : ""}
                {fmtUsd(pnl)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {paper.orders.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[400px] text-left text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.2em]" style={{ color: FAINT }}>
                <th className="pb-1.5 pr-3">symbol</th>
                <th className="pb-1.5 pr-3">action</th>
                <th className="pb-1.5 pr-3">qty</th>
                <th className="pb-1.5">status</th>
              </tr>
            </thead>
            <tbody style={{ color: INK_SOFT }}>
              {paper.orders.map((o) => (
                <tr key={`${o.ticker}-${o.action}-${o.requested_qty}`}>
                  <td className="py-1 pr-3" style={{ color: INK }}>{o.ticker}</td>
                  <td className="py-1 pr-3">{o.action}</td>
                  <td className="py-1 pr-3">{o.requested_qty}</td>
                  <td
                    className="py-1"
                    style={{
                      color:
                        o.status === "failed" ? RED : o.status === "skipped" ? FAINT : EMERALD,
                    }}
                  >
                    {o.status}
                    {o.error ? (
                      <span className="ml-2 block max-w-md truncate text-[10px] normal-case" style={{ color: RED }}>
                        {o.error}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {paper.positions.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.2em]" style={{ color: FAINT }}>
            open positions
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {paper.positions.map((pos) => (
              <div
                key={pos.symbol}
                className="rounded-[3px] px-2.5 py-2 text-[11px]"
                style={{ border: `1px solid ${HAIR}`, background: PAPER_HI }}
              >
                <div className="flex justify-between" style={{ color: INK }}>
                  <span>{pos.symbol}</span>
                  <span style={{ color: FAINT }}>{pos.qty} sh</span>
                </div>
                {pos.unrealized_pl != null ? (
                  <div className="mt-1" style={{ color: pos.unrealized_pl >= 0 ? EMERALD : RED }}>
                    uP&amp;L {fmtUsd(pos.unrealized_pl)}
                    {pos.unrealized_plpc != null
                      ? ` (${(pos.unrealized_plpc * 100).toFixed(2)}%)`
                      : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RiskPipelineSection({ pipeline }: { pipeline: Record<string, TickerRiskPipeline> }) {
  const tickers = Object.keys(pipeline).sort();
  return (
    <section className="mt-8 pb-4" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="pt-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: INK }}>
          Risk discovery pipeline
        </h3>
      </div>
      <div className="mt-4 space-y-4">
        {tickers.map((ticker) => {
          const p = pipeline[ticker];
          const risks = p.inventory ?? [];
          const scenarios = p.scenarios ?? [];
          return (
            <details
              key={ticker}
              className="rounded-[3px] px-3 py-2"
              style={{ border: `1px solid ${HAIR}`, background: PAPER_HI }}
            >
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: INK }}>
                {ticker}
                <span className="ml-2 text-[10px] font-normal" style={{ color: FAINT }}>
                  {risks.length} risks · {scenarios.length} scenarios
                </span>
              </summary>
              {risks.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px]" style={{ color: INK_SOFT }}>
                  {risks.slice(0, 8).map((r) => (
                    <li key={r.id}>• {r.title}</li>
                  ))}
                </ul>
              ) : null}
              {scenarios.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-[11px]" style={{ color: RED }}>
                  {scenarios.map((sc, i) => (
                    <li key={i}>
                      {sc.title}: rev {sc.impacts?.revenue_pct}% / EPS {sc.impacts?.eps_pct}%
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function DossierSection({ dossiers }: { dossiers: Record<string, TickerDossier> }) {
  const tickers = Object.keys(dossiers).sort();

  return (
    <section className="mt-8 pb-4" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="pt-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: INK }}>
          Ticker dossiers
        </h3>
        <p className="mt-1 text-[10px] tracking-[0.12em]" style={{ color: FAINT }}>
          Structured facts, agent claims, and auto-detected disputes
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {tickers.map((ticker) => {
          const d = dossiers[ticker];
          const disputes = d.disputes ?? [];
          const facts = d.facts ?? [];
          const claims = d.claims ?? [];
          return (
            <details
              key={ticker}
              className="rounded-[3px] px-3 py-2"
              style={{ border: `1px solid ${HAIR}`, background: PAPER_HI }}
            >
              <summary
                className="cursor-pointer text-[12px] font-semibold tracking-wide"
                style={{ color: INK }}
              >
                {ticker}
                <span className="ml-2 text-[10px] font-normal tracking-[0.14em]" style={{ color: FAINT }}>
                  {facts.length} facts · {claims.length} claims
                  {disputes.length > 0 ? ` · ${disputes.length} disputes` : ""}
                </span>
              </summary>

              {disputes.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[11px]" style={{ color: RED }}>
                  {disputes.map((item) => (
                    <li key={item.id}>⚑ {item.summary ?? item.kind}</li>
                  ))}
                </ul>
              ) : null}

              {claims.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-[11px]" style={{ color: INK_SOFT }}>
                  {claims.map((c) => (
                    <li key={c.id}>
                      <span style={{ color: INK }}>{c.agent}</span> — {c.signal} ({c.confidence}%):{" "}
                      {c.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
