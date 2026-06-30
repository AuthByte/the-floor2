import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NAMED_ANALYSTS } from "../lib/agents";
import { postDebateInterjection } from "../lib/api";
import { buildChairTimelineSegments } from "../lib/debateReplay";
import { useDebateReplayPlayback } from "../hooks/useDebateReplayPlayback";
import { ROOM_ASSETS } from "../lib/roomAssets";
import type { DebateLine, DebateMatchup, DebateRound, DebateSide, RoomState, RunState } from "../lib/types";
import { DebateChairTimeline } from "./DebateChairTimeline";
import { DebateReplayTransport } from "./DebateReplayTransport";
import { InvestorAvatar } from "./InvestorAvatar";

type AppTheme = "light" | "dark";
export type DebateTheaterMode = "live" | "replay";

const TRANSCRIPT_WINDOW = 72;

interface Props {
  state: RoomState;
  open: boolean;
  onClose: () => void;
  theme?: AppTheme;
  runState?: RunState;
  shiftRunId?: string | null;
  chairName?: string;
  mode?: DebateTheaterMode;
  replayRounds?: DebateRound[] | null;
  synthesized?: boolean;
}

interface TheaterPalette {
  panelBg: string;
  panelBorder: string;
  text: string;
  mute: string;
  faint: string;
  brass: string;
  bull: string;
  bear: string;
  hair: string;
  glassBg: string;
  glassBorder: string;
}

function theaterPalette(theme: AppTheme): TheaterPalette {
  if (theme === "light") {
    return {
      panelBg: "rgba(252,250,245,0.98)",
      panelBorder: "rgba(180,170,150,0.55)",
      text: "#1a1814",
      mute: "#5c574d",
      faint: "#8a8478",
      brass: "#9a6b1a",
      bull: "#1a7a52",
      bear: "#c44a32",
      hair: "rgba(26,24,20,0.12)",
      glassBg: "rgba(255,255,255,0.92)",
      glassBorder: "rgba(154,107,26,0.28)",
    };
  }
  return {
    panelBg: "rgba(14,13,10,0.98)",
    panelBorder: "rgba(227,178,75,0.32)",
    text: "#f2efe7",
    mute: "#b8b4a8",
    faint: "#8f8b80",
    brass: "#e3b24b",
    bull: "#2fd08a",
    bear: "#ff7a5c",
    hair: "rgba(242,239,231,0.1)",
    glassBg: "rgba(22,20,15,0.94)",
    glassBorder: "rgba(227,178,75,0.22)",
  };
}

