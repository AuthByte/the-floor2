import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDebatePlaybackModel,
  hasVerdictSlot,
  lineAtProgress,
  nextPhaseLine,
  playbackMaxLineIndex,
  prevPhaseLine,
  progressAtLine,
  type DebatePlaybackModel,
} from "../lib/debateReplay";
import { REPLAY_SPEEDS, type ReplaySpeed } from "../lib/shiftReplay";
import type { DebateRound } from "../lib/types";

export interface DebateReplayPlaybackOptions {
  open: boolean;
  round: DebateRound | null;
  synthesized?: boolean;
  onLineChange?: (lineIndex: number) => void;
}

export function useDebateReplayPlayback({
  open,
  round,
  synthesized = false,
  onLineChange,
}: DebateReplayPlaybackOptions) {
  const model = useMemo(
    () => (round ? buildDebatePlaybackModel(round, { synthesized }) : null),
    [round, synthesized],
  );

  const [lineIndex, setLineIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(4);
  const rafRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lineIndexRef = useRef(0);

  useEffect(() => {
    lineIndexRef.current = lineIndex;
  }, [lineIndex]);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setLineIndex(0);
      return;
    }
    setLineIndex(0);
    setPlaying(false);
  }, [open, round?.ticker, model?.lineCount]);

  useEffect(() => {
    onLineChange?.(lineIndex);
  }, [lineIndex, onLineChange]);

  const maxIndex = model ? playbackMaxLineIndex(model) : 0;
  const atVerdict = model != null && hasVerdictSlot(model) && lineIndex >= model.lineCount;

  const seekLine = useCallback(
    (idx: number, opts?: { pause?: boolean }) => {
      if (opts?.pause !== false) setPlaying(false);
      accumRef.current = 0;
      setLineIndex(Math.min(maxIndex, Math.max(0, idx)));
    },
    [maxIndex],
  );

  const seekProgress = useCallback(
    (progress: number) => {
      if (!model) return;
      seekLine(lineAtProgress(model, progress));
    },
    [model, seekLine],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      seekLine(lineIndex + dir);
    },
    [lineIndex, seekLine],
  );

  const jumpVerdict = useCallback(() => {
    if (!model || !hasVerdictSlot(model)) {
      seekLine(maxIndex);
      return;
    }
    seekLine(model.lineCount);
  }, [maxIndex, model, seekLine]);

  const jumpPhase = useCallback(
    (dir: -1 | 1) => {
      if (!model) return;
      const target =
        dir > 0 ? nextPhaseLine(model.phases, lineIndex) : prevPhaseLine(model.phases, lineIndex);
      if (target != null) seekLine(target);
    },
    [lineIndex, model, seekLine],
  );

  const tick = useCallback(
    (now: number) => {
      if (!model || model.lineCount <= 0) return;
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      accumRef.current += dt * speed;

      const cur = lineIndexRef.current;
      const duration = model.lineDurationMs[cur] ?? 1100;
      if (accumRef.current >= duration) {
        accumRef.current = 0;
        if (cur >= maxIndex) {
          setPlaying(false);
        } else {
          setLineIndex(cur + 1);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [maxIndex, model, speed],
  );

  useEffect(() => {
    if (!playing || !open || !model) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = 0;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, open, model, tick]);

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
      } else if (e.key === "End" || e.key === "v") {
        e.preventDefault();
        jumpVerdict();
      } else if (e.key === "Home") {
        e.preventDefault();
        seekLine(0);
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
  }, [cycleSpeed, jumpPhase, jumpVerdict, open, seekLine, step]);

  const progress = model ? progressAtLine(model, lineIndex) : 0;

  return {
    model,
    lineIndex,
    playing,
    speed,
    progress,
    atVerdict,
    maxIndex,
    setPlaying,
    setSpeed,
    seekLine,
    seekProgress,
    step,
    jumpVerdict,
    jumpPhase,
    cycleSpeed,
  };
}

export type { DebatePlaybackModel };
