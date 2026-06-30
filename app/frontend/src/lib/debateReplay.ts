import type { FloorPost } from "./floorSocial/types";
import type { ShiftReplayArchive } from "./userData/types";
import type { DebateLine, DebatePhaseMarker, DebateRound, RoomState } from "./types";

export type DebatePhaseKind = DebatePhaseMarker["kind"];

export interface DebatePhaseSegment {
  kind: DebatePhaseKind;
  lineStart: number;
  lineEnd: number;
  label: string;
}

export interface DebatePlaybackModel {
  round: DebateRound;
  lines: DebateLine[];
  lineCount: number;
  phases: DebatePhaseSegment[];
  synthesized: boolean;
  hasWallClock: boolean;
  lineDurationMs: number[];
}

export interface DebateReplaySource {
  room?: RoomState | null;
  payloadRounds?: DebateRound[] | null;
  archive?: ShiftReplayArchive | null;
  post?: FloorPost | null;
}

const PHASE_LABELS: Record<DebatePhaseKind, string> = {
  opening: "Opening",
  floor_open: "Floor open",
  chair: "Chair",
  crossfire: "Crossfire",
  verdict: "Verdict",
};

const SYNTH_LINE_MS = 1100;

/** Flatten debate rounds from a post snapshot (one round per ticker entry). */
export function debateRoundsFromSnapshot(post: FloorPost): DebateRound[] {
  const out: DebateRound[] = [];
  for (const t of post.snapshot.tickers) {
    for (const r of t.debateRounds ?? []) {
      out.push(r);
    }
  }
  return out;
}

/** Resolve debate rounds from room state, archive bundle, or post snapshot. */
export function resolveDebateRounds(source: DebateReplaySource): DebateRound[] {
  if (source.archive?.debate?.rounds?.length) {
    return source.archive.debate.rounds;
  }
  if (source.payloadRounds?.length) return source.payloadRounds;
  if (source.room?.debateRounds?.length) return source.room.debateRounds;
  if (source.post) return debateRoundsFromSnapshot(source.post);
  return [];
}

export function hasDebateContent(rounds: DebateRound[]): boolean {
  return rounds.some((r) => (r.lines?.length ?? 0) > 0 || Boolean(r.summary));
}

function inferPhaseKind(line: DebateLine, index: number, lines: DebateLine[]): DebatePhaseKind {
  if (line.side === "chair" || line.mode === "chair_consult") return "chair";
  if (line.mode === "crossfire" || line.mode === "one_v_two") return "crossfire";
  if (line.mode === "opening" || index === 0) return "opening";
  const prev = lines[index - 1];
  if (prev?.side === "chair") return "crossfire";
  return "opening";
}

