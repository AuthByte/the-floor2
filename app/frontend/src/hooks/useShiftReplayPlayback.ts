import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  countDoneAt,
  doneSparkline,
  eventsUpTo,
  nextPhaseCursor,
  phaseMarkers,
  prevPhaseCursor,
  REPLAY_SPEEDS,
  snapshotAtTime,
  stepReplayCursor,
  type ReplayEvent,
  type ReplayRoomSnapshot,
  type ReplaySpeed,
} from "../lib/shiftReplay";

export interface ShiftReplayPlaybackOptions {
  open: boolean;
  timeline: ReplayEvent[];
  roomIds: string[];
  startTs: number;
  endTs: number;
  onCursorChange?: (ts: number) => void;
  onSnapshotChange?: (snapshot: Record<string, ReplayRoomSnapshot> | null) => void;
}

export function useShiftReplayPlayback({
  open,
  timeline,
  roomIds,
  startTs,
  endTs,
  onCursorChange,
  onSnapshotChange,
}: ShiftReplayPlaybackOptions) {
  const [cursor, setCursor] = useState(startTs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);
  const [loop, setLoop] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<ReplayEvent["phase"] | "all">("all");
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const markers = useMemo(() => phaseMarkers(timeline), [timeline]);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      onSnapshotChange?.(null);
      return;
    }
    setCursor(startTs);
  }, [open, startTs, onSnapshotChange]);

  const snapshot = useMemo(
    () => (timeline.length ? snapshotAtTime(timeline, cursor, roomIds) : null),
    [timeline, cursor, roomIds],
  );

  useEffect(() => {
    onCursorChange?.(cursor);
  }, [cursor, onCursorChange]);

  useEffect(() => {
    if (!open) return;
    onSnapshotChange?.(snapshot);
  }, [open, snapshot, onSnapshotChange]);

  const seek = useCallback(
    (ts: number, opts?: { pause?: boolean }) => {
      if (opts?.pause !== false) setPlaying(false);
      setCursor(Math.min(endTs, Math.max(startTs, ts)));
    },
    [endTs, startTs],
  );

  const tick = useCallback(
    (now: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      setCursor((c) => {
        const next = c + dt * speed;
        if (next >= endTs) {
          if (loop) {
            lastFrameRef.current = 0;
            return startTs;
          }
          setPlaying(false);
          return endTs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    },
    [endTs, loop, speed, startTs],
  );

  useEffect(() => {
    if (!playing || !open) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = 0;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, open, tick]);

  const step = useCallback(
    (direction: -1 | 1) => {
      seek(stepReplayCursor(timeline, cursor, direction, { startTs, endTs }));
    },
    [cursor, endTs, seek, startTs, timeline],
  );

  const jumpPhase = useCallback(
    (direction: -1 | 1) => {
      const target =
        direction > 0
          ? nextPhaseCursor(timeline, cursor, markers)
          : prevPhaseCursor(timeline, cursor, markers);
      if (target != null) seek(target);
    },
    [cursor, markers, seek, timeline],
  );

  const cycleSpeed = useCallback((delta: number) => {
    setSpeed((current) => {
      const idx = REPLAY_SPEEDS.indexOf(current);
      const next = Math.min(REPLAY_SPEEDS.length - 1, Math.max(0, idx + delta));
      return REPLAY_SPEEDS[next] ?? current;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) jumpPhase(1);
        else step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) jumpPhase(-1);
        else step(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        jumpPhase(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        jumpPhase(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        seek(startTs);
      } else if (e.key === "End") {
        e.preventDefault();
        seek(endTs);
      } else if (e.key === "[" || e.key === "{") {
        e.preventDefault();
        cycleSpeed(-1);
      } else if (e.key === "]" || e.key === "}") {
        e.preventDefault();
        cycleSpeed(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleSpeed, endTs, jumpPhase, open, seek, startTs, step]);

  const visibleEvents = useMemo(() => {
    const upTo = eventsUpTo(timeline, cursor);
    if (phaseFilter === "all") return upTo;
    return upTo.filter((e) => e.phase === phaseFilter);
  }, [cursor, phaseFilter, timeline]);

  const currentEvent = visibleEvents[visibleEvents.length - 1];
  const doneCount = snapshot ? countDoneAt(snapshot) : 0;
  const spark = useMemo(() => doneSparkline(timeline, roomIds), [timeline, roomIds]);

  return {
    cursor,
    playing,
    speed,
    loop,
    phaseFilter,
    markers,
    snapshot,
    visibleEvents,
    currentEvent,
    doneCount,
    spark,
    setPlaying,
    setSpeed,
    setLoop,
    setPhaseFilter,
    seek,
    step,
    jumpPhase,
    cycleSpeed,
  };
}
