import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import { ArtifactGallery } from "./analysis/ArtifactGallery";
import { fetchFeed } from "../lib/floorSocial/api";
import { addShadowComment } from "../lib/floorSocial/apiExtended";
import type { FloorPost } from "../lib/floorSocial/types";
import { getSupabase } from "../lib/supabase";
import type { CompletePayload } from "../lib/types";
import {
  applyShadowPreset,
  buildShadowArtifacts,
  computeShadowVerdict,
  defaultEnabledMap,
  listShadowAgents,
  SHADOW_PRESETS,
  shadowPayloadTickers,
  type WeightMode,
} from "../lib/shadowBench";
import {
  buildForkSnapshot,
  diffForkOpinions,
  saveForkLocal,
  type ForkDiffRow,
} from "../lib/shiftFork";
import {
  PublishForkModal,
  type ShadowBenchShiftContext,
} from "./social/PublishForkModal";

interface Props {
  open: boolean;
  onClose: () => void;
  payload: CompletePayload | null;
  shiftContext?: ShadowBenchShiftContext;
  onForkPublished?: (post: FloorPost) => void;
}

const ACTION_CHIP: Record<string, string> = {
  buy: "border-phos/50 bg-phos/10 text-phos",
  cover: "border-phos/40 bg-phos/5 text-phos",
  sell: "border-siren/50 bg-siren/10 text-siren",
  short: "border-siren/40 bg-siren/10 text-siren",
  hold: "border-amber/40 bg-amber/10 text-amber",
};

const SIGNAL_DOT: Record<string, string> = {
  bullish: "bg-phos shadow-[0_0_8px_rgb(var(--phos)/0.55)]",
  bearish: "bg-siren shadow-[0_0_8px_rgb(var(--siren)/0.55)]",
  neutral: "bg-wire-500",
};

const TIER_LABEL = {
  legend: "Legend",
  specialist: "Specialist",
  quant: "Quant",
  data: "Data feed",
} as const;

