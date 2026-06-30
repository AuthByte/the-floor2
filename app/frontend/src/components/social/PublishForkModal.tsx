import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { fetchFeed } from "../../lib/floorSocial/api";
import {
  buildForkPublishBundle,
  buildForkSnapshotFromBench,
  defaultForkCaption,
  isForkPost,
} from "../../lib/floorSocial/forkSnapshot";
import { findUserShiftPost, publishForkPost } from "../../lib/floorSocial/publishFork";
import type { FloorPost } from "../../lib/floorSocial/types";
import type { CompletePayload } from "../../lib/types";
import type { ShadowVerdict, WeightMode } from "../../lib/shadowBench";
import { getSupabase } from "../../lib/supabase";
import { ForkBadge } from "./ForkBadge";

export interface ShadowBenchShiftContext {
  runId?: string | null;
  shiftId?: string | null;
  model: string;
  analystCount: number;
  tsMs: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPublished?: (post: FloorPost) => void;
  ticker: string;
  preset: string;
  weightMode: WeightMode;
  enabledAgents: string[];
  payload: CompletePayload;
  verdict: ShadowVerdict;
  parentPost?: FloorPost | null;
  shiftContext?: ShadowBenchShiftContext;
}

const ACTION_CHIP: Record<string, string> = {
  buy: "border-phos/50 bg-phos/10 text-phos",
  cover: "border-phos/40 bg-phos/5 text-phos",
  sell: "border-siren/50 bg-siren/10 text-siren",
  short: "border-siren/40 bg-siren/10 text-siren",
  hold: "border-amber/40 bg-amber/10 text-amber",
};

