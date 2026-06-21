import { useEffect, useMemo, useRef, useState } from "react";
import { NAMED_ANALYSTS } from "../lib/agents";
import { postDebateInterjection } from "../lib/api";
import { ROOM_ASSETS } from "../lib/roomAssets";
import type { DebateCohorts, DebateLine, DebateMatchup, DebateRound, DebateSide, RoomState, RunState } from "../lib/types";
import { InvestorAvatar } from "./InvestorAvatar";

type AppTheme = "light" | "dark";

interface Props {
  state: RoomState;
  open: boolean;
  onClose: () => void;
  theme?: AppTheme;
  runState?: RunState;
  shiftRunId?: string | null;
  chairName?: string;
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
      panelBg: "rgba(252,250,245,0.96)",
      panelBorder: "rgba(180,170,150,0.55)",
      text: "#1a1814",
      mute: "#5c574d",
      faint: "#8a8478",
      brass: "#9a6b1a",
      bull: "#1a7a52",
      bear: "#c44a32",
      hair: "rgba(26,24,20,0.12)",
      glassBg: "rgba(255,255,255,0.88)",
      glassBorder: "rgba(154,107,26,0.35)",
    };
  }
  return {
    panelBg: "rgba(18,16,9,0.96)",
    panelBorder: "rgba(227,178,75,0.38)",
    text: "#f2efe7",
    mute: "#b8b4a8",
    faint: "#8f8b80",
    brass: "#e3b24b",
    bull: "#2fd08a",
    bear: "#ff7a5c",
    hair: "rgba(242,239,231,0.11)",
    glassBg: "rgba(24,22,16,0.92)",
    glassBorder: "rgba(227,178,75,0.28)",
  };
}

/**
 * Full-bleed Argument Room theater — fills the floor column.
 * Principal debaters get scoreboard chips; joiners sit in a compact row.
 * Only the active speaker gets a pop animation when they take the floor.
 */

