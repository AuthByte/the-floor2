import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RoomState } from "../lib/types";
import type { LogLine } from "../lib/types";
import {
  buildShiftTimeline,
  countDoneAt,
  doneSparkline,
  eventsUpTo,
  formatReplayClock,
  PHASE_COLORS,
  snapshotAtTime,
  type ReplayEvent,
} from "../lib/shiftReplay";

interface Props {
  open: boolean;
  onClose: () => void;
  rooms: Record<string, RoomState>;
  log: LogLine[];
  shiftStartedAt: number | null;
  totalDesks: number;
  onTimeChange?: (ts: number) => void;
}

export function ShiftReplayPanel({
  open,
  onClose,
  rooms,
  log,
  shiftStartedAt,
  totalDesks,
  onTimeChange,
}: Props) {
  const roomIds = useMemo(() => Object.keys(rooms), [rooms]);
  const timeline = useMemo(() => {
    if (!shiftStartedAt) return [];
    return buildShiftTimeline(rooms, log, shiftStartedAt);
  }, [rooms, log, shiftStartedAt]);

  const startTs = timeline[0]?.ts ?? shiftStartedAt ?? Date.now();
  const endTs = timeline[timeline.length - 1]?.ts ?? startTs;

  const [cursor, setCursor] = useState(startTs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      return;
    }
    setCursor(startTs);
  }, [open, startTs]);

  useEffect(() => {
    onTimeChange?.(cursor);
  }, [cursor, onTimeChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tick = useCallback(
    (now: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      setCursor((c) => {
        const next = c + dt * speed;
        if (next >= endTs) {
          setPlaying(false);
          return endTs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    },
    [endTs, speed],
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

  const snapshot = useMemo(
    () => snapshotAtTime(timeline, cursor, roomIds),
    [timeline, cursor, roomIds],
  );
  const visibleEvents = useMemo(() => eventsUpTo(timeline, cursor), [timeline, cursor]);
  const currentEvent = visibleEvents[visibleEvents.length - 1];
  const doneCount = countDoneAt(snapshot);
  const spark = useMemo(() => doneSparkline(timeline, roomIds), [timeline, roomIds]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[46] flex items-end justify-center bg-ink-950/75 p-0 backdrop-blur-[4px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl animate-rise-in flex-col overflow-hidden border border-wire-800 bg-ink-950 shadow-float sm:rounded-lg"
        role="dialog"
        aria-labelledby="shift-replay-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-b border-wire-800 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
                time machine
              </p>
              <h2
                id="shift-replay-title"
                className="mt-0.5 font-display text-base font-bold tracking-wide text-wire-100"
              >
                Shift Replay
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-wire-700 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>
        </header>

        {!timeline.length ? (
          <p className="p-6 text-center text-[11px] text-wire-500">
            No replay data — run a shift first.
          </p>
        ) : (
          <>
            <div className="border-b border-wire-900 px-4 py-4 sm:px-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-2xl tabular-nums tracking-tight text-brass">
                    {formatReplayClock(cursor, startTs)}
                  </div>
                  <p className="mt-1 text-[10px] text-wire-500">
                    {doneCount}/{totalDesks} desks cleared
                  </p>
                </div>
                <Sparkline values={spark} cursorPct={(cursor - startTs) / (endTs - startTs || 1)} />
              </div>

              {currentEvent ? (
                <div className="mt-3 rounded border border-wire-800/80 bg-ink-900/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: PHASE_COLORS[currentEvent.phase] }}
                    >
                      [{currentEvent.callsign}]
                    </span>
                    {currentEvent.ticker ? (
                      <span className="font-mono text-[9px] text-wire-600">{currentEvent.ticker}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-wire-200">{currentEvent.label}</p>
                </div>
              ) : null}

              <input
                type="range"
                min={startTs}
                max={endTs}
                value={cursor}
                onChange={(e) => {
                  setPlaying(false);
                  setCursor(Number(e.target.value));
                }}
                className="mt-4 w-full accent-[rgb(var(--brass))]"
                aria-label="Replay timeline"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded border border-phos/40 bg-phos/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-phos hover:bg-phos/20"
                >
                  {playing ? "pause" : "play"}
                </button>
                {([1, 2, 4] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`rounded border px-2 py-1 font-mono text-[9px] ${
                      speed === s
                        ? "border-brass/50 text-brass"
                        : "border-wire-800 text-wire-500"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCursor(startTs);
                  }}
                  className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-300"
                >
                  rewind
                </button>
                <span className="ml-auto font-mono text-[9px] text-wire-600">
                  space to play · floor lights sync
                </span>
              </div>
            </div>

            <div className="max-h-[200px] overflow-y-auto px-4 py-3 sm:px-5">
              <EventFeed events={visibleEvents.slice(-40)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values, cursorPct }: { values: number[]; cursorPct: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 36;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const cx = Math.min(w, Math.max(0, cursorPct * w));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-[120px] shrink-0">
      <polyline points={pts} fill="none" stroke="#2fd08a" strokeWidth={1.5} strokeOpacity={0.7} />
      <line x1={cx} y1={0} x2={cx} y2={h} stroke="#e3b24b" strokeWidth={1} strokeOpacity={0.8} />
      <text x={0} y={h} fill="#6b7280" fontSize={6} fontFamily="monospace">
        conviction wave
      </text>
    </svg>
  );
}

function EventFeed({ events }: { events: ReplayEvent[] }) {
  return (
    <ul className="space-y-1 font-mono text-[9px] leading-relaxed">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="flex gap-2 text-wire-500">
          <span className="shrink-0 text-wire-600" style={{ color: PHASE_COLORS[e.phase] }}>
            {e.callsign}
          </span>
          <span className="min-w-0 truncate text-wire-400">{e.label}</span>
        </li>
      ))}
    </ul>
  );
}