export function PublishForkModal({
  open,
  onClose,
  onPublished,
  ticker,
  preset,
  weightMode,
  enabledAgents,
  payload,
  verdict: _verdict,
  parentPost: parentPostProp,
  shiftContext,
}: Props) {
  const { session } = useAuth();
  const [caption, setCaption] = useState("");
  const [parentPost, setParentPost] = useState<FloorPost | null>(parentPostProp ?? null);
  const [feedPosts, setFeedPosts] = useState<FloorPost[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = `${preset} fork · ${ticker}`;

  const previewMeta = useMemo(() => {
    if (!parentPost) return null;
    try {
      const fork = buildForkSnapshotFromBench({
        ticker,
        label,
        enabledAgents,
        weightMode,
        preset,
        payload,
        parentPostId: parentPost.id,
      });
      return buildForkPublishBundle({ fork, parentPost }).forkMeta;
    } catch {
      return null;
    }
  }, [parentPost, ticker, label, enabledAgents, weightMode, preset, payload]);

  useEffect(() => {
    if (!open) {
      setCaption("");
      setError(null);
      setPickMode(false);
      setParentPost(parentPostProp ?? null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, parentPostProp]);

  useEffect(() => {
    if (!open) return;
    setParentPost(parentPostProp ?? null);
  }, [open, parentPostProp]);

  useEffect(() => {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!open || !supabase || !userId || parentPostProp || parentPost) return;

    setLoading(true);
    void findUserShiftPost(supabase, userId, {
      runId: shiftContext?.runId,
      shiftId: shiftContext?.shiftId,
      ticker,
    })
      .then((post) => {
        if (post) setParentPost(post);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to resolve parent post"))
      .finally(() => setLoading(false));
  }, [open, session?.user?.id, parentPostProp, parentPost, shiftContext, ticker]);

  useEffect(() => {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!open || !pickMode || !supabase || !userId) return;
    setLoading(true);
    void fetchFeed(supabase, userId, { limit: 40 })
      .then((posts) =>
        setFeedPosts(
          posts.filter(
            (p) =>
              !isForkPost(p) &&
              p.postKind !== "watchlist_digest" &&
              p.tickers.some((t) => t.toUpperCase() === ticker.toUpperCase()),
          ),
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load feed"))
      .finally(() => setLoading(false));
  }, [open, pickMode, session?.user?.id, ticker]);

  useEffect(() => {
    if (previewMeta && !caption) {
      setCaption(defaultForkCaption(previewMeta));
    }
  }, [previewMeta, caption]);

  async function handlePublish() {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setError("Sign in to publish.");
      return;
    }
    if (!parentPost) {
      setError("Select a parent shift post first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const fork = buildForkSnapshotFromBench({
        ticker,
        label,
        enabledAgents,
        weightMode,
        preset,
        payload,
        parentPostId: parentPost.id,
        parentShiftId: parentPost.shiftId ?? undefined,
      });
      const bundle = buildForkPublishBundle({ fork, parentPost, caption });
      const post = await publishForkPost(supabase, userId, {
        parentPostId: parentPost.id,
        caption: bundle.caption,
        forkMeta: bundle.forkMeta,
        snapshot: bundle.snapshot,
        tickers: bundle.tickers,
        model: shiftContext?.model ?? parentPost.model,
        analystCount: shiftContext?.analystCount ?? parentPost.analystCount,
        tsMs: shiftContext?.tsMs ?? parentPost.tsMs,
        shiftId: parentPost.shiftId,
        runId: parentPost.runId,
        heroArtifactUrl: parentPost.heroArtifactUrl,
      });
      onPublished?.(post);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish fork");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-brass/30 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="publish-fork-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <ForkBadge />
            <h3 id="publish-fork-title" className="font-display text-sm font-bold text-wire-100">
              Publish shadow fork
            </h3>
          </div>
          <p className="mt-1 text-[10px] text-wire-500">
            Counterfactual roster as a feed post — no re-run required.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {previewMeta ? (
            <div className="rounded border border-wire-800 bg-ink-900/50 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-wire-500">
                Preview
              </p>
              <p className="mt-2 font-mono text-sm font-bold text-wire-100">
                {previewMeta.ticker} → {previewMeta.shadow.action}
                {previewMeta.shadow.flippedFromBoss ? (
                  <span className="ml-2 text-phos">flip</span>
                ) : null}
              </p>
              <p className="mt-1 text-[11px] text-wire-400">
                {previewMeta.preset} · {previewMeta.weightMode} ·{" "}
                {previewMeta.enabledAgents.length} desks active
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded border border-wire-800/80 bg-ink-950/50 p-2">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-wire-600">
                    Boss
                  </div>
                  <span
                    className={`mt-1 inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${
                      ACTION_CHIP[previewMeta.bossAction ?? "hold"] ?? ACTION_CHIP.hold
                    }`}
                  >
                    {previewMeta.bossAction ?? "hold"}
                    {previewMeta.bossConfidence != null ? ` ${previewMeta.bossConfidence}%` : ""}
                  </span>
                </div>
                <div className="rounded border border-phos/30 bg-phos/5 p-2">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-wire-600">
                    Shadow
                  </div>
                  <span
                    className={`mt-1 inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${
                      ACTION_CHIP[previewMeta.shadow.action] ?? ACTION_CHIP.hold
                    }`}
                  >
                    {previewMeta.shadow.action} {previewMeta.shadow.confidence}%
                  </span>
                </div>
              </div>
              {previewMeta.diffPreview.length > 0 ? (
                <p className="mt-2 text-[10px] leading-relaxed text-wire-500">
                  diff:{" "}
                  {previewMeta.diffPreview
                    .slice(0, 3)
                    .map((d) => `${d.agentName} ${d.beforeSignal}→${d.afterSignal}`)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
              Caption
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              placeholder={previewMeta ? defaultForkCaption(previewMeta) : "Fork caption"}
              className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none focus:border-brass/50"
            />
          </div>

          <div className="rounded border border-wire-800 bg-ink-900/30 p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-wire-600">
              Parent run
            </p>
            {loading && !parentPost ? (
              <p className="mt-2 text-[11px] text-wire-500">Resolving parent post…</p>
            ) : parentPost ? (
              <div className="mt-2">
                <p className="text-[11px] text-wire-300">
                  @{parentPost.author.handle ?? parentPost.author.displayName} ·{" "}
                  {parentPost.tickers.join(", ")}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-wire-500">
                  {parentPost.caption || "Published shift"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setParentPost(null);
                    setPickMode(true);
                  }}
                  className="mt-2 font-mono text-[9px] uppercase tracking-wider text-brass hover:underline"
                >
                  Change parent
                </button>
              </div>
            ) : pickMode ? (
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                {feedPosts.length === 0 ? (
                  <p className="text-[11px] text-wire-500">No matching shift posts.</p>
                ) : (
                  feedPosts.map((post) => (
                    <li key={post.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setParentPost(post);
                          setPickMode(false);
                        }}
                        className="w-full rounded border border-wire-800 px-2 py-1.5 text-left transition hover:border-brass/40"
                      >
                        <div className="font-mono text-[10px] text-brass">
                          {post.tickers.join(", ")}
                        </div>
                        <div className="truncate text-[10px] text-wire-400">
                          @{post.author.handle ?? post.author.displayName}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-wire-500">
                  Publish your shift to the feed first, or pick an existing run.
                </p>
                <button
                  type="button"
                  onClick={() => setPickMode(true)}
                  className="rounded border border-wire-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-wire-400 hover:border-brass/40 hover:text-brass"
                >
                  Pick parent post
                </button>
              </div>
            )}
          </div>

          {error ? <p className="text-[11px] text-siren">{error}</p> : null}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-wire-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wire-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={busy || !parentPost || !previewMeta}
            className="rounded border border-brass/50 bg-brass/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20 disabled:opacity-40"
          >
            {busy ? "Publishing…" : "Publish to feed"}
          </button>
        </footer>
      </div>
    </div>
  );
}