export function ShadowBenchPanel({ open, onClose, payload, shiftContext, onForkPublished }: Props) {
  const tickers = useMemo(() => shadowPayloadTickers(payload), [payload]);
  const [ticker, setTicker] = useState(tickers[0] ?? "");
  const [weightMode, setWeightMode] = useState<WeightMode>("confidence");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [preset, setPreset] = useState("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [publishForkOpen, setPublishForkOpen] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    if (!open || !payload || !ticker) return;
    setEnabled(defaultEnabledMap(ticker, payload.analyst_signals ?? {}));
    setPreset("all");
  }, [open, payload, ticker]);

  useEffect(() => {
    if (tickers.length && !tickers.includes(ticker)) {
      setTicker(tickers[0]);
    }
  }, [tickers, ticker]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const signals = payload?.analyst_signals ?? {};
  const agents = useMemo(
    () => (ticker ? listShadowAgents(ticker, signals, enabled) : []),
    [ticker, signals, enabled],
  );

  const bossDecision = ticker ? payload?.decisions?.[ticker] : null;
  const refPrice = ticker ? payload?.current_prices?.[ticker] : undefined;

  const verdict = useMemo(() => {
    if (!ticker) return null;
    return computeShadowVerdict(ticker, signals, enabled, weightMode, bossDecision);
  }, [ticker, signals, enabled, weightMode, bossDecision]);

  const artifacts = useMemo(() => {
    if (!ticker || !verdict) return [];
    return buildShadowArtifacts(ticker, verdict, refPrice);
  }, [ticker, verdict, refPrice]);

  const forkDiff = useMemo((): ForkDiffRow[] => {
    if (!ticker || !payload || !verdict) return [];
    const baselineEnabled = defaultEnabledMap(ticker, signals);
    const baselineVerdict = computeShadowVerdict(
      ticker,
      signals,
      baselineEnabled,
      weightMode,
      bossDecision,
    );
    if (!baselineVerdict) return [];
    return diffForkOpinions(baselineVerdict.opinions, verdict.opinions);
  }, [ticker, payload, signals, weightMode, bossDecision, verdict]);

  const handleSaveFork = () => {
    if (!ticker || !payload || !verdict) return;
    const enabledKeys = agents.filter((a) => enabled[a.key]).map((a) => a.key);
    const fork = buildForkSnapshot({
      ticker,
      label: `${preset} fork · ${ticker}`,
      enabledAgents: enabledKeys,
      weightMode,
      preset,
      payload,
    });
    saveForkLocal(fork);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[45] flex animate-fade-in items-stretch justify-center bg-ink-950/70 p-0 backdrop-blur-[3px] sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-5xl animate-scale-in flex-col overflow-hidden border border-brass/20 bg-ink-950 shadow-float sm:my-auto sm:max-h-[92vh] sm:rounded-lg"
        role="dialog"
        aria-labelledby="shadow-bench-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/60 via-phos/30 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                counterfactual engine
              </p>
              <h2
                id="shadow-bench-title"
                className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100"
              >
                Shadow Bench
              </h2>
              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-wire-500">
                Mute any desk and watch the committee verdict recompute instantly — no
                re-run, no API calls. Find who actually carries the decision.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>

          {tickers.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tickers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTicker(t)}
                  className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                    ticker === t
                      ? "border-brass/50 bg-brass/10 text-brass"
                      : "border-wire-800 text-wire-500 hover:border-wire-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {!payload || !ticker ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-[12px] text-wire-500">
            Complete a shift first — Shadow Bench needs the committee&apos;s signals in memory.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="min-h-0 overflow-y-auto border-b border-wire-900 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SHADOW_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.description}
                    onClick={() => {
                      setPreset(p.id);
                      setEnabled(applyShadowPreset(p.id, ticker, signals));
                    }}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                      preset === p.id
                        ? "border-phos/40 bg-phos/10 text-phos"
                        : "border-wire-800 text-wire-500 hover:border-wire-600 hover:text-wire-300"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
                  weighting
                </span>
                {(["confidence", "equal"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWeightMode(m)}
                    className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                      weightMode === m
                        ? "border-brass/50 text-brass"
                        : "border-wire-800 text-wire-500"
                    }`}
                  >
                    {m === "confidence" ? "by confidence" : "one vote each"}
                  </button>
                ))}
              </div>

              <ConvictionConstellation agents={agents} />

              <ul className="mt-4 space-y-1">
                {agents.map((a) => (
                  <li key={a.key}>
                    <label className="flex cursor-pointer items-center gap-3 rounded border border-transparent px-2 py-1.5 transition hover:border-wire-800/80 hover:bg-ink-900/50">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={() =>
                          setEnabled((prev) => ({ ...prev, [a.key]: !prev[a.key] }))
                        }
                        className="accent-[rgb(var(--phos))]"
                      />
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${SIGNAL_DOT[a.signal] ?? SIGNAL_DOT.neutral} ${
                          a.enabled ? "opacity-100" : "opacity-25"
                        }`}
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-[11px] ${
                          a.enabled ? "text-wire-200" : "text-wire-600 line-through"
                        }`}
                      >
                        {a.name}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-wire-600">
                        {TIER_LABEL[a.tier]}
                      </span>
                      <span className="w-8 text-right font-mono text-[10px] text-wire-500">
                        {a.confidence != null ? `${a.confidence}%` : "—"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="min-h-0 overflow-y-auto p-4">
              {verdict ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <VerdictCard
                      label="Boss memo"
                      action={bossDecision?.action ?? "hold"}
                      confidence={bossDecision?.confidence}
                      muted
                    />
                    <VerdictCard
                      label="Shadow verdict"
                      action={verdict.action}
                      confidence={verdict.confidence}
                      highlight={verdict.flippedFromBoss}
                      sub={verdict.signal}
                    />
                  </div>

                  {verdict.flippedFromBoss ? (
                    <p className="rounded border border-phos/30 bg-phos/5 px-3 py-2 font-mono text-[10px] leading-relaxed text-phos">
                      Counterfactual flip — muting desks changes the trade vs what the boss
                      issued.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setPublishForkOpen(true)}
                    className="w-full rounded border border-phos/40 bg-phos/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-phos transition hover:bg-phos/15"
                  >
                    Publish fork to feed
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="w-full rounded border border-brass/40 bg-brass/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brass transition hover:bg-brass/15"
                  >
                    Share shadow verdict (comment)
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveFork}
                    className="w-full rounded border border-wire-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-phos/40 hover:text-phos"
                  >
                    Save fork snapshot
                  </button>

                  {forkDiff.filter((r) => r.changed).length > 0 ? (
                    <div className="rounded border border-wire-800 bg-ink-900/40 p-3">
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-500">
                        fork diff vs full committee
                      </p>
                      <table className="mt-2 w-full border-collapse font-mono text-[9px]">
                        <thead>
                          <tr className="text-left text-wire-600">
                            <th className="pb-1 font-normal">agent</th>
                            <th className="pb-1 font-normal">was</th>
                            <th className="pb-1 font-normal">now</th>
                          </tr>
                        </thead>
                        <tbody>
                          {forkDiff
                            .filter((r) => r.changed)
                            .slice(0, 8)
                            .map((r) => (
                              <tr key={r.agentKey} className="border-t border-wire-900/80 text-wire-400">
                                <td className="py-1 pr-2 text-wire-300">{r.agentName}</td>
                                <td className="py-1 pr-2">{r.beforeSignal}</td>
                                <td className="py-1 text-phos">{r.afterSignal}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <ShareShadowModal
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    ticker={ticker}
                    verdict={verdict}
                    enabled={enabled}
                    weightMode={weightMode}
                    agents={agents}
                    sessionUserId={session?.user?.id}
                  />

                  <PublishForkModal
                    open={publishForkOpen}
                    onClose={() => setPublishForkOpen(false)}
                    ticker={ticker}
                    preset={preset}
                    weightMode={weightMode}
                    enabledAgents={agents.filter((a) => enabled[a.key]).map((a) => a.key)}
                    payload={payload}
                    verdict={verdict}
                    shiftContext={shiftContext}
                    onPublished={(post) => {
                      onForkPublished?.(post);
                      handleSaveFork();
                    }}
                  />

                  <div className="rounded border border-wire-800 bg-ink-900/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-wire-500">
                        dissent fragility
                      </span>
                      <span className="font-mono text-[11px] text-brass">
                        {verdict.fragility > 0
                          ? `${verdict.fragility} voice${verdict.fragility === 1 ? "" : "s"}`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-phos via-brass to-siren transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(8, (1 - verdict.fragility / Math.max(agents.filter((a) => a.enabled).length, 1)) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-wire-400">
                      {verdict.fragilityLabel}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 font-mono text-[10px]">
                    <Chip label="bull" value={verdict.tally.bullish} tone="phos" />
                    <Chip label="bear" value={verdict.tally.bearish} tone="siren" />
                    <Chip label="neutral" value={verdict.tally.neutral} tone="wire" />
                    <Chip
                      label="enabled"
                      value={agents.filter((a) => a.enabled).length}
                      tone="brass"
                    />
                  </div>

                  {artifacts.length > 0 ? <ArtifactGallery artifacts={artifacts} /> : null}
                </div>
              ) : (
                <p className="text-[11px] text-wire-500">Enable at least one desk to simulate.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictCard({
  label,
  action,
  confidence,
  highlight,
  muted,
  sub,
}: {
  label: string;
  action: string;
  confidence?: number | null;
  highlight?: boolean;
  muted?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`rounded border p-3 ${
        highlight
          ? "border-phos/40 bg-phos/5 shadow-[inset_0_1px_0_rgb(var(--phos)/0.15)]"
          : muted
            ? "border-wire-800/80 bg-ink-950/50 opacity-80"
            : "border-brass/25 bg-ink-900/50"
      }`}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-wire-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
            ACTION_CHIP[action] ?? ACTION_CHIP.hold
          }`}
        >
          {action}
        </span>
        {confidence != null ? (
          <span className="font-mono text-[10px] text-wire-500">{Math.round(confidence)}%</span>
        ) : null}
      </div>
      {sub ? (
        <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-wire-600">{sub}</p>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "phos" | "siren" | "wire" | "brass";
}) {
  const color =
    tone === "phos"
      ? "text-phos border-phos/30"
      : tone === "siren"
        ? "text-siren border-siren/30"
        : tone === "brass"
          ? "text-brass border-brass/30"
          : "text-wire-400 border-wire-800";
  return (
    <span className={`rounded border px-2 py-0.5 ${color}`}>
      {label} {value}
    </span>
  );
}

function ShareShadowModal({
  open,
  onClose,
  ticker,
  verdict,
  enabled,
  weightMode,
  agents,
  sessionUserId,
}: {
  open: boolean;
  onClose: () => void;
  ticker: string;
  verdict: NonNullable<ReturnType<typeof computeShadowVerdict>>;
  enabled: Record<string, boolean>;
  weightMode: WeightMode;
  agents: ReturnType<typeof listShadowAgents>;
  sessionUserId?: string;
}) {
  const [posts, setPosts] = useState<FloorPost[]>([]);
  const [filterTicker, setFilterTicker] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setDone(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase || !sessionUserId) return;
    setLoading(true);
    void fetchFeed(supabase, sessionUserId, { limit: 40 })
      .then(setPosts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load feed"))
      .finally(() => setLoading(false));
  }, [open, sessionUserId]);

  const filtered = useMemo(() => {
    if (!filterTicker) return posts;
    const upper = ticker.toUpperCase();
    return posts.filter((p) => p.tickers.some((t) => t.toUpperCase() === upper));
  }, [posts, filterTicker, ticker]);

  const enabledAgents = agents.filter((a) => enabled[a.key]).map((a) => a.name);
  const body = `Shadow ${ticker}: ${verdict.action} (${verdict.confidence}%) — ${verdict.signal}`;

  async function publishTo(postId: string) {
    const supabase = getSupabase();
    if (!supabase || !sessionUserId) {
      setError("Sign in to share.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addShadowComment(supabase, sessionUserId, postId, body, {
        ticker,
        verdict: verdict.action,
        agents: enabledAgents,
        weightMode,
      });
      setDone(true);
      setTimeout(onClose, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/80 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded border border-brass/30 bg-ink-950 shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-4 py-3">
          <h3 className="font-display text-sm font-bold text-wire-100">Share shadow verdict</h3>
          <p className="mt-0.5 text-[10px] text-wire-500">Attach as comment to a feed post</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!sessionUserId ? (
            <p className="text-[11px] text-wire-500">Sign in to share.</p>
          ) : loading ? (
            <p className="text-[11px] text-wire-500">Loading posts…</p>
          ) : (
            <>
              <label className="mb-3 flex cursor-pointer items-center gap-2 text-[10px] text-wire-400">
                <input
                  type="checkbox"
                  checked={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.checked)}
                  className="accent-[rgb(var(--brass))]"
                />
                Only posts mentioning {ticker}
              </label>
              {filtered.length === 0 ? (
                <p className="text-[11px] text-wire-500">No matching posts.</p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((post) => (
                    <li key={post.id}>
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => void publishTo(post.id)}
                        className="w-full rounded border border-wire-800 px-3 py-2 text-left transition hover:border-brass/40 disabled:opacity-40"
                      >
                        <div className="font-mono text-[10px] text-brass">
                          {post.tickers.join(", ")}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-wire-300">
                          {post.caption || post.author.displayName}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {done ? <p className="mt-2 text-[11px] text-phos">Published!</p> : null}
          {error ? <p className="mt-2 text-[11px] text-siren">{error}</p> : null}
        </div>
        <footer className="shrink-0 border-t border-wire-800 px-4 py-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wire-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-wire-400"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

function ConvictionConstellation({
  agents,
}: {
  agents: ReturnType<typeof listShadowAgents>;
}) {
  const enabled = agents.filter((a) => a.enabled);
  const cx = 120;
  const cy = 100;
  const r = 72;

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 240 200" className="w-full">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(55 65 81)" strokeOpacity={0.35} />
        <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="rgb(55 65 81)" strokeOpacity={0.2} />
        {agents.map((a, i) => {
          const angle = (Math.PI * 2 * i) / Math.max(agents.length, 1) - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          const fill =
            a.signal === "bullish" ? "#2fd08a" : a.signal === "bearish" ? "#ff4d6d" : "#6b7280";
          return (
            <g key={a.key} opacity={a.enabled ? 1 : 0.2}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={fill}
                strokeOpacity={0.15}
                strokeWidth={1}
              />
              <circle cx={x} cy={y} r={a.enabled ? 5 : 3} fill={fill} />
            </g>
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#e3b24b" fontSize={11} fontFamily="monospace">
          {enabled.length}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#6b7280" fontSize={7} fontFamily="monospace">
          voices
        </text>
      </svg>
    </div>
  );
}
