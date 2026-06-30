import { useCallback, useEffect, useMemo, useState } from "react";



import { fetchAlpacaPortfolio } from "../lib/api";

import type { PaperAccountSnapshot, PaperOrder, PaperPosition } from "../lib/types";



interface Props {

  open: boolean;

  onClose: () => void;

  apiKeys?: Record<string, string>;

  lastShiftSymbols?: string[];

  onOpenSettings?: () => void;

}



function fmtUsd(v: number | null | undefined): string {

  if (v == null || Number.isNaN(v)) return "—";

  return v.toLocaleString(undefined, {

    style: "currency",

    currency: "USD",

    maximumFractionDigits: 0,

  });

}



function fmtPct(v: number | null | undefined): string {

  if (v == null || Number.isNaN(v)) return "—";

  return `${(v * 100).toFixed(2)}%`;

}



function parsePortfolioError(err: unknown): { message: string; kind: "config" | "api" | "unknown" } {

  const message = err instanceof Error ? err.message : "Failed to load portfolio";

  const lower = message.toLowerCase();

  if (lower.includes("503") || lower.includes("not configured")) {

    return { message, kind: "config" };

  }

  if (lower.includes("502") || lower.includes("alpaca api")) {

    return { message, kind: "api" };

  }

  return { message, kind: "unknown" };

}



