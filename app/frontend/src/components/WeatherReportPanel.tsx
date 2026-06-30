import { useEffect, useMemo, useState } from "react";
import type { CompletePayload } from "../lib/types";
import {
  CONDITION_COPY,
  weatherForTicker,
  weatherPayloadTickers,
  type WeatherCondition,
} from "../lib/weatherReport";

interface Props {
  open: boolean;
  onClose: () => void;
  payload: CompletePayload | null;
}

const ACTION_CHIP: Record<string, string> = {
  buy: "border-phos/50 bg-phos/10 text-phos",
  cover: "border-phos/40 bg-phos/5 text-phos",
  sell: "border-siren/50 bg-siren/10 text-siren",
  short: "border-siren/40 bg-siren/10 text-siren",
  hold: "border-amber/40 bg-amber/10 text-amber",
};

export function WeatherReportPanel({ open, onClose, payload }: Props) {
  const tickers = useMemo(() => weatherPayloadTickers(payload), [payload]);
  const [ticker, setTicker] = useState(tickers[0] ?? "");

  useEffect(() => {
    if (tickers.length && !tickers.includes(ticker)) setTicker(tickers[0] ?? "");
  }, [tickers, ticker]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const report = weatherForTicker(payload, ticker);
  const condition = (report?.condition ?? "variable") as WeatherCondition;
  const copy = CONDITION_COPY[condition];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[52] flex animate-fade-in items-end justify-center bg-ink-950/75 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl animate-scale-in flex-col overflow-hidden rounded-xl border border-wire-800 bg-ink-950 shadow-float">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-wire-800 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brass">
              shift weather report
            </p>
            <p className="mt-0.5 text-[11px] text-wire-500">
              Post-shift committee climate — disputes, fragility, who carried the room
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-wire-700 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-wire-500 hover:border-brass/50 hover:text-brass"
          >
            esc
          </button>
        </header>

        {tickers.length > 1 ? (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-wire-900 px-3 py-2">
            {tickers.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTicker(t)}
                className={`shrink-0 rounded border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] ${
                  t === ticker
                    ? "border-brass/60 bg-brass/10 text-brass"
                    : "border-wire-800 text-wire-500 hover:text-wire-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        {!report ? (
          <div className="p-6 text-[12px] text-wire-500">No weather data for this shift.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-3xl ${copy.tone}`}>{copy.emoji}</p>
                <h2 className="mt-1 font-mono text-lg font-semibold tracking-[0.08em] text-wire-100">
                  {ticker} · {copy.label}
                </h2>
                <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-wire-400">
                  {report.headline}
                </p>
              </div>
              {report.boss_action ? (
                <span
                  className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    ACTION_CHIP[report.boss_action] ?? "border-wire-700 text-wire-400"
                  }`}
                >
                  boss · {report.boss_action}
                  {report.boss_confidence != null ? ` ${report.boss_confidence}%` : ""}
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Bulls" value={String(report.tally.bullish)} tone="text-phos" />
              <MetricCard label="Bears" value={String(report.tally.bearish)} tone="text-siren" />
              <MetricCard
                label="Fragility"
                value={`${report.fragility}%`}
                sub={report.fragility_label}
                tone="text-amber"
              />
            </div>

            {report.dominant_claim ? (
              <section className="mt-5 rounded-lg border border-wire-800 bg-ink-900/60 p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brass">
                  dominant narrative
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-wire-300">{report.dominant_claim}</p>
              </section>
            ) : null}

            {report.carried_by.length > 0 ? (
              <section className="mt-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-wire-500">
                  carried by
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {report.carried_by.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-center justify-between rounded border border-wire-900 bg-ink-900/40 px-3 py-2 font-mono text-[11px]"
                    >
                      <span className="text-wire-200">{row.name}</span>
                      <span className="text-wire-500">
                        {row.signal} · {Math.round(row.confidence)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {report.top_disputes.length > 0 ? (
              <section className="mt-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-wire-500">
                  live disputes
                </h3>
                <ul className="mt-2 space-y-2">
                  {report.top_disputes.map((d, i) => (
                    <li
                      key={i}
                      className="rounded border border-siren/20 bg-siren/5 px-3 py-2 text-[12px] leading-relaxed text-wire-300"
                    >
                      {d.summary || "Unresolved thesis conflict"}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {report.key_risk ? (
              <section className="mt-4 rounded-lg border border-amber/25 bg-amber/5 p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber">
                  risk watch
                </h3>
                <p className="mt-2 text-[12px] text-wire-300">{report.key_risk}</p>
              </section>
            ) : null}

            <p className="mt-5 text-[10px] text-wire-600">
              {report.voice_count} committee voices synthesized · agent scorecard deferred until auth
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-wire-800 bg-ink-900/50 px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[0.22em] text-wire-600">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-wire-500">{sub}</p> : null}
    </div>
  );
}
