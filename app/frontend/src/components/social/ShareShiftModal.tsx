import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../../lib/supabase";
import { buildPostSnapshot, pickHeroArtifactUrl } from "../../lib/floorSocial/buildPostSnapshot";
import { isShiftPublished, publishPost } from "../../lib/floorSocial/api";
import type { PaywallPayload } from "../../lib/entitlements";
import { PaywallError } from "../../lib/entitlements";
import type { ShiftArchiveInput } from "../../lib/floorSocial/types";
import { FloorPostCard } from "./FloorPostCard";
import { PostShareLinks } from "./PostShareLinks";

interface Props {
  open: boolean;
  shift: ShiftArchiveInput | null;
  onClose: () => void;
  onPublished?: (postId: string) => void;
  onPaywall?: (payload: PaywallPayload) => void;
  /** Await cloud replay archive before publish (prevents synthesized public replays). */
  ensureReplayArchived?: (shiftId: string, runId?: string | null) => Promise<void>;
}

export function ShareShiftModal({
  open,
  shift,
  onClose,
  onPublished,
  ensureReplayArchived,
  onPaywall,
}: Props) {
  const { session } = useAuth();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPublished, setAlreadyPublished] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);

  const snapshot = useMemo(
    () => (shift ? buildPostSnapshot(shift) : null),
    [shift],
  );

  useEffect(() => {
    if (!open) {
      setCaption("");
      setError(null);
      setAlreadyPublished(false);
      setPublishedPostId(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!open || !supabase || !userId || !shift) return;
    void isShiftPublished(supabase, userId, shift.id, shift.runId).then(setAlreadyPublished);
  }, [open, session?.user?.id, shift]);

  if (!open || !shift || !snapshot) return null;

  const previewPost = {
    id: "preview",
    authorId: session?.user?.id ?? "",
    author: {
      id: session?.user?.id ?? "",
      displayName: session?.user?.email?.split("@")[0] ?? "You",
    },
    shiftId: shift.id,
    runId: shift.runId ?? null,
    watchlistId: null,
    postKind: "shift" as const,
    caption: caption || null,
    tickers: shift.tickers,
    model: shift.model,
    analystCount: shift.analystCount,
    tsMs: shift.ts,
    snapshot,
    heroArtifactUrl: pickHeroArtifactUrl(snapshot),
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date().toISOString(),
  };

  async function handlePublish() {
    if (!shift || !snapshot) return;
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setError("Sign in to share runs.");
      return;
    }
    if (alreadyPublished) {
      setError("This shift is already on the feed.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (ensureReplayArchived) {
        await ensureReplayArchived(shift.id, shift.runId);
      }
      const post = await publishPost(supabase, userId, {
        shiftId: shift.id,
        runId: shift.runId,
        caption,
        tickers: shift.tickers,
        model: shift.model,
        analystCount: shift.analystCount,
        tsMs: shift.ts,
        snapshot,
        heroArtifactUrl: pickHeroArtifactUrl(snapshot),
      });
      setPublishedPostId(post.id);
      onPublished?.(post.id);
    } catch (e) {
      if (e instanceof PaywallError) {
        onPaywall?.(e.payload);
        onClose();
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  function handleDone() {
    onClose();
  }

  return (
    <div
      className="desk-backdrop absolute inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink-950/60 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={publishedPostId ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-brass/30 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="share-shift-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-5 py-4">
          <h2
            id="share-shift-title"
            className="font-display text-base font-bold tracking-wide text-wire-100"
          >
            {publishedPostId ? "Published to feed" : "Share to feed"}
          </h2>
          <p className="mt-1 text-[11px] text-wire-500">
            {publishedPostId
              ? "Copy a public replay or embed link for visitors."
              : "Members-only — committee votes, disputes, and artifacts from this shift."}
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!publishedPostId ? (
            <>
              <div>
                <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
                  Caption (optional)
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="What stood out about this run?"
                  className="w-full resize-none rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none focus:border-brass/50"
                />
              </div>

              {snapshot.ephemeralArtifactWarnings.length > 0 ? (
                <div className="rounded border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-amber">
                  {snapshot.ephemeralArtifactWarnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}

              <FloorPostCard post={previewPost} mode="live" />

              {alreadyPublished ? (
                <p className="text-[11px] text-amber">This shift is already published.</p>
              ) : null}
            </>
          ) : (
            <div className="space-y-3 rounded border border-phos/25 bg-phos/5 px-4 py-4">
              <p className="text-[12px] text-wire-200">
                Your shift is live on the members feed. Share the public replay for anyone without
                an account.
              </p>
              <PostShareLinks postId={publishedPostId} />
            </div>
          )}
          {error ? <p className="text-[11px] text-siren">{error}</p> : null}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-wire-800 px-5 py-4">
          {publishedPostId ? (
            <button
              type="button"
              onClick={handleDone}
              className="rounded border border-brass/50 bg-brass/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20"
            >
              Done
            </button>
          ) : (
            <>
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
                disabled={busy || alreadyPublished}
                className="rounded border border-brass/50 bg-brass/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20 disabled:opacity-40"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