function lineIndexForPhaseMarker(
  marker: DebatePhaseMarker,
  lines: DebateLine[],
): number {
  const target = marker.started_at;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  lines.forEach((line, i) => {
    if (line.ts == null) return;
    const d = Math.abs(line.ts - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  });
  return best;
}

/** Build phase segments for the chair timeline strip. */
export function buildChairTimelineSegments(round: DebateRound | null): DebatePhaseSegment[] {
  if (!round) return [];
  const lines = round.lines ?? [];
  if (!lines.length && !round.summary) return [];

  if (round.phases?.length) {
    const segments: DebatePhaseSegment[] = [];
    for (const p of round.phases) {
      const start = lineIndexForPhaseMarker(p, lines);
      const next = round.phases.find((x) => x.started_at > p.started_at);
      const end =
        next != null
          ? Math.max(start, lineIndexForPhaseMarker(next, lines) - 1)
          : Math.max(start, lines.length - 1);
      segments.push({
        kind: p.kind,
        lineStart: start,
        lineEnd: end,
        label: p.label ?? PHASE_LABELS[p.kind],
      });
    }
    if (round.summary) {
      segments.push({
        kind: "verdict",
        lineStart: lines.length,
        lineEnd: lines.length,
        label: PHASE_LABELS.verdict,
      });
    }
    return segments;
  }

  const segments: DebatePhaseSegment[] = [];
  let current: DebatePhaseSegment | null = null;

  lines.forEach((line, i) => {
    const kind = inferPhaseKind(line, i, lines);
    if (!current || current.kind !== kind) {
      if (current) segments.push(current);
      current = {
        kind,
        lineStart: i,
        lineEnd: i,
        label: PHASE_LABELS[kind],
      };
    } else {
      current.lineEnd = i;
    }
  });
  if (current) segments.push(current);

  if (round.chair_interjections?.length) {
    for (const inj of round.chair_interjections) {
      const idx = lines.findIndex(
        (l) => l.side === "chair" && l.text === inj.text && Math.abs((l.ts ?? 0) - inj.at) < 5000,
      );
      if (idx >= 0) {
        const seg = segments.find((s) => s.kind === "chair" && idx >= s.lineStart && idx <= s.lineEnd);
        if (seg) seg.label = inj.chair_name ? `${inj.chair_name}` : seg.label;
      }
    }
  }

  if (round.summary) {
    segments.push({
      kind: "verdict",
      lineStart: lines.length,
      lineEnd: lines.length,
      label: PHASE_LABELS.verdict,
    });
  }

  return segments;
}

function stampSyntheticTimestamps(lines: DebateLine[], baseMs: number): DebateLine[] {
  return lines.map((line, i) => ({
    ...line,
    ts: line.ts ?? baseMs + i * SYNTH_LINE_MS,
  }));
}

/** Playback model for a single round — line-index scrubber with optional wall-clock timing. */
export function buildDebatePlaybackModel(
  round: DebateRound,
  opts?: { synthesized?: boolean; baseMs?: number },
): DebatePlaybackModel {
  const raw = round.lines ?? [];
  const hasWallClock = raw.length > 0 && raw.every((l) => l.ts != null && l.ts > 0);
  const synthesized = opts?.synthesized ?? !hasWallClock;
  const baseMs = opts?.baseMs ?? round.started_at ?? Date.now();
  const lines = synthesized && !hasWallClock ? stampSyntheticTimestamps(raw, baseMs) : [...raw];

  const lineDurationMs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]!;
    const next = lines[i + 1];
    if (next?.ts != null && cur.ts != null) {
      lineDurationMs.push(Math.max(220, next.ts - cur.ts));
    } else {
      lineDurationMs.push(SYNTH_LINE_MS);
    }
  }

  return {
    round,
    lines,
    lineCount: lines.length,
    phases: buildChairTimelineSegments({ ...round, lines }),
    synthesized,
    hasWallClock: hasWallClock && !synthesized,
    lineDurationMs,
  };
}

/** True when the round has a summary verdict pseudo-step after the last spoken line. */
export function hasVerdictSlot(model: DebatePlaybackModel): boolean {
  return Boolean(model.round.summary);
}

/** Highest seekable line index — includes verdict slot at `lineCount` when present. */
export function playbackMaxLineIndex(model: DebatePlaybackModel): number {
  const lastSpoken = Math.max(0, model.lineCount - 1);
  return hasVerdictSlot(model) ? model.lineCount : lastSpoken;
}

/** Map normalized progress 0–1 to line index (includes verdict slot). */
export function lineAtProgress(model: DebatePlaybackModel, progress: number): number {
  const maxIdx = playbackMaxLineIndex(model);
  if (maxIdx <= 0) return 0;
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(maxIdx, Math.round(p * maxIdx));
}

export function progressAtLine(model: DebatePlaybackModel, lineIndex: number): number {
  const maxIdx = playbackMaxLineIndex(model);
  if (maxIdx <= 0) return 0;
  return Math.min(1, Math.max(0, lineIndex / maxIdx));
}

export function phaseSegmentAtLine(
  segments: DebatePhaseSegment[],
  lineIndex: number,
): DebatePhaseSegment | undefined {
  return segments.find((s) => lineIndex >= s.lineStart && lineIndex <= s.lineEnd);
}

export function nextPhaseLine(segments: DebatePhaseSegment[], lineIndex: number): number | null {
  const seg = phaseSegmentAtLine(segments, lineIndex);
  const idx = seg ? segments.indexOf(seg) + 1 : 0;
  if (idx >= segments.length) return null;
  return segments[idx]!.lineStart;
}

export function prevPhaseLine(segments: DebatePhaseSegment[], lineIndex: number): number | null {
  const seg = phaseSegmentAtLine(segments, lineIndex);
  const idx = (seg ? segments.indexOf(seg) : segments.length) - 1;
  if (idx < 0) return null;
  return segments[idx]!.lineStart;
}

export const DEBATE_PHASE_COLORS: Record<DebatePhaseKind, string> = {
  opening: "#6b9fd4",
  floor_open: "#e3b24b",
  chair: "#c9a227",
  crossfire: "#ff7a5c",
  verdict: "#2fd08a",
};