export function AlpacaPortfolioPanel({

  open,

  onClose,

  apiKeys,

  lastShiftSymbols = [],

  onOpenSettings,

}: Props) {

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<{ message: string; kind: "config" | "api" | "unknown" } | null>(

    null,

  );

  const [account, setAccount] = useState<PaperAccountSnapshot | null>(null);

  const [positions, setPositions] = useState<PaperPosition[]>([]);

  const [orders, setOrders] = useState<PaperOrder[]>([]);

  const [lastUpdated, setLastUpdated] = useState<number | null>(null);



  const highlightSet = useMemo(

    () => new Set(lastShiftSymbols.map((s) => s.toUpperCase())),

    [lastShiftSymbols],

  );



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const data = await fetchAlpacaPortfolio(apiKeys);

      setAccount(data.account);

      setPositions(data.positions ?? []);

      setOrders(data.orders ?? []);

      setLastUpdated(Date.now());

    } catch (e) {

      setError(parsePortfolioError(e));

    } finally {

      setLoading(false);

    }

  }, [apiKeys]);



  useEffect(() => {

    if (!open) return;

    void load();

  }, [open, load]);



  useEffect(() => {

    if (!open) return;

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "Escape") onClose();

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [open, onClose]);



  if (!open) return null;



  const dayPnl =

    account?.equity != null && account?.last_equity != null

      ? account.equity - account.last_equity

      : null;



  return (

    <div

      className="fixed inset-0 z-[48] flex animate-fade-in items-stretch justify-center bg-ink-950/70 p-0 backdrop-blur-[3px] sm:p-4"

      role="presentation"

      onMouseDown={onClose}

    >

      <div

        className="relative flex h-full w-full max-w-3xl animate-scale-in flex-col overflow-hidden border border-brass/20 bg-ink-950 shadow-float sm:my-auto sm:max-h-[92vh] sm:rounded-lg"

        role="dialog"

        aria-labelledby="alpaca-portfolio-title"

        onMouseDown={(e) => e.stopPropagation()}

      >

        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">

          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/60 via-phos/30 to-transparent" />

          <div className="flex flex-wrap items-start justify-between gap-3">

            <div>

              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">

                paper desk

              </p>

              <h2

                id="alpaca-portfolio-title"

                className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100"

              >

                Alpaca Portfolio

              </h2>

              <p className="mt-1 text-[11px] text-wire-500">

                Simulated execution via Alpaca paper. THE FLOOR does not provide investment advice.

              </p>

              {lastUpdated ? (

                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">

                  Updated{" "}

                  {new Date(lastUpdated).toLocaleTimeString(undefined, {

                    hour: "2-digit",

                    minute: "2-digit",

                    second: "2-digit",

                  })}

                </p>

              ) : null}

            </div>

            <div className="flex shrink-0 gap-2">

              <button

                type="button"

                onClick={() => void load()}

                disabled={loading}

                className="rounded border border-wire-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass disabled:opacity-40"

              >

                refresh

              </button>

              <button

                type="button"

                onClick={onClose}

                className="rounded border border-wire-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"

              >

                esc

              </button>

            </div>

          </div>

        </header>



        <div className="min-h-0 flex-1 overflow-y-auto p-4">

          {loading && !account ? (

            <p className="py-8 text-center font-mono text-[11px] text-wire-500">

              Pulling paper account…

            </p>

          ) : null}



          {error ? (

            <div

              className={`rounded border px-4 py-3 text-[11px] ${

                error.kind === "config"

                  ? "border-amber/40 bg-amber/5 text-amber"

                  : "border-siren/40 bg-siren/5 text-siren"

              }`}

            >

              <p>{error.message}</p>

              {error.kind === "config" ? (

                <div className="mt-2 space-y-1 text-[10px] text-wire-500">

                  <p>

                    Add Alpaca <span className="text-phos">paper</span> keys in account settings, or

                    set server <code className="text-wire-400">.env</code> for demos.

                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">

                    {onOpenSettings ? (

                      <button

                        type="button"

                        onClick={onOpenSettings}

                        className="text-brass underline decoration-brass/30 underline-offset-2 hover:text-brass/80"

                      >

                        Open account settings

                      </button>

                    ) : null}

                    <a

                      href="https://alpaca.markets/"

                      target="_blank"

                      rel="noopener noreferrer"

                      className="text-brass/80 underline decoration-brass/30 underline-offset-2 hover:text-brass"

                    >

                      Alpaca paper signup

                    </a>

                  </div>

                </div>

              ) : error.kind === "api" ? (

                <p className="mt-2 text-[10px] text-wire-500">

                  Alpaca paper API unreachable — try again shortly.

                </p>

              ) : null}

            </div>

          ) : null}



          {!loading && !error && !account ? (

            <div className="rounded border border-wire-800 bg-ink-900/30 px-4 py-6 text-center">

              <p className="text-[12px] text-wire-400">No paper account data yet.</p>

              <p className="mt-2 text-[10px] text-wire-600">

                Enable paper execute on the boss memo after a shift, or connect Alpaca paper keys.

              </p>

              {onOpenSettings ? (

                <button

                  type="button"

                  onClick={onOpenSettings}

                  className="mt-3 text-[10px] text-brass underline decoration-brass/30 underline-offset-2"

                >

                  Account settings

                </button>

              ) : null}

            </div>

          ) : null}



          {account ? (

            <div className="space-y-5">

              <div className="grid gap-3 sm:grid-cols-4">

                <StatCard label="Equity" value={fmtUsd(account.equity)} />

                <StatCard label="Day P/L" value={fmtUsd(dayPnl)} />

                <StatCard label="Cash" value={fmtUsd(account.cash)} />

                <StatCard label="Buying power" value={fmtUsd(account.buying_power)} />

              </div>



              {highlightSet.size > 0 ? (

                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-phos/80">

                  Highlighted: positions from last executed shift

                </p>

              ) : null}



              <section>

                <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                  Positions

                </h3>

                {positions.length === 0 ? (

                  <p className="text-[11px] text-wire-500">No open positions.</p>

                ) : (

                  <div className="overflow-x-auto rounded border border-wire-800">

                    <table className="w-full min-w-[480px] text-left font-mono text-[10px]">

                      <thead className="border-b border-wire-800 bg-ink-900/60 text-wire-500">

                        <tr>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Symbol</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Qty</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Side</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Mkt val</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">P/L</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">P/L %</th>

                        </tr>

                      </thead>

                      <tbody className="divide-y divide-wire-900">

                        {positions.map((p) => {

                          const sym = p.symbol?.toUpperCase() ?? "";

                          const highlighted = highlightSet.has(sym);

                          return (

                            <tr

                              key={p.symbol}

                              className={`text-wire-300 ${

                                highlighted ? "bg-phos/10 ring-1 ring-inset ring-phos/30" : ""

                              }`}

                            >

                              <td className="px-3 py-2 text-brass">

                                {p.symbol}

                                {highlighted ? (

                                  <span className="ml-1.5 text-[8px] uppercase tracking-wider text-phos">

                                    shift

                                  </span>

                                ) : null}

                              </td>

                              <td className="px-3 py-2">{p.qty ?? "—"}</td>

                              <td className="px-3 py-2 uppercase">{p.side ?? "—"}</td>

                              <td className="px-3 py-2">{fmtUsd(p.market_value)}</td>

                              <td

                                className={`px-3 py-2 ${

                                  (p.unrealized_pl ?? 0) >= 0 ? "text-phos" : "text-siren"

                                }`}

                              >

                                {fmtUsd(p.unrealized_pl)}

                              </td>

                              <td className="px-3 py-2">{fmtPct(p.unrealized_plpc)}</td>

                            </tr>

                          );

                        })}

                      </tbody>

                    </table>

                  </div>

                )}

              </section>



              <section>

                <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                  Recent orders

                </h3>

                {orders.length === 0 ? (

                  <p className="text-[11px] text-wire-500">No recent orders.</p>

                ) : (

                  <div className="overflow-x-auto rounded border border-wire-800">

                    <table className="w-full min-w-[520px] text-left font-mono text-[10px]">

                      <thead className="border-b border-wire-800 bg-ink-900/60 text-wire-500">

                        <tr>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Time</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Symbol</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Side</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Qty</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Status</th>

                          <th className="px-3 py-2 font-normal uppercase tracking-wider">Type</th>

                        </tr>

                      </thead>

                      <tbody className="divide-y divide-wire-900">

                        {orders.map((o) => {

                          const sym = o.symbol?.toUpperCase() ?? "";

                          const highlighted = highlightSet.has(sym);

                          return (

                            <tr

                              key={o.id ?? `${o.symbol}-${o.submitted_at}`}

                              className={`text-wire-300 ${

                                highlighted ? "bg-phos/10 ring-1 ring-inset ring-phos/30" : ""

                              }`}

                            >

                              <td className="px-3 py-2 text-wire-500">

                                {o.submitted_at

                                  ? new Date(o.submitted_at).toLocaleString(undefined, {

                                      month: "short",

                                      day: "numeric",

                                      hour: "2-digit",

                                      minute: "2-digit",

                                    })

                                  : "—"}

                              </td>

                              <td className="px-3 py-2 text-brass">{o.symbol}</td>

                              <td className="px-3 py-2 uppercase">{o.side}</td>

                              <td className="px-3 py-2">{o.filled_qty ?? o.qty ?? "—"}</td>

                              <td className="px-3 py-2 uppercase">{o.status}</td>

                              <td className="px-3 py-2 uppercase">{o.type}</td>

                            </tr>

                          );

                        })}

                      </tbody>

                    </table>

                  </div>

                )}

              </section>

            </div>

          ) : null}

        </div>

      </div>

    </div>

  );

}



function StatCard({ label, value }: { label: string; value: string }) {

  return (

    <div className="rounded border border-wire-800 bg-ink-900/40 px-4 py-3">

      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">{label}</div>

      <div className="mt-1 font-mono text-base text-wire-100">{value}</div>

    </div>

  );

}


