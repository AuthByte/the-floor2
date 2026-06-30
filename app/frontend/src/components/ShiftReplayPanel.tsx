import { useEffect, useMemo } from "react";

import { useShiftReplayPlayback } from "../hooks/useShiftReplayPlayback";
import { buildShiftTimeline } from "../lib/shiftReplay";
import type { ShiftReplayArchive } from "../lib/userData/types";
import type { LogLine, RoomState } from "../lib/types";
import { ShiftReplayChrome } from "./ShiftReplayChrome";

const REPLAY_HINT =
  "space play · ← → step events · shift+←→ or ↑↓ phase · [ ] speed · home/end · floor lights sync";

interface LiveProps {
  mode?: "live";
  open: boolean;
  onClose: () => void;
  rooms: Record<string, RoomState>;
  log: LogLine[];
  shiftStartedAt: number | null;
  totalDesks: number;
  onTimeChange?: (ts: number) => void;
  onSnapshotChange?: (snapshot: Record<string, import("../lib/shiftReplay").ReplayRoomSnapshot> | null) => void;
}

interface ArchiveProps {
  mode: "archive";
  open: boolean;
  onClose: () => void;
  archive: ShiftReplayArchive;
  title: string;
  subtitle?: string;
  totalDesks?: number;
  onTimeChange?: (ts: number) => void;
  onSnapshotChange?: (snapshot: Record<string, import("../lib/shiftReplay").ReplayRoomSnapshot> | null) => void;
}

export type ShiftReplayPanelProps = LiveProps | ArchiveProps;

export function ShiftReplayPanel(props: ShiftReplayPanelProps) {
  const { open, onClose, onTimeChange, onSnapshotChange } = props;

  const timeline = useMemo(() => {
    if (!open) return [];
    if (props.mode === "archive") return props.archive.timeline ?? [];
    if (!props.shiftStartedAt) return [];
    return buildShiftTimeline(props.rooms, props.log, props.shiftStartedAt);
  }, [open, props]);

  const roomIds = useMemo(() => {
    if (props.mode === "archive") {
      return props.archive.roomIds?.length
        ? props.archive.roomIds
        : [...new Set(timeline.map((e) => e.roomId).filter(Boolean) as string[])];
    }
    return Object.keys(props.rooms);
  }, [props, timeline]);

  const startTs = timeline[0]?.ts ?? (props.mode === "archive" ? props.archive.shiftStartedAt : props.shiftStartedAt) ?? Date.now();
  const endTs = timeline[timeline.length - 1]?.ts ?? startTs;
  const totalDesks =
    props.mode === "archive"
      ? props.totalDesks ?? roomIds.length
      : props.totalDesks;

  const playback = useShiftReplayPlayback({
    open,
    timeline,
    roomIds,
    startTs,
    endTs,
    onCursorChange: onTimeChange,
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

  const headerKicker = props.mode === "archive" ? "archived shift" : "time machine";
  const headerTitle =
    props.mode === "archive" ? props.title : "Shift Replay";
  const headerSub =
    props.mode === "archive" ? props.subtitle : undefined;

  return (
    <div
      className="fixed inset-0 z-[46] flex animate-fade-in items-end justify-center bg-ink-950/75 p-0 backdrop-blur-[4px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl animate-scale-in flex-col overflow-hidden border border-wire-800 bg-ink-950 shadow-float sm:rounded-lg"
        role="dialog"
        aria-labelledby="shift-replay-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-b border-wire-800 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                {headerKicker}
              </p>
              <h2
                id="shift-replay-title"
                className="mt-0.5 truncate font-display text-base font-bold tracking-wide text-wire-100"
              >
                {headerTitle}
              </h2>
              {headerSub ? (
                <p className="mt-1 truncate font-mono text-[9px] text-wire-600">{headerSub}</p>
              ) : null}
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

        {!timeline.length ? (
          <p className="p-6 text-center text-[11px] text-wire-500">
            {props.mode === "archive"
              ? "No replay timeline saved for this shift."
              : "No replay data — run a shift first."}
          </p>
        ) : (
          <ShiftReplayChrome
            startTs={startTs}
            endTs={endTs}
            totalDesks={totalDesks}
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