export function DebateTheater({
  state,
  open,
  onClose,
  theme = "dark",
  runState = "idle",
  shiftRunId = null,
  chairName = "Chair",
}: Props) {
  const pal = theaterPalette(theme);
  const ROOM_HAIR = pal.hair;
  const ROOM_MUTE = pal.mute;
  const ROOM_FAINT = pal.faint;
  const ROOM_BRASS = pal.brass;
  const ROOM_BULL = pal.bull;
  const ROOM_BEAR = pal.bear;
  const [popSpeaker, setPopSpeaker] = useState<string | null>(null);
  const rounds = useMemo(() => state.debateRounds ?? [], [state.debateRounds]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeRoundIdx = useMemo(() => {
    if (rounds.length === 0) return -1;
    const t = state.activeDebateTicker;
    if (!t) return rounds.length - 1;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i]!.ticker === t) return i;
    }
    return rounds.length - 1;
  }, [rounds, state.activeDebateTicker]);
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
      if (prev < 0 || prev >= rounds.length) return activeRoundIdx;
      return prev;
    });
  }, [open, rounds.length, activeRoundIdx]);

  const round =
    selectedRoundIdx >= 0 && selectedRoundIdx < rounds.length
      ? rounds[selectedRoundIdx]!
      : null;
  const feed = useMemo(
    () => round?.lines ?? state.debateFeed ?? [],
    [round?.lines, state.debateFeed],
  );

  const activeSpeaker = useMemo(() => {
    const last = feed[feed.length - 1];
    return last?.name ?? null;
  }, [feed]);

  useEffect(() => {
    if (!activeSpeaker) return;
    setPopSpeaker(activeSpeaker);
    const t = window.setTimeout(() => setPopSpeaker(null), 480);
    return () => window.clearTimeout(t);
  }, [activeSpeaker]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  const [nowTs, setNowTs] = useState(() => Date.now());
  const live = state.status === "WORKING" && selectedRoundIdx === activeRoundIdx;
  useEffect(() => {
    if (!open || !live) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, live]);

  if (!open) return null;

  const active = state.status === "WORKING";
  const left = round?.left;
  const right = round?.right;
  const changeRows = confidenceShiftRows(rounds, selectedRoundIdx);
  const matchups = round?.matchups ?? [];
  const cohorts = round?.cohorts;
  const startTs = feed[0]?.ts ?? null;
  const elapsed = startTs ? Math.max(0, (live ? nowTs : feed[feed.length - 1]?.ts ?? startTs) - startTs) : 0;
  const verdictReady = Boolean(round?.summary);
  const floorOpen =
    live &&
    /floor open/i.test(state.message ?? "") &&
    runState === "running" &&
    Boolean(shiftRunId) &&
    Boolean(round?.ticker ?? state.activeDebateTicker ?? state.ticker);

  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col overflow-hidden"
      role="dialog"
      aria-label="Argument room"
      style={{
        background: pal.panelBg,
        border: `1px solid ${pal.panelBorder}`,
        color: pal.text,
        backdropFilter: "blur(16px)",
      }}
    >
      {/* committee-room atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(70% 55% at 14% 12%, rgba(227,178,75,0.12), transparent 62%), radial-gradient(55% 45% at 92% 95%, rgba(227,178,75,0.06), transparent 60%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.05] mix-blend-soft-light" aria-hidden />

      {/* header */}
      <header
        className="relative flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-4"
        style={{ borderBottom: `1px solid ${ROOM_HAIR}` }}
      >
        <div className="min-w-0 font-mono">
          <div className="truncate text-[11px] font-semibold tracking-[0.16em] sm:text-[12px]">
            ARGUMENT ROOM · {round?.ticker ?? state.ticker ?? "—"} · R
            {selectedRoundIdx >= 0 ? selectedRoundIdx + 1 : rounds.length || 1}
            {active ? (
              <span className="ml-2 font-normal tracking-[0.04em]" style={{ color: ROOM_FAINT }}>
                · {state.message}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 font-mono text-[10px] tracking-[0.18em]" style={{ color: ROOM_MUTE }}>
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: live ? ROOM_BULL : ROOM_FAINT,
                animation: live ? "pulseDot 1.8s ease-in-out infinite" : undefined,
              }}
            />
            {live ? "LIVE" : verdictReady ? "ROUND OVER" : "REPLAY"}
          </span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close argument room"
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-base leading-none transition-colors"
            style={{ border: `1px solid ${ROOM_HAIR}`, color: ROOM_MUTE }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = ROOM_BRASS;
              e.currentTarget.style.borderColor = `${ROOM_BRASS}88`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ROOM_MUTE;
              e.currentTarget.style.borderColor = ROOM_HAIR;
            }}
          >
            ×
          </button>
        </div>
      </header>

      {rounds.length > 1 ? (
        <div
          className="flex shrink-0 gap-1 overflow-x-auto px-2 py-1.5 lg:hidden"
          style={{ borderBottom: `1px solid ${ROOM_HAIR}` }}
        >
          {rounds.map((r, i) => (
            <button
              key={`${r.ticker}-m-${i}`}
              type="button"
              onClick={() => setSelectedRoundIdx(i)}
              className="shrink-0 rounded-[2px] px-2 py-1 font-mono text-[8px] tracking-[0.1em]"
              style={{
                border: `1px solid ${i === selectedRoundIdx ? `${ROOM_BRASS}88` : ROOM_HAIR}`,
                color: i === selectedRoundIdx ? ROOM_BRASS : ROOM_MUTE,
                background: i === selectedRoundIdx ? "rgba(227,178,75,0.08)" : "transparent",
              }}
            >
              R{i + 1} · {r.ticker}
              {i === activeRoundIdx && active ? " ●" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {/* ---------- sidebar: rounds of the shift ---------- */}
        <aside
          className="hidden w-[168px] shrink-0 flex-col lg:flex xl:w-[220px]"
          style={{ borderRight: `1px solid ${ROOM_HAIR}` }}
        >
          <div
            className="px-2.5 py-1.5 font-mono text-[8px] tracking-[0.24em]"
            style={{ color: ROOM_FAINT, borderBottom: `1px solid ${ROOM_HAIR}` }}
          >
            ROUNDS
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {rounds.length === 0 ? (
              <p className="font-mono text-[10px]" style={{ color: ROOM_FAINT }}>
                No rounds yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {rounds.map((r, i) => (
                  <RoundCard
                    key={`${r.ticker}-${i}`}
                    round={r}
                    index={i}
                    selected={i === selectedRoundIdx}
                    live={i === activeRoundIdx && active}
                    pal={pal}
                    onSelect={() => setSelectedRoundIdx(i)}
                  />
                ))}
              </ul>
            )}

            {changeRows.length > 0 ? (
              <div className="mt-5">
                <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.24em]" style={{ color: ROOM_FAINT }}>
                  MOVED SINCE LAST ROUND
                </div>
                <ul className="space-y-1">
                  {changeRows.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-baseline justify-between gap-2 font-mono text-[9.5px]"
                    >
                      <span className="truncate" style={{ color: ROOM_MUTE }}>
                        {row.name}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ color: row.delta >= 0 ? ROOM_BULL : ROOM_BEAR }}
                      >
                        {Math.round(row.prev)}→{Math.round(row.now)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>

        {/* ---------- main column ---------- */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {round ? (
            <CommitteeBoard
              round={round}
              left={left}
              right={right}
              cohorts={cohorts}
              matchups={matchups}
              activeSpeaker={activeSpeaker}
              popSpeaker={popSpeaker}
              nameToAgent={nameToAgent}
              pal={pal}
            />
          ) : (
            <p className="shrink-0 px-4 py-2 font-mono text-[10px]" style={{ color: ROOM_FAINT }}>
              Pairing debaters…
            </p>
          )}

          <div
            className="flex shrink-0 items-center px-4 py-1.5 font-mono text-[8px] tracking-[0.22em]"
            style={{ color: ROOM_FAINT, borderBottom: `1px solid ${ROOM_HAIR}` }}
          >
            <span>TRANSCRIPT · {feed.length} LINE{feed.length === 1 ? "" : "S"}</span>
          </div>
          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          >
            {feed.length === 0 ? (
              <p className="font-mono text-[10.5px] tracking-[0.18em]" style={{ color: ROOM_FAINT }}>
                CALLING THE ROOM TO ORDER
                <span style={{ animation: "lp-blink 1.1s steps(1) infinite" }}>_</span>
              </p>
            ) : (
              <ul className="space-y-3">
                {feed.map((line, i) => (
                  <TranscriptLine
                    key={`${line.name}-${line.ts}-${i}`}
                    line={line}
                    agent={nameToAgent.get(line.name)}
                    latest={i === feed.length - 1}
                    principal={line.mode === "crossfire"}
                    pal={pal}
                  />
                ))}
              </ul>
            )}
          </div>

          <ChairFloorBar
            visible={floorOpen}
            ticker={round?.ticker ?? state.activeDebateTicker ?? state.ticker ?? ""}
            runId={shiftRunId}
            chairName={chairName}
            pal={pal}
          />

          <div
            className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5"
            style={{ borderTop: `1px solid ${ROOM_HAIR}` }}
          >
            <span
              className="inline-flex max-w-[70%] items-center gap-1.5 truncate rounded-[2px] px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] transition-all duration-700"
              style={{
                border: `1px solid ${ROOM_BRASS}`,
                color: ROOM_BRASS,
                opacity: verdictReady ? 1 : 0.35,
              }}
              title={round?.summary ?? undefined}
            >
              ⚖ {verdictReady ? (round?.winner_name ?? "DRAW").toUpperCase() : "VERDICT PENDING"}
            </span>
            {verdictReady && round?.summary ? (
              <span
                className="min-w-0 flex-1 truncate text-right font-mono text-[8.5px]"
                style={{ color: ROOM_FAINT }}
                title={round.summary}
              >
                {round.summary}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Committee layout                                                    */
/* ------------------------------------------------------------------ */

function CommitteeBoard({
  round,
  left,
  right,
  cohorts,
  matchups,
  activeSpeaker,
  popSpeaker,
  nameToAgent,
  pal,
}: {
  round: DebateRound;
  left?: DebateSide;
  right?: DebateSide;
  cohorts?: DebateCohorts;
  matchups: DebateMatchup[];
  activeSpeaker: string | null;
  popSpeaker: string | null;
  nameToAgent: Map<string, (typeof NAMED_ANALYSTS)[number]>;
  pal: TheaterPalette;
}) {
  const bulls = cohorts?.bull ?? (left?.signal === "bullish" ? [left] : []);
  const bears = cohorts?.bear ?? (right?.signal === "bearish" ? [right] : []);
  const neutrals = cohorts?.neutral ?? [];
  const count = round.participant_count ?? bulls.length + bears.length + neutrals.length;

  return (
    <div className="shrink-0" style={{ borderBottom: `1px solid ${pal.hair}` }}>
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 font-mono text-[8px] tracking-[0.2em]"
        style={{ color: pal.faint, borderBottom: `1px solid ${pal.hair}` }}
      >
        <span>
          COMMITTEE · {count} VOICES · {matchups.length || 1} DUEL
          {matchups.length === 1 ? "" : "S"}
        </span>
        {left && right ? (
          <span style={{ color: pal.brass }}>
            HEADLINE: {left.name.split(" ").pop()?.toUpperCase()} vs{" "}
            {right.name.split(" ").pop()?.toUpperCase()}
          </span>
        ) : null}
      </div>

      <div className="grid gap-0 sm:grid-cols-3" style={{ borderBottom: `1px solid ${pal.hair}` }}>
        <CohortColumn
          title="BULL SIDE"
          tone={pal.bull}
          members={bulls}
          activeSpeaker={activeSpeaker}
          popSpeaker={popSpeaker}
          nameToAgent={nameToAgent}
          pal={pal}
        />
        <CohortColumn
          title="BEAR SIDE"
          tone={pal.bear}
          members={bears}
          activeSpeaker={activeSpeaker}
          popSpeaker={popSpeaker}
          nameToAgent={nameToAgent}
          pal={pal}
        />
        <CohortColumn
          title="NEUTRAL"
          tone={pal.brass}
          members={neutrals}
          activeSpeaker={activeSpeaker}
          popSpeaker={popSpeaker}
          nameToAgent={nameToAgent}
          pal={pal}
        />
      </div>

      {matchups.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {matchups.map((duel, idx) => (
            <MatchupCard
              key={`${duel.bull.agent_id}-${duel.bear.agent_id}-${idx}`}
              duel={duel}
              index={idx}
              activeSpeaker={activeSpeaker}
              popSpeaker={popSpeaker}
              nameToAgent={nameToAgent}
              pal={pal}
            />
          ))}
        </div>
      ) : left && right ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
          <DuelChip
            debater={left}
            agent={nameToAgent.get(left.name)}
            speaking={activeSpeaker === left.name}
            popping={popSpeaker === left.name}
            barColor={stanceColor(left.signal, pal)}
            pal={pal}
          />
          <span className="px-1 font-mono text-[8px] tracking-[0.2em]" style={{ color: pal.faint }}>
            VS
          </span>
          <DuelChip
            debater={right}
            agent={nameToAgent.get(right.name)}
            speaking={activeSpeaker === right.name}
            popping={popSpeaker === right.name}
            barColor={stanceColor(right.signal, pal)}
            pal={pal}
            alignRight
          />
        </div>
      ) : null}
    </div>
  );
}

function CohortColumn({
  title,
  tone,
  members,
  activeSpeaker,
  popSpeaker,
  nameToAgent,
  pal,
}: {
  title: string;
  tone: string;
  members: DebateSide[];
  activeSpeaker: string | null;
  popSpeaker: string | null;
  nameToAgent: Map<string, (typeof NAMED_ANALYSTS)[number]>;
  pal: TheaterPalette;
}) {
  return (
    <div className="min-w-0 px-3 py-2" style={{ borderRight: `1px solid ${pal.hair}` }}>
      <div className="mb-1.5 font-mono text-[7px] tracking-[0.22em]" style={{ color: tone }}>
        {title} · {members.length}
      </div>
      <div className="flex flex-wrap gap-1">
        {members.length === 0 ? (
          <span className="font-mono text-[8px]" style={{ color: pal.faint }}>
            —
          </span>
        ) : (
          members.map((m) => {
            const agent = nameToAgent.get(m.name);
            const speaking = activeSpeaker === m.name;
            const popping = popSpeaker === m.name;
            return (
              <span
                key={m.agent_id}
                title={`${m.name} · ${Math.round(m.confidence_after)}%`}
                className="inline-flex items-center gap-1 rounded-[2px] px-1 py-0.5"
                style={{
                  border: `1px solid ${speaking ? pal.brass : pal.hair}`,
                  animation: popping
                    ? "theater-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both"
                    : undefined,
                }}
              >
                <InvestorAvatar
                  agentKey={agent?.key ?? m.agent_id}
                  name={m.name}
                  accent={tone}
                  size={14}
                  speaking={speaking}
                />
                <span className="max-w-[72px] truncate font-mono text-[7px]" style={{ color: pal.mute }}>
                  {m.name.split(" ").pop()}
                </span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function MatchupCard({
  duel,
  index,
  activeSpeaker,
  popSpeaker,
  nameToAgent,
  pal,
}: {
  duel: DebateMatchup;
  index: number;
  activeSpeaker: string | null;
  popSpeaker: string | null;
  nameToAgent: Map<string, (typeof NAMED_ANALYSTS)[number]>;
  pal: TheaterPalette;
}) {
  const bullSpeaking = activeSpeaker === duel.bull.name;
  const bearSpeaking = activeSpeaker === duel.bear.name;
  const active = bullSpeaking || bearSpeaking;

  return (
    <div
      className="shrink-0 rounded-[3px] px-2.5 py-2 font-mono"
      style={{
        border: `1px solid ${active ? `${pal.brass}88` : pal.hair}`,
        background: active ? `${pal.brass}10` : pal.glassBg,
        minWidth: 148,
      }}
    >
      <div className="mb-1 text-[7px] tracking-[0.2em]" style={{ color: pal.faint }}>
        DUEL {index + 1}
      </div>
      <div className="flex items-center justify-between gap-2">
        <MiniDebater
          side={duel.bull}
          agent={nameToAgent.get(duel.bull.name)}
          tone={pal.bull}
          speaking={bullSpeaking}
          popping={popSpeaker === duel.bull.name}
          pal={pal}
        />
        <span className="text-[7px]" style={{ color: pal.faint }}>
          vs
        </span>
        <MiniDebater
          side={duel.bear}
          agent={nameToAgent.get(duel.bear.name)}
          tone={pal.bear}
          speaking={bearSpeaking}
          popping={popSpeaker === duel.bear.name}
          pal={pal}
          alignRight
        />
      </div>
    </div>
  );
}

function MiniDebater({
  side,
  agent,
  tone,
  speaking,
  popping,
  pal,
  alignRight,
}: {
  side: DebateSide;
  agent?: (typeof NAMED_ANALYSTS)[number];
  tone: string;
  speaking: boolean;
  popping: boolean;
  pal: TheaterPalette;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-1 ${alignRight ? "flex-row-reverse text-right" : ""}`}
      style={{
        animation: popping ? "theater-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" : undefined,
        outline: speaking ? `1px solid ${pal.brass}` : undefined,
        outlineOffset: 1,
        borderRadius: 2,
      }}
    >
      <InvestorAvatar
        agentKey={agent?.key ?? side.agent_id}
        name={side.name}
        accent={tone}
        size={16}
        speaking={speaking}
      />
      <div className="min-w-0">
        <p className="truncate text-[7px] font-semibold tracking-[0.08em]">
          {side.name.split(" ").pop()?.toUpperCase()}
        </p>
        <p className="tabular-nums text-[8px]" style={{ color: tone }}>
          {Math.round(side.confidence_after)}%
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function stanceColor(signal: string, pal: TheaterPalette): string {
  if (signal === "bullish") return pal.bull;
  if (signal === "bearish") return pal.bear;
  return pal.brass;
}

function stanceLabel(signal: string): string {
  if (signal === "bullish") return "BULL CASE";
  if (signal === "bearish") return "BEAR CASE";
  return "NEUTRAL";
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
      await postDebateInterjection({
        run_id: runId,
        ticker,
        message,
        chair_name: chairName,
      });
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
    <div
      className="shrink-0 px-4 py-2"
      style={{
        borderTop: `1px solid ${pal.hair}`,
        background: `${pal.brass}10`,
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[8px] tracking-[0.2em]">
        <span style={{ color: pal.brass }}>FLOOR OPEN — TAKE THE CHAIR</span>
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
          className="min-h-[52px] flex-1 resize-none rounded-[2px] bg-transparent px-2 py-1.5 font-mono text-[11px] leading-snug outline-none"
          style={{ border: `1px solid ${pal.brass}55`, color: pal.text }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !text.trim()}
          className="shrink-0 self-end rounded-[2px] px-3 py-2 font-mono text-[9px] font-semibold tracking-[0.16em] transition-opacity disabled:opacity-40"
          style={{
            border: `1px solid ${pal.brass}`,
            color: pal.brass,
            background: `${pal.brass}12`,
          }}
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

/** Compact principal debater chip for the scoreboard strip. */
function DuelChip({
  debater,
  agent,
  speaking,
  popping,
  barColor,
  pal,
  alignRight = false,
}: {
  debater: DebateSide;
  agent?: (typeof NAMED_ANALYSTS)[number];
  speaking: boolean;
  popping?: boolean;
  barColor: string;
  pal: TheaterPalette;
  alignRight?: boolean;
}) {
  const conf = Math.max(0, Math.min(100, debater.confidence_after));
  const drop = debater.confidence_before - debater.confidence_after;
  const cells = 10;
  const filled = Math.round((conf / 100) * cells);
  const last = debater.name.split(" ").pop() ?? debater.name;

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${alignRight ? "flex-row-reverse text-right" : ""}`}
    >
      <div
        className="shrink-0"
        style={{
          outline: speaking ? `1px solid ${pal.brass}` : `1px solid ${pal.hair}`,
          outlineOffset: 1,
          animation: popping
            ? "theater-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both"
            : undefined,
        }}
      >
        <InvestorAvatar
          agentKey={agent?.key ?? debater.agent_id}
          name={debater.name}
          accent={barColor}
          size={24}
          speaking={speaking}
        />
      </div>
      <div className="min-w-0 flex-1 font-mono">
        <p className="truncate text-[9px] font-semibold tracking-[0.12em]">
          {last.toUpperCase()}{" "}
          <span style={{ color: barColor }}>● {stanceLabel(debater.signal).split(" ")[0]}</span>
        </p>
        <p className="tabular-nums text-[11px] font-bold leading-tight" style={{ color: barColor }}>
          {Math.round(conf)}%
          {drop > 0.1 ? (
            <span className="ml-1 text-[8px] font-medium" style={{ color: pal.bear }}>
              −{drop.toFixed(0)}
            </span>
          ) : null}
        </p>
        <div className={`mt-0.5 flex gap-px ${alignRight ? "flex-row-reverse" : ""}`}>
          {Array.from({ length: cells }, (_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-[1px] sm:h-2 sm:w-2"
              style={{
                background: i < filled ? barColor : "rgba(242,239,231,0.14)",
                transition: `background 0.4s ease ${i * 12}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TranscriptLine({
  line,
  agent,
  latest,
  principal,
  pal,
}: {
  line: DebateLine;
  agent?: (typeof NAMED_ANALYSTS)[number];
  latest: boolean;
  principal: boolean;
  pal: TheaterPalette;
}) {
  const isChair = line.side === "chair";
  return (
    <li
      className="flex gap-2 rounded-[3px] border px-3 py-2 backdrop-blur-sm"
      style={{
        borderColor: isChair ? `${pal.brass}99` : pal.glassBorder,
        background: isChair ? `${pal.brass}14` : pal.glassBg,
        animation: latest ? "riseIn 0.35s cubic-bezier(0.16,1,0.3,1) both" : undefined,
        boxShadow: latest ? `inset 0 0 0 1px ${pal.brass}22` : undefined,
      }}
    >
      {isChair ? (
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold"
          style={{ border: `1px solid ${pal.brass}`, color: pal.brass }}
          aria-hidden
        >
          ⚖
        </div>
      ) : (
        <InvestorAvatar
          agentKey={agent?.key ?? line.name}
          name={line.name}
          accent={ROOM_ASSETS[agent?.key ?? ""]?.accent ?? "#c2ffcd"}
          size={20}
          speaking={latest}
        />
      )}
      <div className="min-w-0 flex-1 font-mono">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[8px] font-semibold tracking-[0.12em]">
          <span style={{ color: latest ? pal.text : pal.mute }}>
            {line.name.toUpperCase()}
          </span>
          {line.signal ? (
            <span
              className="px-1 py-px text-[7px] tracking-[0.14em]"
              style={{
                border: `1px solid ${stanceColor(line.signal, pal)}55`,
                color: stanceColor(line.signal, pal),
              }}
            >
              {line.signal.toUpperCase()}
            </span>
          ) : null}
          {!principal ? (
            <span className="text-[7px] tracking-[0.16em]" style={{ color: pal.brass }}>
              THESIS
            </span>
          ) : (
            <span className="text-[7px] tracking-[0.16em]" style={{ color: pal.bear }}>
              CROSSFIRE
            </span>
          )}
          {line.matchup ? (
            <span className="text-[7px] tracking-[0.1em]" style={{ color: pal.faint }}>
              {line.matchup}
            </span>
          ) : null}
          {line.mode ? (
            <span
              className="px-1 py-px text-[7px] tracking-[0.12em]"
              style={{ border: `1px solid ${pal.hair}`, color: pal.faint }}
            >
              {line.mode.replace(/_/g, " ").toUpperCase()}
            </span>
          ) : null}
          {line.targets && line.targets.length > 0 ? (
            <span className="text-[8px]" style={{ color: pal.faint }}>
              → {line.targets.join(", ")}
            </span>
          ) : null}
        </p>
        <p
          className="mt-0.5 text-[11px] leading-snug sm:text-[12px]"
          style={{ color: latest ? pal.text : pal.mute }}
        >
          {line.text}
        </p>
      </div>
    </li>
  );
}

function RoundCard({
  round,
  index,
  selected,
  live,
  pal,
  onSelect,
}: {
  round: DebateRound;
  index: number;
  selected: boolean;
  live: boolean;
  pal: TheaterPalette;
  onSelect: () => void;
}) {
  const done = Boolean(round.winner && round.summary);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-[2px] px-2 py-1.5 text-left font-mono transition-colors"
        style={{
          border: `1px solid ${selected ? `${pal.brass}88` : pal.hair}`,
          background: selected ? `${pal.brass}12` : "transparent",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-bold tracking-[0.12em]" style={{ color: pal.text }}>
            R{index + 1} · {round.ticker}
          </span>
          {live ? (
            <span className="flex items-center gap-1.5 text-[8px] tracking-[0.16em]" style={{ color: pal.bull }}>
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ background: pal.bull, animation: "pulseDot 1.8s ease-in-out infinite" }}
              />
              LIVE
            </span>
          ) : done ? (
            <span className="text-[8px] tracking-[0.14em]" style={{ color: pal.brass }}>
              ⚖ {round.winner === "draw" ? "DRAW" : "WIN"}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[9px] tracking-[0.06em]" style={{ color: pal.mute }}>
          {round.matchups && round.matchups.length > 0
            ? `${round.matchups.length} paired duels`
            : `${round.left.name.split(" ").pop()} vs ${round.right.name.split(" ").pop()}`}
          {round.participant_count && round.participant_count > 2
            ? ` · ${round.participant_count} voices`
            : ""}
        </p>
        {done ? (
          <>
            <p className="mt-1 line-clamp-2 text-[9px] leading-snug" style={{ color: pal.faint }}>
              {round.winner_name ? `${round.winner_name} — ` : ""}
              {round.summary}
            </p>
            <p className="mt-1 text-[8px] tabular-nums tracking-[0.06em]" style={{ color: pal.faint }}>
              {round.left.name.split(" ").pop()}: {Math.round(round.left.confidence_before)}→
              {Math.round(round.left.confidence_after)} · {round.right.name.split(" ").pop()}:{" "}
              {Math.round(round.right.confidence_before)}→{Math.round(round.right.confidence_after)}
            </p>
          </>
        ) : null}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

function roundParticipants(round: DebateRound | null): DebateSide[] {
  if (!round) return [];
  if (Array.isArray(round.participants) && round.participants.length > 0) {
    return round.participants;
  }
  return [round.left, round.right] as DebateSide[];
}

function confidenceShiftRows(rounds: DebateRound[], roundIdx: number): {
  name: string;
  prev: number;
  now: number;
  delta: number;
}[] {
  if (roundIdx <= 0 || roundIdx >= rounds.length) return [];
  const cur = rounds[roundIdx]!;
  const prev = rounds[roundIdx - 1]!;
  const prevMap = new Map(roundParticipants(prev).map((p) => [p.agent_id, p]));
  const rows: { name: string; prev: number; now: number; delta: number }[] = [];
  for (const p of roundParticipants(cur)) {
    const pr = prevMap.get(p.agent_id);
    if (!pr) continue;
    const delta = p.confidence_after - pr.confidence_after;
    rows.push({
      name: p.name,
      prev: pr.confidence_after,
      now: p.confidence_after,
      delta,
    });
  }
  return rows
    .filter((r) => Math.abs(r.delta) > 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
