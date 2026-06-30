import {
  formatReplayClock,
  formatReplayDurationMs,
  PHASE_COLORS,
  PHASE_LABELS,
  REPLAY_SPEEDS,
  replayProgress,
  type PhaseMarker,
  type ReplayEvent,
  type ReplaySpeed,
} from "../lib/shiftReplay";

export interface ShiftReplayChromeProps {
  startTs: number;
  endTs: number;
  totalDesks: number;
  cursor: number;
  playing: boolean;
  speed: ReplaySpeed;
  loop: boolean;
  phaseFilter: ReplayEvent["phase"] | "all";
  markers: PhaseMarker[];
  currentEvent: ReplayEvent | undefined;
  doneCount: number;
  spark: number[];
  visibleEvents: ReplayEvent[];
  footerHint?: string;
  synthesized?: boolean;
  onSeek: (ts: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: ReplaySpeed) => void;
  onToggleLoop: () => void;
  onPhaseFilter: (phase: ReplayEvent["phase"] | "all") => void;
  onRewind: () => void;
  onStep: (dir: -1 | 1) => void;
  onJumpPhase: (dir: -1 | 1) => void;
}

export function ShiftReplayChrome({
  startTs,
  endTs,
  totalDesks,
  cursor,
  playing,
  speed,
  loop,
  phaseFilter,
  markers,
  currentEvent,
  doneCount,
  spark,
  visibleEvents,
  footerHint,
  synthesized,
  onSeek,
  onTogglePlay,
  onSpeed,
  onToggleLoop,
  onPhaseFilter,
  onRewind,
  onStep,
  onJumpPhase,
}: ShiftReplayChromeProps) {
  const progress = replayProgress(cursor, startTs, endTs);
  const durationMs = endTs - startTs;

  return (
    <>
      <div className="border-b border-wire-900 px-4 py-4 sm:px-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <div className="font-mono text-2xl tabular-nums tracking-tight text-brass">
                {formatReplayClock(cursor, startTs)}
              </div>
              <span className="font-mono text-[10px] text-wire-600">
                / {formatReplayDurationMs(durationMs)}
              </span>
              <span className="font-mono text-[10px] text-wire-700">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <p className="mt-1 text-[10px] text-wire-500">
              {doneCount}/{totalDesks} desks cleared
              {synthesized ? " · synthesized timeline" : ""}
            </p>
          </div>
          <ReplaySparkline values={spark} cursorPct={progress} />
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

        {markers.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {markers.map((m) => (
              <button
                key={m.phase}
                type="button"
                onClick={() => onSeek(m.ts)}
                className="rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] transition hover:border-brass/40"
                style={{ borderColor: `${PHASE_COLORS[m.phase]}44`, color: PHASE_COLORS[m.phase] }}
                title={`Jump to ${PHASE_LABELS[m.phase]}`}
              >
                {PHASE_LABELS[m.phase]}
              </button>
            ))}
          </div>
        ) : null}

        <input
          type="range"
          min={startTs}
          max={endTs}
          step={1}
          value={cursor}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="mt-4 w-full accent-[rgb(var(--brass))]"
          aria-label="Replay timeline"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onStep(-1)}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-200"
            title="Previous event"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="rounded border border-phos/40 bg-phos/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-phos hover:bg-phos/20"
          >
            {playing ? "pause" : "play"}
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-200"
            title="Next event"
          >
            ▶
          </button>

          <span className="mx-1 h-4 w-px bg-wire-800" aria-hidden />

          {REPLAY_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeed(s)}
              className={`rounded border px-2 py-1 font-mono text-[9px] ${
                speed === s ? "border-brass/50 text-brass" : "border-wire-800 text-wire-500"
              }`}
            >
              {s}x
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-wire-800" aria-hidden />

          <button
            type="button"
            onClick={onRewind}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-300"
          >
            start
          </button>
          <button
            type="button"
            onClick={() => onSeek(endTs)}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-300"
          >
            end
          </button>
          <button
            type="button"
            onClick={() => onJumpPhase(-1)}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-300"
          >
            phase −
          </button>
          <button
            type="button"
            onClick={() => onJumpPhase(1)}
            className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] text-wire-500 hover:text-wire-300"
          >
            phase +
          </button>
          <button
            type="button"
            onClick={onToggleLoop}
            className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
              loop
                ? "border-brass/50 bg-brass/10 text-brass"
                : "border-wire-800 text-wire-500 hover:text-wire-300"
            }`}
          >
            loop
          </button>

          <select
            value={phaseFilter}
            onChange={(e) => onPhaseFilter(e.target.value as ReplayEvent["phase"] | "all")}
            className="ml-auto rounded border border-wire-800 bg-ink-900 px-2 py-1 font-mono text-[9px] text-wire-400 outline-none"
            aria-label="Filter event feed by phase"
          >
            <option value="all">all phases</option>
            {(Object.keys(PHASE_LABELS) as ReplayEvent["phase"][]).map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {footerHint ? (
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-wire-600">{footerHint}</p>
        ) : null}
      </div>

      <div className="max-h-[220px] overflow-y-auto px-4 py-3 sm:px-5">
        <ReplayEventFeed events={visibleEvents.slice(-60)} onSelectEvent={(ts) => onSeek(ts)} />
      </div>
    </>
  );
}

function ReplaySparkline({ values, cursorPct }: { values: number[]; cursorPct: number }) {
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

function ReplayEventFeed({
  events,
  onSelectEvent,
}: {
  events: ReplayEvent[];
  onSelectEvent: (ts: number) => void;
}) {
  return (
    <ul className="space-y-0.5 font-mono text-[9px] leading-relaxed">
      {[...events].reverse().map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onSelectEvent(e.ts)}
            className="flex w-full gap-2 rounded px-1 py-0.5 text-left text-wire-500 transition hover:bg-ink-900/60 hover:text-wire-300"
          >
            <span className="shrink-0 tabular-nums text-wire-700">
              {new Date(e.ts).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <span className="shrink-0" style={{ color: PHASE_COLORS[e.phase] }}>
              {e.callsign}
            </span>
            <span className="min-w-0 truncate text-wire-400">{e.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
