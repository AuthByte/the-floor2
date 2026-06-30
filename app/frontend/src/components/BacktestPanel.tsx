import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { runBacktest } from "../lib/api";
import {
  computeDrawdownSeries,
  defaultBacktestDates,
  formatBacktestPct,
  formatUsd,
  mergeChartSeries,
  polylinePoints,
  type BacktestCompletePayload,
  type BacktestDayResult,
} from "../lib/backtest";
import { buildBacktestGraph } from "../lib/backtestGraph";
import { PROVIDER } from "../lib/models";
import { parseWatchlistInput } from "../lib/tickerInput";
import { WATCHLIST_PRESETS } from "../lib/watchlists";
import type { BacktestRequest } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tickers: string;
  model: string;
  openrouterKey: string;
  enabledAnalystKeys: Set<string>;
  enabledAnalystCount: number;
  initialCapital?: number;
}

type Phase = "setup" | "running" | "results";

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

export function BacktestPanel({
  open,
  onClose,
  tickers: tickersProp,
  model,
  openrouterKey,
  enabledAnalystKeys,
  enabledAnalystCount,
  initialCapital = 100_000,
}: Props) {
  const defaults = useMemo(() => defaultBacktestDates(), []);
  const [phase, setPhase] = useState<Phase>("setup");
  const [tickers, setTickers] = useState(tickersProp);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [capital, setCapital] = useState(initialCapital);
  const [progress, setProgress] = useState(0);
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestCompletePayload | null>(null);
  const [liveCurve, setLiveCurve] = useState<{ date: string; portfolio_value: number }[]>([]);
  const [selectedDay, setSelectedDay] = useState<BacktestDayResult | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [playing, setPlaying] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const playIdxRef = useRef(0);

  useEffect(() => {
    if (open) setTickers(tickersProp);
  }, [open, tickersProp]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.();
      abortRef.current = null;
      setPhase("setup");
      setProgress(0);
      setStatusLine("");
      setError(null);
      setResult(null);
      setLiveCurve([]);
      setSelectedDay(null);
      setPlaying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tickerList = useMemo(() => parseWatchlistInput(tickers).tickers, [tickers]);
  const canRun =
    tickerList.length > 0 &&
    openrouterKey.trim().length > 0 &&
    enabledAnalystCount > 0 &&
    startDate < endDate;

  const runBlockers = useMemo(() => {
    if (canRun) return [];
    const blockers: string[] = [];
    if (!tickerList.length) blockers.push("Enter at least one ticker symbol");
    if (!openrouterKey.trim()) blockers.push("Add your OpenRouter key in account settings");
    if (enabledAnalystCount === 0) blockers.push("Enable at least one analyst in Manage Roster");
    if (startDate >= endDate) blockers.push("End date must be after start date");
    return blockers;
  }, [canRun, tickerList.length, openrouterKey, enabledAnalystCount, startDate, endDate]);

  const handleRun = useCallback(() => {
    if (!canRun) return;
    abortRef.current?.();
    setPhase("running");
    setProgress(0);
    setError(null);
    setResult(null);
    setLiveCurve([]);
    setSelectedDay(null);
    setStatusLine("prefetching market data…");

    const { nodes, edges } = buildBacktestGraph(enabledAnalystKeys);
    const req: BacktestRequest = {
      tickers: tickerList,
      graph_nodes: nodes,
      graph_edges: edges,
      model_name: model,
      model_provider: PROVIDER,
      initial_capital: capital,
      margin_requirement: 0,
      start_date: startDate,
      end_date: endDate,
      api_keys: openrouterKey.trim()
        ? { OPENROUTER_API_KEY: openrouterKey.trim() }
        : undefined,
    };

    abortRef.current = runBacktest(req, {
      onStart: () => setStatusLine("committee convened — simulating trading days…"),
      onProgress: (e) => {
        if (e.dayResult) {
          setLiveCurve((prev) => [
            ...prev,
            { date: e.dayResult!.date, portfolio_value: e.dayResult!.portfolio_value },
          ]);
          setSelectedDay(e.dayResult);
        }
        if (e.progress > 0) setProgress(Math.min(1, e.progress));
        if (e.status) setStatusLine(e.status);
      },
      onComplete: (data) => {
        setResult(data);
        setPhase("results");
        setProgress(1);
        if (data.daily_results?.length) {
          setSelectedDay(data.daily_results[data.daily_results.length - 1]);
        }
        abortRef.current = null;
      },
      onError: (msg) => {
        setError(msg);
        setPhase("setup");
        abortRef.current = null;
      },
    });
  }, [
    canRun,
    capital,
    enabledAnalystKeys,
    endDate,
    model,
    openrouterKey,
    startDate,
    tickerList,
  ]);

  const curve = result?.portfolio_curve ?? liveCurve.map((p) => ({
    date: p.date,
    portfolio_value: p.portfolio_value,
  }));
  const chart = useMemo(
    () => mergeChartSeries(curve, result?.benchmark?.spy_curve ?? []),
    [curve, result?.benchmark?.spy_curve],
  );
  const drawdown = useMemo(() => computeDrawdownSeries(curve), [curve]);

  const metrics = result?.performance_metrics;
  const bench = result?.benchmark;

  // Playback through daily results for scrubbing agent opinions
  const dailyResults = result?.daily_results ?? [];
  useEffect(() => {
    if (!playing || !dailyResults.length) return;
    const ms = 800 / playbackSpeed;
    const id = window.setInterval(() => {
      playIdxRef.current = (playIdxRef.current + 1) % dailyResults.length;
      setSelectedDay(dailyResults[playIdxRef.current]);
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, dailyResults, playbackSpeed]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-stretch justify-center bg-ink-950/80 p-0 backdrop-blur-[4px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-5xl animate-scale-in flex-col overflow-hidden border border-brass/25 bg-ink-950 shadow-float sm:my-auto sm:max-h-[94vh] sm:rounded-lg"
        role="dialog"
        aria-labelledby="backtest-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/60 via-phos/25 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                historical simulation
              </p>
              <h2
                id="backtest-title"
                className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100"
              >
                Committee Backtest
              </h2>
              <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-wire-500">
                Replay your roster&apos;s agent opinions day-by-day — equity curve, drawdown, and
                SPY benchmark.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>
        </header>

        {phase === "setup" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="tickers">
                <input
                  value={tickers}
                  onChange={(e) => setTickers(e.target.value)}
                  placeholder="AAPL, MSFT, NVDA"
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-sm text-wire-100 outline-none focus:border-brass/50"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {WATCHLIST_PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTickers(p.tickers)}
                      className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-wire-500 hover:border-brass/40 hover:text-brass"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="initial capital">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value) || 100_000)}
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-sm text-wire-100 outline-none focus:border-brass/50"
                />
              </Field>

              <Field label="start date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-sm text-wire-100 outline-none focus:border-brass/50"
                />
              </Field>

              <Field label="end date">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-sm text-wire-100 outline-none focus:border-brass/50"
                />
              </Field>
            </div>

            <div className="mt-5 rounded border border-wire-800/80 bg-ink-900/40 px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                committee
              </p>
              <p className="mt-1 text-sm text-wire-200">
                <span className="font-mono text-brass">{enabledAnalystCount}</span> agents from
                your roster · model{" "}
                <span className="font-mono text-wire-400">{model.split("/").pop()}</span>
              </p>
              <p className="mt-2 text-[10px] text-wire-500">
                Each business day the committee re-runs with that day&apos;s data window. LLM-heavy
                — expect several minutes for a full month.
              </p>
            </div>

            {error ? (
              <p className="mt-4 rounded border border-siren/40 bg-siren/10 px-3 py-2 text-[11px] text-siren">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={!canRun}
                onClick={handleRun}
                className="self-start rounded border border-phos/40 bg-phos/10 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-phos transition hover:bg-phos/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                run backtest
              </button>
              {runBlockers.length > 0 ? (
                <ul className="space-y-1 text-[10px] text-wire-500">
                  {runBlockers.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span className="text-siren">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-wire-600">
                  No prior shift required — this simulates your committee on historical tape.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {phase === "running" ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-[10px] text-wire-400">{statusLine}</p>
              <span className="font-mono text-[10px] tabular-nums text-brass">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-wire-900">
              <div
                className="h-full bg-gradient-to-r from-brass/80 to-phos/70 transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            {liveCurve.length > 1 ? (
              <div className="mt-6">
                <EquityChart
                  dates={liveCurve.map((p) => p.date)}
                  portfolio={liveCurve.map((p) => p.portfolio_value)}
                  spy={[]}
                  compact
                />
              </div>
            ) : (
              <p className="mt-8 text-center text-[11px] text-wire-600">
                Agents are debating historical tape…
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                abortRef.current?.();
                setPhase("setup");
              }}
              className="mt-auto self-start rounded border border-wire-800 px-3 py-1.5 font-mono text-[10px] text-wire-500 hover:text-siren"
            >
              cancel
            </button>
          </div>
        ) : null}

        {phase === "results" && result ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-wire-900 px-5 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <MetricCard
                  label="portfolio"
                  value={formatBacktestPct(bench?.portfolio_return_pct)}
                  accent={
                    (bench?.portfolio_return_pct ?? 0) >= 0 ? "text-phos" : "text-siren"
                  }
                />
                <MetricCard label="vs SPY" value={formatBacktestPct(bench?.spy_return_pct)} />
                <MetricCard
                  label="max DD"
                  value={formatBacktestPct(metrics?.max_drawdown)}
                  accent="text-siren"
                />
                <MetricCard
                  label="sharpe"
                  value={metrics?.sharpe_ratio?.toFixed(2) ?? "—"}
                />
                <MetricCard
                  label="sortino"
                  value={metrics?.sortino_ratio?.toFixed(2) ?? "—"}
                />
                <MetricCard label="days" value={String(result.total_days)} />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded border border-wire-800/80 bg-ink-900/30 p-3">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                    equity curve vs SPY
                  </p>
                  <EquityChart
                    dates={chart.dates}
                    portfolio={chart.portfolio}
                    spy={chart.spy}
                  />
                  <div className="mt-2 flex gap-4 font-mono text-[9px] text-wire-500">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-phos" /> committee
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-wire-500" /> SPY B&H
                    </span>
                  </div>
                </div>

                <div className="rounded border border-wire-800/80 bg-ink-900/30 p-3">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                    drawdown
                  </p>
                  <DrawdownChart points={drawdown} />
                </div>
              </div>

              {dailyResults.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="rounded border border-phos/40 bg-phos/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-phos"
                  >
                    {playing ? "pause" : "play"} days
                  </button>
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPlaybackSpeed(s)}
                      className={`rounded border px-2 py-1 font-mono text-[9px] ${
                        playbackSpeed === s
                          ? "border-brass/50 text-brass"
                          : "border-wire-800 text-wire-500"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, dailyResults.length - 1)}
                    value={Math.max(
                      0,
                      dailyResults.findIndex((d) => d.date === selectedDay?.date),
                    )}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      playIdxRef.current = idx;
                      setSelectedDay(dailyResults[idx] ?? null);
                      setPlaying(false);
                    }}
                    className="ml-auto min-w-[120px] flex-1 accent-[rgb(var(--brass))] sm:max-w-xs"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_280px]">
              <DayDetail day={selectedDay} />
              <DayList
                days={dailyResults}
                selectedDate={selectedDay?.date}
                onSelect={(d) => {
                  setSelectedDay(d);
                  setPlaying(false);
                  playIdxRef.current = dailyResults.findIndex((x) => x.date === d.date);
                }}
              />
            </div>

            <footer className="shrink-0 border-t border-wire-900 px-5 py-3">
              <p className="font-mono text-[9px] text-wire-600">
                Final NAV {formatUsd(curve[curve.length - 1]?.portfolio_value)} ·{" "}
                {tickerList.join(", ")} · {startDate} → {endDate}
              </p>
            </footer>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-wire-600">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function MetricCard({
  label,
  value,
  accent = "text-wire-100",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-wire-800/60 bg-ink-900/50 px-3 py-2">
      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-wire-600">{label}</p>
      <p className={`mt-0.5 font-mono text-lg tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

function EquityChart({
  dates,
  portfolio,
  spy,
  compact,
}: {
  dates: string[];
  portfolio: number[];
  spy: number[];
  compact?: boolean;
}) {
  const w = 480;
  const h = compact ? 100 : 160;
  const portPts = polylinePoints(portfolio, w, h);
  const spyPts = spy.some((v) => Number.isFinite(v)) ? polylinePoints(spy, w, h) : "";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke="#2a2f3a" strokeWidth={0.5} />
      {spyPts ? (
        <polyline
          points={spyPts}
          fill="none"
          stroke="#6b7280"
          strokeWidth={1.5}
          strokeOpacity={0.7}
          strokeDasharray="4 3"
        />
      ) : null}
      {portPts ? (
        <polyline points={portPts} fill="none" stroke="#2fd08a" strokeWidth={2} />
      ) : null}
      {!compact && dates.length > 0 ? (
        <>
          <text x={4} y={12} fill="#6b7280" fontSize={8} fontFamily="monospace">
            {dates[0]}
          </text>
          <text x={w - 4} y={12} fill="#6b7280" fontSize={8} fontFamily="monospace" textAnchor="end">
            {dates[dates.length - 1]}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function DrawdownChart({ points }: { points: { date: string; drawdown_pct: number }[] }) {
  const w = 480;
  const h = 120;
  const values = points.map((p) => p.drawdown_pct);
  const pts = polylinePoints(values, w, h);
  const min = Math.min(...values, 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <line x1={0} y1={4} x2={w} y2={4} stroke="#2a2f3a" strokeWidth={0.5} />
      {pts ? (
        <polyline points={pts} fill="none" stroke="#e85d4a" strokeWidth={1.5} />
      ) : null}
      <text x={4} y={h - 4} fill="#6b7280" fontSize={8} fontFamily="monospace">
        {min.toFixed(1)}%
      </text>
    </svg>
  );
}

function DayList({
  days,
  selectedDate,
  onSelect,
}: {
  days: BacktestDayResult[];
  selectedDate?: string;
  onSelect: (d: BacktestDayResult) => void;
}) {
  return (
    <div className="min-h-0 overflow-y-auto border-t border-wire-900 lg:border-l lg:border-t-0">
      <p className="sticky top-0 border-b border-wire-900 bg-ink-950 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
        trading days
      </p>
      <ul className="font-mono text-[9px]">
        {[...days].reverse().map((d) => (
          <li key={d.date}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-ink-900/60 ${
                d.date === selectedDate ? "bg-brass/10 text-brass" : "text-wire-400"
              }`}
            >
              <span>{d.date}</span>
              <span className="tabular-nums text-wire-500">
                {formatUsd(d.portfolio_value)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayDetail({ day }: { day: BacktestDayResult | null }) {
  if (!day) {
    return (
      <div className="flex items-center justify-center p-6 text-[11px] text-wire-600">
        Select a trading day to inspect agent opinions
      </div>
    );
  }

  const tickers = Object.keys(day.current_prices ?? {});

  return (
    <div className="min-h-0 overflow-y-auto border-t border-wire-900 p-4 lg:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-sm text-wire-100">{day.date}</h3>
        <span className="font-mono text-[10px] text-brass">{formatUsd(day.portfolio_value)}</span>
      </div>

      <div className="mt-4 space-y-4">
        {tickers.map((ticker) => {
          const price = day.current_prices[ticker];
          const decision = day.decisions[ticker];
          const trades = day.executed_trades[ticker];
          const signals = day.analyst_signals ?? {};

          return (
            <section
              key={ticker}
              className="rounded border border-wire-800/80 bg-ink-900/40 px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-wire-100">{ticker}</span>
                <span className="font-mono text-[9px] text-wire-500">${price?.toFixed(2)}</span>
                {decision?.action ? (
                  <span className="rounded border border-wire-700 px-1.5 py-0.5 font-mono text-[8px] uppercase text-wire-400">
                    PM {decision.action}
                    {trades ? ` · ${trades} sh` : ""}
                  </span>
                ) : null}
              </div>

              <table className="mt-2 w-full border-collapse font-mono text-[9px]">
                <thead>
                  <tr className="text-left text-wire-600">
                    <th className="pb-1 pr-2 font-normal">agent</th>
                    <th className="pb-1 pr-2 font-normal">signal</th>
                    <th className="pb-1 pr-2 font-normal">conf</th>
                    <th className="pb-1 font-normal">1Y PT</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(signals).map(([agentId, byTicker]) => {
                    const sig = (byTicker as Record<string, Record<string, unknown>>)[ticker];
                    if (!sig) return null;
                    const pt = sig.price_target as number | undefined;
                    const conf = sig.confidence as number | undefined;
                    const signal = String(sig.signal ?? "—");
                    const name = agentId.replace(/_r0floor$/, "").replace(/_/g, " ");
                    return (
                      <tr key={agentId} className="border-t border-wire-900/80 text-wire-400">
                        <td className="py-1 pr-2 capitalize text-wire-300">{name}</td>
                        <td
                          className={`py-1 pr-2 ${
                            signal === "bullish"
                              ? "text-phos"
                              : signal === "bearish"
                                ? "text-siren"
                                : ""
                          }`}
                        >
                          {signal}
                        </td>
                        <td className="py-1 pr-2 tabular-nums">{conf ?? "—"}%</td>
                        <td className="py-1 tabular-nums text-brass">
                          {pt != null ? `$${Number(pt).toFixed(0)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
