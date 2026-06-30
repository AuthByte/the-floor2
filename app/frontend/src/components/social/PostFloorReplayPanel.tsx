import { useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { useShiftReplayPlayback } from "../../hooks/useShiftReplayPlayback";
import { loadPostReplay, loadPublicPostReplay } from "../../lib/floorSocial/postReplay";
import type { FloorPost } from "../../lib/floorSocial/types";
import { getSupabase } from "../../lib/supabase";
import type { DebateRound } from "../../lib/types";
import type { ShiftReplayArchive } from "../../lib/userData/types";
import type { ReplayRoomSnapshot } from "../../lib/shiftReplay";
import { ShiftReplayChrome } from "../ShiftReplayChrome";

const REPLAY_HINT =
  "space play · ← → step · shift+←→ or ↑↓ phase · [ ] speed · floor lights sync when on desk";

interface Props {
  open: boolean;
  post: FloorPost;
  onClose: () => void;
  onSnapshotChange?: (snapshot: Record<string, ReplayRoomSnapshot> | null) => void;
  onOpenDebateTheater?: (rounds: DebateRound[], opts?: { synthesized?: boolean }) => void;
}

export function PostFloorReplayPanel({
  open,
  post,
  onClose,
  onSnapshotChange,
  onOpenDebateTheater,
}: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archive, setArchive] = useState<ShiftReplayArchive | null>(null);
  const [synthesized, setSynthesized] = useState(false);
  const [debateRounds, setDebateRounds] = useState<DebateRound[]>([]);
  const [hasDebate, setHasDebate] = useState(false);

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabase();
    const userId = session?.user?.id;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const loader =
      userId && supabase
        ? loadPostReplay(supabase, post)
        : loadPublicPostReplay(post);

    void loader
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setArchive(null);
          setSynthesized(false);
          setDebateRounds([]);
          setHasDebate(false);
          return;
        }
        setArchive({
          shiftStartedAt: data.shiftStartedAt,
          timeline: data.timeline,
          roomIds: data.roomIds,
          log: [],
          debate: data.debateRounds.length
            ? { rounds: data.debateRounds }
            : undefined,
        });
        setSynthesized(data.synthesized);
        setDebateRounds(data.debateRounds);
        setHasDebate(data.hasDebate);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load replay.");
        setArchive(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, post, session?.user?.id]);

  const timeline = archive?.timeline ?? [];
  const roomIds = archive?.roomIds ?? [];
  const startTs = timeline[0]?.ts ?? archive?.shiftStartedAt ?? post.tsMs;
  const endTs = timeline[timeline.length - 1]?.ts ?? startTs;

  const playback = useShiftReplayPlayback({
    open: open && !loading && Boolean(timeline.length),
    timeline,
    roomIds,
    startTs,
    endTs,
    onSnapshotChange,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[47] flex animate-fade-in items-end justify-center bg-ink-950/75 p-0 backdrop-blur-[4px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl animate-scale-in flex-col overflow-hidden border border-wire-800 bg-ink-950 shadow-float sm:rounded-lg"
        role="dialog"
        aria-labelledby="post-replay-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-b border-wire-800 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                shared run replay
              </p>
              <h2
                id="post-replay-title"
                className="mt-0.5 truncate font-display text-base font-bold tracking-wide text-wire-100"
              >
                {post.tickers.join(", ")}
              </h2>
              <p className="mt-1 truncate font-mono text-[9px] text-wire-600">
                {post.author.displayName}
                {synthesized ? " · synthesized from snapshot" : " · archived shift"}
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
          {hasDebate && onOpenDebateTheater ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenDebateTheater(debateRounds, { synthesized })}
                className="rounded border border-brass/50 bg-brass/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-brass hover:bg-brass/20"
              >
                Watch debate
              </button>
              <span className="self-center font-mono text-[9px] text-wire-600">
                {debateRounds.length} round{debateRounds.length === 1 ? "" : "s"} · theater replay
              </span>
            </div>
          ) : null}
        </header>

        {loading ? (
          <p className="p-6 text-center text-[11px] text-wire-500">Loading replay…</p>
        ) : loadError ? (
          <p className="p-6 text-center text-[11px] text-siren">{loadError}</p>
        ) : !timeline.length ? (
          <p className="p-6 text-center text-[11px] text-wire-500">
            No replay data for this post.
          </p>
        ) : (
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
        )}

      </div>
    </div>
  );
}
