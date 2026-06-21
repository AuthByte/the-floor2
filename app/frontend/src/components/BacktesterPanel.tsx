import { useEffect, useMemo, useRef, useState } from "react";

import { runBacktest } from "../lib/api";
import { buildAgentGraph } from "../lib/buildGraph";
import { OLLAMA_PROVIDER } from "../lib/models";
import { parseWatchlistInput } from "../lib/tickerInput";
import type {
  BacktestDayResult,
  BacktestMetrics,
  RunState,
} from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tickers: string;
  model: string;
  provider: string;
  openrouterKey: string;
  enabledAgentKeys: string[];
  initialCapital: number;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

const RANGES: { label: string; days: number }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
];

export function BacktesterPanel(p: Props) {
  const [startDate, setStartDate] = useState(() => daysAgo(90));
  const [endDate, setEndDate] = useState(() => daysAgo(1));
  const [capital, setCapital] = useState(p.initialCapital);
  const [runState, setRunState] = useState<RunState>("idle");
  const [days, setDays] = useState<BacktestDayResult[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [tick, setTick] = useState<{ date: string; step: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (p.open) setCapital((c) => (c > 0 ? c : p.initialCapital));
  }, [p.open, p.initialCapital]);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p]);

  useEffect(() => () => abortRef.current?.(), []);

  const parsed = useMemo(() => parseWatchlistInput(p.tickers), [p.tickers]);
  const directTickers = parsed.kind === "direct" ? parsed.tickers : [];
  const isLocal = p.provider === OLLAMA_PROVIDER;
  const isRunning = runState === "running";

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (directTickers.length === 0)
      out.push("Enter ticker symbols (e.g. AAPL, MSFT) in the console watchlist");
    if (p.enabledAgentKeys.length === 0) out.push("Enable at least one analyst in Manage Roster");
    if (!isLocal && !p.openrouterKey.trim()) out.push("Add an OpenRouter key (or pick a local model)");
    if (!startDate || !endDate) out.push("Pick a start and end date");
    else if (startDate >= endDate) out.push("Start date must be before end date");
    if (!(capital > 0)) out.push("Initial capital must be positive");
    return out;
  }, [directTickers.length, p.enabledAgentKeys.length, isLocal, p.openrouterKey, startDate, endDate, capital]);

  const canRun = blockers.length === 0 && !isRunning;

  const finalValue = days.length ? days[days.length - 1].portfolio_value : null;
  const totalReturnPct =
    finalValue != null && capital > 0 ? (finalValue / capital - 1) * 100 : null;

  function start() {
    if (!canRun) return;
    setRunState("running");
    setDays([]);
    setMetrics(null);
    setTick(null);
    setErrorMsg(null);

    const { graphNodes, graphEdges } = buildAgentGraph(p.enabledAgentKeys);
    const apiKeys: Record<string, string> = {};
    if (p.openrouterKey.trim()) apiKeys.OPENROUTER_API_KEY = p.openrouterKey.trim();

    abortRef.current = runBacktest(
      {
        tickers: directTickers,
        graph_nodes: graphNodes,
        graph_edges: graphEdges,
        model_name: p.model,
        model_provider: p.provider,
        start_date: startDate,
        end_date: endDate,
        initial_capital: capital,
        margin_requirement: 0,
        api_keys: Object.keys(apiKeys).length ? apiKeys : undefined,
      },
      {
        onTick: (info) => setTick(info),
        onDay: (day) => setDays((prev) => [...prev, day]),
        onComplete: (data) => {
          setMetrics(data.performance_metrics);
          setRunState("complete");
        },
        onError: (msg) => {
          setErrorMsg(msg);
          setRunState("error");
        },
      },
    );
  }

  function stop() {
    abortRef.current?.();
    abortRef.current = null;
    setRunState((s) => (s === "running" ? "idle" : s));
  }

  if (!p.open) return null;

  const progressPct = tick && tick.total > 0 ? (tick.step / tick.total) * 100 : 0;

  return (
    <div
      className="absolute inset-0 z-40 flex justify-center bg-ink-950/60 backdrop-blur-[2px] p-4"
      role="presentation"
      onMouseDown={p.onClose}
    >
      <section
        className="flex h-full w-full max-w-5xl animate-rise-in flex-col overflow-hidden rounded-lg border border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="backtester-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">
                research desk
              </div>
              <h2
                id="backtester-title"
                className="mt-1 font-display text-lg font-bold tracking-[0.12em] text-wire-100"
              >
                BACKTESTER
              </h2>
            </div>
            <button
              type="button"
              onClick={p.onClose}
              className="rounded border border-wire-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-siren/60 hover:text-siren"
            >
              close
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
          {/* Config */}
          <div className="grid gap-4 rounded-md border border-wire-800/80 bg-ink-900/50 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
            <Field label="watchlist" hint={`${directTickers.length || "—"} symbols · from console`}>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {directTickers.length ? (
                  directTickers.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-wire-700 bg-ink-950 px-2 py-0.5 font-mono text-[11px] tracking-[0.1em] text-wire-200"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-siren/80">set symbols in the console</span>
                )}
              </div>
            </Field>
            <Field label="start" hint="">
              <input
                type="date"
                value={startDate}
                max={endDate}
                disabled={isRunning}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent font-mono text-sm text-wire-100 outline-none [color-scheme:dark]"
              />
            </Field>
            <Field label="end" hint="">
              <input
                type="date"
                value={endDate}
                min={startDate}
                disabled={isRunning}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-transparent font-mono text-sm text-wire-100 outline-none [color-scheme:dark]"
              />
            </Field>
            <Field label="capital" hint="usd">
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-wire-500">$</span>
                <input
                  value={Number.isFinite(capital) ? String(capital) : ""}
                  disabled={isRunning}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setCapital(v ? Number(v) : 0);
                  }}
                  className="w-full bg-transparent font-mono text-sm font-semibold tabular-nums text-wire-100 outline-none"
                />
              </div>
            </Field>
            <div className="flex flex-col items-end gap-2">
              {isRunning ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-md border border-siren/70 bg-siren/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] text-siren transition hover:bg-siren hover:text-ink-950"
                >
                  stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={!canRun}
                  className={`rounded-md border px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.28em] transition active:translate-y-px ${
                    canRun
                      ? "border-brass/70 bg-brass/15 text-brass shadow-brass hover:bg-brass hover:text-ink-950"
                      : "cursor-not-allowed border-wire-800 text-wire-700"
                  }`}
                >
                  run backtest
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 lg:col-span-5">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  disabled={isRunning}
                  onClick={() => {
                    setStartDate(daysAgo(r.days));
                    setEndDate(daysAgo(1));
                  }}
                  className="rounded border border-wire-800 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-wire-500 transition hover:border-brass/50 hover:text-brass disabled:opacity-40"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {blockers.length > 0 && runState === "idle" ? (
            <ul className="rounded-md border border-wire-800/70 bg-ink-900/40 px-4 py-2 text-[11px] leading-relaxed text-wire-500">
              {blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : null}

          {/* Running progress */}
          {isRunning ? (
            <div className="rounded-md border border-phos/30 bg-phos/[0.04] px-4 py-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-phos/90">
                <span>simulating…</span>
                <span className="font-mono tabular-nums">
                  {tick ? `${tick.step}/${tick.total} · ${tick.date}` : "warming up"}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-phos transition-all duration-300"
                  style={{ width: `${Math.max(2, progressPct)}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-wire-600">
                Each trading day runs the full committee — local models on CPU can take a while.
              </p>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="rounded-md border border-siren/40 bg-siren/[0.06] px-4 py-2 text-[12px] text-siren/90">
              <span className="font-semibold uppercase tracking-[0.2em]">fault</span> // {errorMsg}
            </div>
          ) : null}

          {/* Metrics */}
          {days.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Metric
                label="final value"
                value={finalValue != null ? fmtUsd(finalValue) : "—"}
              />
              <Metric
                label="total return"
                value={fmtPct(totalReturnPct)}
                tone={
                  totalReturnPct == null
                    ? undefined
                    : totalReturnPct >= 0
                      ? "text-phos"
                      : "text-siren"
                }
              />
              <Metric label="sharpe" value={fmtNum(metrics?.sharpe_ratio)} />
              <Metric label="sortino" value={fmtNum(metrics?.sortino_ratio)} />
              <Metric
                label="max drawdown"
                value={fmtPct(metrics?.max_drawdown)}
                tone="text-siren"
              />
              <Metric
                label="net exposure"
                value={metrics?.net_exposure != null ? fmtUsd(metrics.net_exposure) : "—"}
              />
            </div>
          ) : null}

          {/* Equity curve */}
          {days.length > 1 ? (
            <EquityCurve days={days} baseline={capital} />
          ) : null}

          {/* Per-day table */}
          {days.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-wire-800/80">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-ink-900/70 text-left text-[9px] uppercase tracking-[0.18em] text-wire-500">
                    <th className="px-3 py-2 font-medium">date</th>
                    <th className="px-3 py-2 text-right font-medium">portfolio</th>
                    <th className="px-3 py-2 text-right font-medium">cash</th>
                    <th className="px-3 py-2 text-right font-medium">net exp.</th>
                    <th className="px-3 py-2 text-right font-medium">trades</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums text-wire-300">
                  {days
                    .slice()
                    .reverse()
                    .map((d) => {
                      const trades = Object.values(d.executed_trades || {}).filter(
                        (v) => v !== 0,
                      ).length;
                      return (
                        <tr key={d.date} className="border-t border-wire-900/70">
                          <td className="px-3 py-1.5 text-wire-200">{d.date}</td>
                          <td className="px-3 py-1.5 text-right">{fmtUsd(d.portfolio_value)}</td>
                          <td className="px-3 py-1.5 text-right text-wire-500">{fmtUsd(d.cash)}</td>
                          <td className="px-3 py-1.5 text-right text-wire-500">
                            {fmtUsd(d.net_exposure)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {trades > 0 ? (
                              <span className="text-brass">{trades}</span>
                            ) : (
                              <span className="text-wire-700">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : null}

          {days.length === 0 && !isRunning && !errorMsg ? (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-wire-800/70 px-4 py-12 text-center text-[12px] text-wire-600">
              Configure a date range and run a backtest to simulate the committee day&nbsp;by&nbsp;day.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EquityCurve({
  days,
  baseline,
}: {
  days: BacktestDayResult[];
  baseline: number;
}) {
  const W = 1000;
  const H = 220;
  const pad = 8;
  const values = days.map((d) => d.portfolio_value);
  const lo = Math.min(baseline, ...values);
  const hi = Math.max(baseline, ...values);
  const span = hi - lo || 1;
  const x = (i: number) =>
    pad + (i / Math.max(1, days.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - 2 * pad);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const baseY = y(baseline);
  const up = values[values.length - 1] >= baseline;
  const stroke = up ? "#39d98a" : "#ff5c5c";

  return (
    <div className="rounded-md border border-wire-800/80 bg-ink-900/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-wire-500">
        <span>equity curve</span>
        <span className="font-mono">
          {fmtUsd(lo)} – {fmtUsd(hi)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bt-eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline (initial capital) */}
        <line
          x1={pad}
          x2={W - pad}
          y1={baseY}
          y2={baseY}
          stroke="#6b7280"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />
        <path d={area} fill="url(#bt-eq-fill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-wire-600">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "text-wire-100",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-wire-800/80 bg-ink-900/50 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.2em] text-wire-600">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-wire-500">
          {label}
        </span>
        {hint ? (
          <span className="text-[9px] uppercase tracking-[0.18em] text-wire-600">{hint}</span>
        ) : null}
      </div>
      <div className="border-b border-wire-800 pb-1.5">{children}</div>
    </label>
  );
}
