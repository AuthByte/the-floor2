import { useEffect, useState } from "react";

import { useShiftReplayPlayback } from "../../hooks/useShiftReplayPlayback";
import {
  fetchPublicPost,
  fetchPublicReplay,
  publicPostToFloorPost,
  PublicPostError,
} from "../../lib/floorSocial/apiPublic";
import { buildPostReplayUrl } from "../../lib/floorSocial/useAppUrl";
import type { PublicPost } from "../../lib/floorSocial/types";
import type { ShiftReplayArchive } from "../../lib/userData/types";
import { ShiftReplayChrome } from "../ShiftReplayChrome";
import { AuthorChip } from "./AuthorChip";
import { PostScorecard } from "./PostScorecard";

const REPLAY_HINT =
  "space play · ← → step · shift+←→ or ↑↓ phase · [ ] speed · read-only spectator";

interface Props {
  postId: string;
}

export function PublicReplayPage({ postId }: Props) {
  const [post, setPost] = useState<PublicPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [archive, setArchive] = useState<ShiftReplayArchive | null>(null);
  const [synthesized, setSynthesized] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchPublicPost(postId)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PublicPostError) {
          if (err.status === 404) {
            setError("Post not found — replay links only work after you publish a shift to the feed.");
          } else if (err.status === 503) {
            setError(err.message);
          } else {
            setError(err.message);
          }
        } else {
          setError(err instanceof Error ? err.message : "Failed to load post.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    setReplayError(null);

    void fetchPublicReplay(postId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setArchive(null);
          setSynthesized(false);
          return;
        }
        setArchive({
          shiftStartedAt: data.shiftStartedAt,
          timeline: data.timeline,
          roomIds: data.roomIds,
          log: data.log ?? [],
        });
        setSynthesized(data.synthesized);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReplayError(err instanceof Error ? err.message : "Failed to load replay.");
        setArchive(null);
      });

    return () => {
      cancelled = true;
    };
  }, [post, postId]);

  const timeline = archive?.timeline ?? [];
  const roomIds = archive?.roomIds ?? [];
  const startTs = timeline[0]?.ts ?? archive?.shiftStartedAt ?? post?.tsMs ?? 0;
  const endTs = timeline[timeline.length - 1]?.ts ?? startTs;

  const playback = useShiftReplayPlayback({
    open: Boolean(post && timeline.length),
    timeline,
    roomIds,
    startTs,
    endTs,
  });

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 font-mono text-[11px] uppercase tracking-[0.28em] text-wire-600">
        Loading replay…
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-ink-950 p-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-siren">
          {error ?? "Post not found."}
        </p>
        <a
          href="/"
          className="rounded border border-wire-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 hover:border-brass/50 hover:text-brass"
        >
          Run your own shift →
        </a>
      </div>
    );
  }

  const floorPost = publicPostToFloorPost(post);
  const primary = post.snapshot.tickers[0];
  const scorecard = post.scorecard ?? {};

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-950 text-wire-200">
      <header className="border-b border-wire-800/90 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
              public replay · spectator
            </p>
            <h1 className="truncate font-display text-xl font-bold tracking-wide text-wire-100">
              {post.tickers.join(", ")}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <AuthorChip author={floorPost.author} />
              {primary?.summaryLine ? (
                <span className="rounded border border-wire-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-brass">
                  boss {primary.summaryLine.action}
                </span>
              ) : null}
              {synthesized ? (
                <span className="font-mono text-[9px] text-wire-600">
                  synthesized from snapshot
                </span>
              ) : post.hasArchivedReplay ? (
                <span className="font-mono text-[9px] text-phos">archived timeline</span>
              ) : null}
            </div>
            {post.caption ? (
              <p className="max-w-xl text-[12px] leading-relaxed text-wire-400">{post.caption}</p>
            ) : null}
          </div>
          <a
            href="/"
            className="shrink-0 rounded border border-brass/40 bg-brass/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-brass hover:bg-brass/20"
          >
            Run your own shift
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6">
        {Object.keys(scorecard).length > 0 ? (
          <div className="mb-4">
            <PostScorecard scorecard={scorecard} tickers={post.tickers} compact />
          </div>
        ) : null}

        {replayError ? (
          <p className="rounded border border-siren/30 bg-siren/5 p-4 text-center text-[11px] text-siren">
            {replayError}
          </p>
        ) : !timeline.length ? (
          <div className="rounded border border-wire-800 bg-ink-900/40 p-6 text-center">
            <p className="text-[11px] text-wire-500">No replay timeline for this post.</p>
            <p className="mt-2 font-mono text-[9px] text-wire-600">
              The author archived a summary only — scorecard and snapshot remain visible.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-wire-800 bg-ink-900/30">
            <ShiftReplayChrome
              startTs={startTs}
              endTs={endTs}
              totalDesks={roomIds.length}
              cursor={playback.cursor}
              playing={playback.playing}
              speed={playback.speed}
              loop={playback.loop}
              phaseFilter={playback.phaseFilter}
              markers={playback.markers}
              currentEvent={playback.currentEvent}
              doneCount={playback.doneCount}
              spark={playback.spark}
              visibleEvents={playback.visibleEvents}
              synthesized={synthesized}
              footerHint={REPLAY_HINT}
              onSeek={(ts) => playback.seek(ts)}
              onTogglePlay={() => playback.setPlaying((p) => !p)}
              onSpeed={playback.setSpeed}
              onToggleLoop={() => playback.setLoop((l) => !l)}
              onPhaseFilter={playback.setPhaseFilter}
              onRewind={() => playback.seek(startTs)}
              onStep={playback.step}
              onJumpPhase={playback.jumpPhase}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-wire-900 px-4 py-3 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
          Powered by{" "}
          <span className="text-brass/80">THE FLOOR</span>
          {" · "}
          <a href={buildPostReplayUrl(post.id)} className="text-wire-500 hover:text-brass">
            copy replay link
          </a>
        </p>
        <p className="mt-1 font-mono text-[8px] text-wire-700">
          Simulation only — not investment advice.
        </p>
      </footer>
    </div>
  );
}