export function DebateTheater({
  state,
  open,
  onClose,
  theme = "dark",
  runState = "idle",
  shiftRunId = null,
  chairName = "Chair",
  mode = "live",
  replayRounds = null,
  synthesized = false,
}: Props) {
  const pal = theaterPalette(theme);
  const isReplay = mode === "replay";
  const [autoFollow, setAutoFollow] = useState(true);
  const [pinRound, setPinRound] = useState(false);
  const [showRoster, setShowRoster] = useState(false);

  const rounds = useMemo(
    () => (isReplay && replayRounds?.length ? replayRounds : state.debateRounds ?? []),
    [isReplay, replayRounds, state.debateRounds],
  );

  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeRoundIdx = useMemo(() => {
    if (rounds.length === 0) return -1;
    if (isReplay) return rounds.length - 1;
    const t = state.activeDebateTicker;
    if (!t) return rounds.length - 1;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i]!.ticker === t) return i;
    }
    return rounds.length - 1;
  }, [rounds, state.activeDebateTicker, isReplay]);

  const [selectedRoundIdx, setSelectedRoundIdx] = useState<number>(-1);

  const nameToAgent = useMemo(() => {
    const m = new Map<string, (typeof NAMED_ANALYSTS)[number]>();
    for (const a of NAMED_ANALYSTS) m.set(a.name, a);
    return m;
  }, []);

  useEffect(() => {
    if (!open) return;
    if (rounds.length === 0) {
      setSelectedRoundIdx(-1);
      return;
    }
    setSelectedRoundIdx((prev) => {
      if (isReplay) return prev < 0 || prev >= rounds.length ? 0 : prev;
      if (pinRound && prev >= 0 && prev < rounds.length) return prev;
      if (prev < 0 || prev >= rounds.length) return activeRoundIdx;
      return prev;
    });
  }, [open, rounds.length, activeRoundIdx, isReplay, pinRound]);

  const round =
    selectedRoundIdx >= 0 && selectedRoundIdx < rounds.length ? rounds[selectedRoundIdx]! : null;

  const replayPlayback = useDebateReplayPlayback({
    open: open && isReplay,
    round,
    synthesized,
  });

  const liveFeed = useMemo(
    () => round?.lines ?? state.debateFeed ?? [],
    [round?.lines, state.debateFeed],
  );

  const feed = useMemo(() => {
    if (!isReplay) return liveFeed;
    const model = replayPlayback.model;
    if (!model?.lines.length) return [];
    const end = Math.min(replayPlayback.lineIndex + 1, model.lines.length);
    return model.lines.slice(0, end);
  }, [isReplay, liveFeed, replayPlayback.model, replayPlayback.lineIndex]);

  const chairSegments = useMemo(() => buildChairTimelineSegments(round), [round]);

  const activeSpeaker = useMemo(() => feed[feed.length - 1]?.name ?? null, [feed]);

  const displayFeed = useMemo(() => {
    if (feed.length <= TRANSCRIPT_WINDOW) return { lines: feed, hidden: 0, offset: 0 };
    const offset = feed.length - TRANSCRIPT_WINDOW;
    return { lines: feed.slice(offset), hidden: offset, offset };
  }, [feed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const scrollTranscript = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open) return;
    if (isReplay || autoFollow) scrollTranscript();
  }, [feed.length, isReplay, autoFollow, replayPlayback.lineIndex, open, scrollTranscript]);

  const scrollToLine = useCallback((lineIndex: number) => {
    const el = transcriptRef.current;
    if (!el) return;
    const item = el.querySelector(`[data-line-idx="${lineIndex}"]`);
    if (item instanceof HTMLElement) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!isReplay) return;
    scrollToLine(replayPlayback.lineIndex);
  }, [isReplay, replayPlayback.lineIndex, scrollToLine]);

  const [nowTs, setNowTs] = useState(() => Date.now());
  const live = !isReplay && state.status === "WORKING" && selectedRoundIdx === activeRoundIdx;
  useEffect(() => {
    if (!open || !live) return;
    const id = setInterval(() => setNowTs(Date.now()), 5000);
    return () => clearInterval(id);
  }, [open, live]);

  if (!open) return null;

  const active = !isReplay && state.status === "WORKING";
  const matchups = round?.matchups ?? [];
  const startTs = feed[0]?.ts ?? null;
  const elapsed = startTs
    ? Math.max(0, (live ? nowTs : feed[feed.length - 1]?.ts ?? startTs) - startTs)
    : 0;
  const verdictReady = Boolean(round?.summary);
  const showVerdictFooter = isReplay ? replayPlayback.atVerdict : verdictReady;
  const floorOpen =
    !isReplay &&
    live &&
    /floor open/i.test(state.message ?? "") &&
    runState === "running" &&
    Boolean(shiftRunId) &&
    Boolean(round?.ticker ?? state.activeDebateTicker ?? state.ticker);
  const highlightLineIdx = isReplay ? replayPlayback.lineIndex : feed.length - 1;

  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col overflow-hidden"
      role="dialog"
      aria-label="Argument room"
      style={{
        background: pal.panelBg,
        border: `1px solid ${pal.panelBorder}`,
        color: pal.text,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(65% 50% at 8% 0%, rgba(227,178,75,0.1), transparent 55%), radial-gradient(40% 35% at 100% 100%, rgba(47,208,138,0.04), transparent 50%)",
        }}
      />

      <header
        className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4"
        style={{ borderBottom: `1px solid ${pal.hair}` }}
      >
        <div className="min-w-0 flex-1 font-mono">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold tracking-[0.14em] sm:text-[12px]">
              {round?.ticker ?? state.ticker ?? "—"}
            </span>
            <span className="text-[9px] tracking-[0.18em]" style={{ color: pal.faint }}>
              ROUND {selectedRoundIdx >= 0 ? selectedRoundIdx + 1 : rounds.length || 1}
              {rounds.length > 1 ? ` / ${rounds.length}` : ""}
            </span>
            {active ? (
              <span className="truncate text-[9px] tracking-[0.06em]" style={{ color: pal.mute }}>
                {state.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[9px] tracking-[0.14em]">
          <StatusPill
            live={live}
            isReplay={isReplay}
            verdictReady={verdictReady}
            pal={pal}
          />
          <span className="tabular-nums" style={{ color: pal.mute }}>
            {formatElapsed(elapsed)}
          </span>
          {!isReplay ? (
            <>
              <ToggleChip
                active={autoFollow}
                label={autoFollow ? "LIVE" : "FREE"}
                onClick={() => setAutoFollow((v) => !v)}
                pal={pal}
                title="Auto-scroll transcript"
              />
              {rounds.length > 1 ? (
                <ToggleChip
                  active={pinRound}
                  label={pinRound ? "PIN" : "AUTO"}
                  onClick={() => setPinRound((v) => !v)}
                  pal={pal}
                  title="Pin round during live shift"
                />
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowRoster((v) => !v)}
            className="rounded-[2px] px-1.5 py-0.5"
            style={{
              border: `1px solid ${showRoster ? `${pal.brass}88` : pal.hair}`,
              color: showRoster ? pal.brass : pal.faint,
            }}
          >
            ROSTER
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close argument room"
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-base leading-none"
            style={{ border: `1px solid ${pal.hair}`, color: pal.mute }}
          >
            ×
          </button>
        </div>
      </header>

      {rounds.length > 1 ? (
        <RoundPillRail
          rounds={rounds}
          selectedIdx={selectedRoundIdx}
          activeIdx={activeRoundIdx}
          active={active}
          pal={pal}
          onSelect={setSelectedRoundIdx}
        />
      ) : null}

      {round ? (
        <SpotlightStrip
          round={round}
          matchups={matchups}
          activeSpeaker={activeSpeaker}
          nameToAgent={nameToAgent}
          pal={pal}
        />
      ) : (
        <p className="shrink-0 px-4 py-2 font-mono text-[10px]" style={{ color: pal.faint }}>
          Pairing debaters…
        </p>
      )}

      {showRoster && round ? (
        <RosterDrawer round={round} activeSpeaker={activeSpeaker} nameToAgent={nameToAgent} pal={pal} />
      ) : null}

      <DebateChairTimeline
        segments={chairSegments}
        activeLineIndex={highlightLineIdx}
        liveFloorOpen={floorOpen}
        onSeekLine={(idx) => {
          if (isReplay) replayPlayback.seekLine(idx);
          else scrollToLine(idx);
        }}
        pal={pal}
      />

      <div
        className="flex shrink-0 items-center justify-between px-4 py-1 font-mono text-[8px] tracking-[0.2em]"
        style={{ color: pal.faint, borderBottom: `1px solid ${pal.hair}` }}
      >
        <span>TRANSCRIPT</span>
        <span className="tabular-nums">
          {feed.length} line{feed.length === 1 ? "" : "s"}
          {displayFeed.hidden > 0 ? ` · +${displayFeed.hidden} earlier` : ""}
        </span>
      </div>

      <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 sm:px-4">
        {feed.length === 0 ? (
          <p className="font-mono text-[10px] tracking-[0.16em]" style={{ color: pal.faint }}>
            Calling the room to order
            <span className="debate-cursor">_</span>
          </p>
        ) : (
          <ul className="space-y-1.5">
            {displayFeed.hidden > 0 ? (
              <li
                className="rounded-[2px] px-2 py-1 text-center font-mono text-[8px] tracking-[0.12em]"
                style={{ color: pal.faint, border: `1px dashed ${pal.hair}` }}
              >
                {displayFeed.hidden} earlier lines collapsed for speed
              </li>
            ) : null}
            {displayFeed.lines.map((line, i) => {
              const lineIdx = displayFeed.offset + i;
              return (
                <TranscriptLine
                  key={`${line.name}-${line.ts ?? 0}-${lineIdx}`}
                  line={line}
                  lineIdx={lineIdx}
                  agent={nameToAgent.get(line.name)}
                  latest={lineIdx === highlightLineIdx}
                  principal={line.mode === "crossfire"}
                  pal={pal}
                />
              );
            })}
          </ul>
        )}
      </div>

      {isReplay ? (
        <DebateReplayTransport
          lineIndex={replayPlayback.lineIndex}
          lineCount={replayPlayback.model?.lineCount ?? 0}
          progress={replayPlayback.progress}
          playing={replayPlayback.playing}
          speed={replayPlayback.speed}
          synthesized={synthesized || replayPlayback.model?.synthesized}
          atVerdict={replayPlayback.atVerdict}
          pal={pal}
          onTogglePlay={() => replayPlayback.setPlaying((p) => !p)}
          onStep={replayPlayback.step}
          onSeekProgress={replayPlayback.seekProgress}
          onSpeed={replayPlayback.setSpeed}
          onJumpVerdict={replayPlayback.jumpVerdict}
          onJumpPhase={replayPlayback.jumpPhase}
          onRewind={() => replayPlayback.seekLine(0)}
        />
      ) : (
        <ChairFloorBar
          visible={floorOpen}
          ticker={round?.ticker ?? state.activeDebateTicker ?? state.ticker ?? ""}
          runId={shiftRunId}
          chairName={chairName}
          pal={pal}
        />
      )}

      <VerdictFooter round={round} show={showVerdictFooter} pal={pal} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

function StatusPill({
  live,
  isReplay,
  verdictReady,
  pal,
}: {
  live: boolean;
  isReplay: boolean;
  verdictReady: boolean;
  pal: TheaterPalette;
}) {
  const label = live ? "LIVE" : isReplay ? "REPLAY" : verdictReady ? "CLOSED" : "STANDBY";
  const color = live ? pal.bull : isReplay ? pal.brass : pal.faint;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[2px] px-1.5 py-0.5" style={{ color }}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: color,
          animation: live ? "pulseDot 1.8s ease-in-out infinite" : undefined,
        }}
      />
      {label}
    </span>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
  pal,
  title,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  pal: TheaterPalette;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-[2px] px-1.5 py-0.5"
      style={{
        border: `1px solid ${active ? `${pal.brass}88` : pal.hair}`,
        color: active ? pal.brass : pal.faint,
      }}
    >
      {label}
    </button>
  );
}

function RoundPillRail({
  rounds,
  selectedIdx,
  activeIdx,
  active,
  pal,
  onSelect,
}: {
  rounds: DebateRound[];
  selectedIdx: number;
  activeIdx: number;
  active: boolean;
  pal: TheaterPalette;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className="flex shrink-0 gap-1 overflow-x-auto px-3 py-1.5"
      style={{ borderBottom: `1px solid ${pal.hair}` }}
    >
      {rounds.map((r, i) => {
        const selected = i === selectedIdx;
        const isLive = i === activeIdx && active;
        const done = Boolean(r.winner && r.summary);
        return (
          <button
            key={`${r.ticker}-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            className="shrink-0 rounded-[2px] px-2 py-1 font-mono text-[8px] tracking-[0.1em]"
            style={{
              border: `1px solid ${selected ? `${pal.brass}88` : pal.hair}`,
              color: selected ? pal.brass : pal.mute,
              background: selected ? `${pal.brass}10` : "transparent",
            }}
          >
            R{i + 1} {r.ticker}
            {isLive ? " · live" : done ? " · done" : ""}
          </button>
        );
      })}
    </div>
  );
}

function SpotlightStrip({
  round,
  matchups,
  activeSpeaker,
  nameToAgent,
  pal,
}: {
  round: DebateRound;
  matchups: DebateMatchup[];
  activeSpeaker: string | null;
  nameToAgent: Map<string, (typeof NAMED_ANALYSTS)[number]>;
  pal: TheaterPalette;
}) {
  const headline = matchups[0] ?? (round.left && round.right ? { bull: round.left, bear: round.right } : null);
  const count = round.participant_count ?? (round.cohorts
    ? (round.cohorts.bull?.length ?? 0) + (round.cohorts.bear?.length ?? 0) + (round.cohorts.neutral?.length ?? 0)
  : 2);

  return (
    <div className="shrink-0" style={{ borderBottom: `1px solid ${pal.hair}` }}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
        {headline ? (
          <>
            <SpotlightDebater
              side={headline.bull}
              agent={nameToAgent.get(headline.bull.name)}
              tone={pal.bull}
              align="left"
              speaking={activeSpeaker === headline.bull.name}
              pal={pal}
            />
            <div className="flex flex-col items-center justify-center px-1 font-mono">
              <span className="text-[7px] tracking-[0.22em]" style={{ color: pal.faint }}>
                VS
              </span>
              <span className="mt-0.5 text-[7px] tabular-nums" style={{ color: pal.mute }}>
                {count}
              </span>
            </div>
            <SpotlightDebater
              side={headline.bear}
              agent={nameToAgent.get(headline.bear.name)}
              tone={pal.bear}
              align="right"
              speaking={activeSpeaker === headline.bear.name}
              pal={pal}
            />
          </>
        ) : (
          <p className="col-span-3 font-mono text-[9px]" style={{ color: pal.faint }}>
            Awaiting headline matchup…
          </p>
        )}
      </div>

      {matchups.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 sm:px-4">
          {matchups.map((duel, idx) => {
            const hot = activeSpeaker === duel.bull.name || activeSpeaker === duel.bear.name;
            return (
              <span
                key={`${duel.bull.agent_id}-${idx}`}
                className="shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono text-[7px] tracking-[0.08em]"
                style={{
                  border: `1px solid ${hot ? `${pal.brass}88` : pal.hair}`,
                  color: hot ? pal.brass : pal.faint,
                }}
              >
                {duel.bull.name.split(" ").pop()} vs {duel.bear.name.split(" ").pop()}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const SpotlightDebater = memo(function SpotlightDebater({
  side,
  agent,
  tone,
  align,
  speaking,
  pal,
}: {
  side: DebateSide;
  agent?: (typeof NAMED_ANALYSTS)[number];
  tone: string;
  align: "left" | "right";
  speaking: boolean;
  pal: TheaterPalette;
}) {
  const conf = Math.round(Math.max(0, Math.min(100, side.confidence_after)));
  const last = side.name.split(" ").pop() ?? side.name;
  const signal = side.signal === "bullish" ? "BULL" : side.signal === "bearish" ? "BEAR" : "NEUT";

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
      style={{
        borderRadius: 3,
        padding: "4px 6px",
        border: `1px solid ${speaking ? `${pal.brass}99` : pal.hair}`,
        background: speaking ? `${tone}12` : pal.glassBg,
        transform: speaking ? "translateZ(0)" : undefined,
      }}
    >
      <InvestorAvatar
        agentKey={agent?.key ?? side.agent_id}
        name={side.name}
        accent={tone}
        size={28}
        speaking={speaking}
      />
      <div className="min-w-0 flex-1 font-mono">
        <p className="truncate text-[9px] font-semibold tracking-[0.1em]">{last.toUpperCase()}</p>
        <p className="text-[8px] tracking-[0.12em]" style={{ color: tone }}>
          {signal} · {conf}%
        </p>
        <div className={`mt-1 h-1 overflow-hidden rounded-full ${align === "right" ? "ml-auto" : ""}`} style={{ maxWidth: 88, background: `${pal.hair}` }}>
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${conf}%`, background: tone }}
          />
        </div>
      </div>
    </div>
  );
});

function RosterDrawer({
  round,
  activeSpeaker,
  nameToAgent,
  pal,
}: {
  round: DebateRound;
  activeSpeaker: string | null;
  nameToAgent: Map<string, (typeof NAMED_ANALYSTS)[number]>;
  pal: TheaterPalette;
}) {
  const groups = [
    { label: "BULL", tone: pal.bull, members: round.cohorts?.bull ?? (round.left?.signal === "bullish" ? [round.left] : []) },
    { label: "BEAR", tone: pal.bear, members: round.cohorts?.bear ?? (round.right?.signal === "bearish" ? [round.right] : []) },
    { label: "NEUT", tone: pal.brass, members: round.cohorts?.neutral ?? [] },
  ];

  return (
    <div
      className="shrink-0 px-3 py-2 sm:px-4"
      style={{ borderBottom: `1px solid ${pal.hair}`, background: `${pal.brass}06` }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 font-mono text-[7px] tracking-[0.2em]" style={{ color: g.tone }}>
              {g.label} · {g.members.length}
            </p>
            <div className="flex flex-wrap gap-1">
              {g.members.length === 0 ? (
                <span className="font-mono text-[8px]" style={{ color: pal.faint }}>
                  —
                </span>
              ) : (
                g.members.map((m) => (
                  <span
                    key={m.agent_id}
                    className="inline-flex items-center gap-1 rounded-[2px] px-1 py-0.5"
                    style={{
                      border: `1px solid ${activeSpeaker === m.name ? pal.brass : pal.hair}`,
                    }}
                  >
                    <InvestorAvatar
                      agentKey={nameToAgent.get(m.name)?.key ?? m.agent_id}
                      name={m.name}
                      accent={g.tone}
                      size={14}
                      speaking={activeSpeaker === m.name}
                    />
                    <span className="max-w-[64px] truncate font-mono text-[7px]" style={{ color: pal.mute }}>
                      {m.name.split(" ").pop()}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TranscriptLine = memo(function TranscriptLine({
  line,
  lineIdx,
  agent,
  latest,
  principal,
  pal,
}: {
  line: DebateLine;
  lineIdx: number;
  agent?: (typeof NAMED_ANALYSTS)[number];
  latest: boolean;
  principal: boolean;
  pal: TheaterPalette;
}) {
  const isChair = line.side === "chair";
  const isChairConsult = line.mode === "chair_consult";
  const isOpening = line.mode === "opening";
  const accent = isChair || isChairConsult ? pal.brass : isOpening ? pal.bull : stanceColor(line.signal, pal);

  return (
    <li
      data-line-idx={lineIdx}
      className={`flex gap-2 rounded-[2px] border px-2.5 py-1.5 sm:px-3 sm:py-2 ${latest ? "debate-line-latest" : ""}`}
      style={{
        borderColor: isChair || isChairConsult ? `${pal.brass}77` : pal.glassBorder,
        borderLeftWidth: isChairConsult ? 3 : 1,
        background: isChair || isChairConsult ? `${pal.brass}10` : isOpening ? `${pal.bull}06` : pal.glassBg,
        boxShadow: latest ? `inset 2px 0 0 ${accent}` : undefined,
      }}
    >
      {isChair ? (
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[8px] font-bold"
          style={{ border: `1px solid ${pal.brass}`, color: pal.brass }}
          aria-hidden
        >
          CH
        </div>
      ) : (
        <InvestorAvatar
          agentKey={agent?.key ?? line.name}
          name={line.name}
          accent={ROOM_ASSETS[agent?.key ?? ""]?.accent ?? accent}
          size={20}
          speaking={latest}
        />
      )}
      <div className="min-w-0 flex-1 font-mono">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[7px] font-semibold tracking-[0.1em]">
          <span style={{ color: latest ? pal.text : pal.mute }}>{line.name}</span>
          {line.signal ? (
            <span style={{ color: stanceColor(line.signal, pal) }}>{line.signal}</span>
          ) : null}
          <span style={{ color: principal ? pal.bear : pal.brass }}>
            {principal ? "crossfire" : "thesis"}
          </span>
          {line.mode && line.mode !== "opening" && line.mode !== "crossfire" ? (
            <span style={{ color: pal.faint }}>{line.mode.replace(/_/g, " ")}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug sm:text-[12px]" style={{ color: latest ? pal.text : pal.mute }}>
          {line.text}
        </p>
      </div>
    </li>
  );
});

function VerdictFooter({
  round,
  show,
  pal,
}: {
  round: DebateRound | null;
  show: boolean;
  pal: TheaterPalette;
}) {
  return (
    <div
      className="flex shrink-0 flex-col gap-1 px-4 py-2"
      style={{ borderTop: `1px solid ${pal.hair}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] transition-opacity duration-500"
          style={{
            border: `1px solid ${pal.brass}`,
            color: pal.brass,
            opacity: show ? 1 : 0.35,
          }}
        >
          {show ? (round?.winner_name ?? "DRAW").toUpperCase() : "VERDICT PENDING"}
        </span>
        {show && round?.summary ? (
          <span className="min-w-0 flex-1 truncate text-right font-mono text-[8px]" style={{ color: pal.faint }} title={round.summary}>
            {round.summary}
          </span>
        ) : null}
      </div>
      {show && round?.recap ? (
        <p className="line-clamp-2 font-mono text-[8px] leading-relaxed" style={{ color: pal.mute }} title={round.recap}>
          {round.recap}
        </p>
      ) : null}
    </div>
  );
}

function ChairFloorBar({
  visible,
  ticker,
  runId,
  chairName,
  pal,
}: {
  visible: boolean;
  ticker: string;
  runId: string | null;
  chairName: string;
  pal: TheaterPalette;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!visible) {
      setText("");
      setError(null);
      setSent(false);
    }
  }, [visible, ticker]);

  if (!visible || !runId || !ticker) return null;

  const submit = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      await postDebateInterjection({ run_id: runId, ticker, message, chair_name: chairName });
      setText("");
      setSent(true);
      window.setTimeout(() => setSent(false), 2400);
    } catch (err) {
      setError((err as Error).message || "Could not reach the chamber");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="shrink-0 px-4 py-2" style={{ borderTop: `1px solid ${pal.hair}`, background: `${pal.brass}08` }}>
      <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[8px] tracking-[0.18em]">
        <span style={{ color: pal.brass }}>FLOOR OPEN</span>
        {sent ? <span style={{ color: pal.bull }}>QUEUED</span> : null}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          maxLength={1200}
          placeholder={`${chairName}: challenge the committee on ${ticker}…`}
          className="min-h-[48px] flex-1 resize-none rounded-[2px] bg-transparent px-2 py-1.5 font-mono text-[11px] leading-snug outline-none"
          style={{ border: `1px solid ${pal.brass}44`, color: pal.text }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !text.trim()}
          className="shrink-0 self-end rounded-[2px] px-3 py-2 font-mono text-[9px] font-semibold tracking-[0.14em] disabled:opacity-40"
          style={{ border: `1px solid ${pal.brass}`, color: pal.brass, background: `${pal.brass}10` }}
        >
          {sending ? "…" : "SPEAK"}
        </button>
      </div>
      {error ? (
        <p className="mt-1 font-mono text-[9px]" style={{ color: pal.bear }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function stanceColor(signal: string | undefined, pal: TheaterPalette): string {
  if (signal === "bullish") return pal.bull;
  if (signal === "bearish") return pal.bear;
  return pal.brass;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
