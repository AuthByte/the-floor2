import { memo, useEffect, useMemo, useState } from "react";
import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  SPECIALIST_ANALYSTS,
  QUANT_ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  roomIdFor,
} from "../lib/agents";
import { ROOM_ASSETS } from "../lib/roomAssets";
import { PixelRoom } from "./PixelRoom";
import {
  CONSULTATION_ID,
  DEBATE_H,
  DEBATE_ROOM_ID,
  DEBATE_W,
  PM_H,
  PM_W,
  RISK_H,
  RISK_W,
  ROOM_H,
  ROOM_W,
  roomBounds,
} from "../lib/layout";
import { useFloorPlan } from "../lib/floorPlan/context";
import { FLOOR_LAYOUT_META } from "../lib/floorLayoutMode";
import type { ReplayRoomSnapshot } from "../lib/shiftReplay";
import type { RoomState, RunState } from "../lib/types";
import { FloorHallways } from "./FloorHallways";
import { ConsultationLayer } from "./ConsultationLayer";
import { FloorCausalityLayer } from "./FloorCausalityLayer";
import { FloorAgentSprites, shouldHideCubicleSprite } from "./FloorAgentSprites";
import { DebateRoom } from "./DebateRoom";
import { Room } from "./Room";
import { usePanZoom } from "../hooks/usePanZoom";

interface Props {
  rooms: Record<string, RoomState>;
  enabledAgentKeys: Set<string>;
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onOpenDebateTheater?: () => void;
  /** Room ids with freshly generated charts the user hasn't opened yet. */
  newChartRoomIds?: Set<string>;
  /** When set, pans/zooms the floor to center this room (seq bumps re-trigger). */
  focusRoomId?: string | null;
  focusSeq?: number;
  /** When replay is active, ghost-state overlay per room. */
  replaySnapshot?: Record<string, ReplayRoomSnapshot> | null;
  runState?: RunState;
}

export const Floor = memo(function Floor({
  rooms,
  enabledAgentKeys,
  selectedRoomId,
  onRoomSelect,
  onOpenDebateTheater,
  newChartRoomIds,
  focusRoomId,
  focusSeq = 0,
  replaySnapshot = null,
  runState = "idle",
}: Props) {
  const { plan, mode, toggleMode } = useFloorPlan();
  const { canvasW, canvasH, roomPos, debate, hallways } = plan;
  const { x: debateX, y: debateY } = debate;
  const riskPos = roomPos[RISK_MANAGER_ID];
  const pmPos = roomPos[PORTFOLIO_MANAGER_ID];
  const fitFocusY = (hallways.t0Y + hallways.tAnalysisY + ROOM_H) / 2;

  const { x, y, scale, containerRef, canvasRef, onMouseDown, zoomIn, zoomOut, fitView, focusOnRoom, isDragging } =
    usePanZoom();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    fitView(el.clientWidth, el.clientHeight, canvasW, canvasH, fitFocusY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, canvasW, canvasH, fitFocusY]);

  useEffect(() => {
    if (!focusRoomId || focusSeq === 0) return;
    const el = containerRef.current;
    if (!el) return;
    focusOnRoom(focusRoomId, el.clientWidth, el.clientHeight);
  }, [focusRoomId, focusSeq, focusOnRoom, containerRef]);

  const replayActive = replaySnapshot != null;
  const replayRoomClass = (id: string) => {
    if (!replaySnapshot) return "";
    const s = replaySnapshot[id];
    if (!s || s.status === "STANDBY") return "opacity-[0.34] saturate-[0.5]";
    if (s.status === "WORKING") return "opacity-100 shadow-[inset_0_0_0_2px_rgb(47_208_138/0.65)]";
    if (s.status === "DONE") {
      if (s.signal === "bearish") return "opacity-100 shadow-[inset_0_0_0_2px_rgb(255_77_109/0.72)]";
      if (s.signal === "bullish") return "opacity-100 shadow-[inset_0_0_0_2px_rgb(47_208_138/0.72)]";
      return "opacity-100 shadow-[inset_0_0_0_2px_rgb(227_178_75/0.65)]";
    }
    return "opacity-100";
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden select-none bg-ink-950 ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onMouseDown={onMouseDown}
    >
      {/* Background grid (fixed, always visible) */}
      <div className="pointer-events-none absolute inset-0 floor-grid opacity-30" />

      {/*
        Zoomable canvas — CSS transform is the only scoping mechanism that
        guaranteed-only affects descendants. CSS `zoom` was leaking out and
        scaling sibling overlays (tier map, controls). translate3d forces a
        clean GPU layer so dragging doesn't repaint-storm during shifts.
      */}
      <div
        ref={canvasRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        }}
      >
        {/* Floor grid on the canvas too */}
        <div className="pointer-events-none absolute inset-0 noise opacity-20" />

        <FloorHallways plan={plan} />

        {/* ── TIER 0: Data Feeds ─────────────────────────────────────── */}
        {DATA_ANALYSTS.map((agent, i) => {
          const id      = roomIdFor(agent.key);
          const pos     = roomPos[id];
          const asset   = ROOM_ASSETS[agent.key];
          const num     = `D${String(i + 1).padStart(2, "0")}`;
          const enabled = enabledAgentKeys.has(agent.key);
          return (
            <AbsRoom
              key={id}
              roomId={id}
              left={pos.x}
              top={pos.y}
              w={ROOM_W}
              h={ROOM_H}
              disabled={!enabled}
              selected={selectedRoomId === id}
              onRoomSelect={onRoomSelect}
              name={agent.name}
              callsign={agent.callsign}
              hasNewChart={newChartRoomIds?.has(id)}
              pixelArt={!!asset}
              replayClass={replayActive ? replayRoomClass(id) : ""}
            >
              {asset ? (
                <PixelRoom
                  agent={agent}
                  state={rooms[id]}
                  roomNumber={num}
                  asset={asset}
                  enabled={enabled}
                />
              ) : (
                <Room agent={agent} state={rooms[id]} roomNumber={num} enabled={enabled} />
              )}
            </AbsRoom>
          );
        })}

        {/* ── RISK DISCOVERY PIPELINE (right column) ──────────────────── */}
        {RISK_PIPELINE_AGENTS.map((agent) => {
          const id = agent.key;
          const pos = roomPos[id];
          const bounds = roomBounds(id);
          const w = bounds?.w ?? ROOM_W;
          const asset = ROOM_ASSETS[agent.key];
          return (
            <AbsRoom
              key={id}
              roomId={id}
              left={pos.x}
              top={pos.y}
              w={w}
              h={ROOM_H}
              selected={selectedRoomId === id}
              onRoomSelect={onRoomSelect}
              name={agent.name}
              callsign={agent.callsign}
              pixelArt={!!asset}
              replayClass={replayActive ? replayRoomClass(id) : ""}
            >
              {asset ? (
                <PixelRoom
                  agent={agent}
                  state={rooms[id] ?? { status: "STANDBY", ticker: null, message: "pipeline idle", analysis: null, updatedAt: 0, history: [] }}
                  roomNumber={agent.callsign}
                  asset={asset}
                  enabled
                />
              ) : (
                <Room agent={agent} state={rooms[id]} roomNumber={agent.callsign} enabled />
              )}
            </AbsRoom>
          );
        })}

        {/* ── TIER 1: Named Analysts ─────────────────────────────────── */}
        {NAMED_ANALYSTS.map((agent, i) => {
          const id      = roomIdFor(agent.key);
          const pos     = roomPos[id];
          const asset   = ROOM_ASSETS[agent.key];
          const num     = String(i + 1).padStart(2, "0");
          const enabled = enabledAgentKeys.has(agent.key);
          return (
            <AbsRoom
              key={id}
              roomId={id}
              left={pos.x}
              top={pos.y}
              w={ROOM_W}
              h={ROOM_H}
              disabled={!enabled}
              selected={selectedRoomId === id}
              onRoomSelect={onRoomSelect}
              name={agent.name}
              callsign={agent.callsign}
              hasNewChart={newChartRoomIds?.has(id)}
              pixelArt={!!asset}
              replayClass={replayActive ? replayRoomClass(id) : ""}
            >
              {asset ? (
                <PixelRoom
                  agent={agent}
                  state={rooms[id]}
                  roomNumber={num}
                  asset={asset}
                  enabled={enabled}
                  hideSprite={shouldHideCubicleSprite(agent.key, rooms, enabled)}
                />
              ) : (
                <Room agent={agent} state={rooms[id]} roomNumber={num} enabled={enabled} />
              )}
            </AbsRoom>
          );
        })}

        {/* ── FURTHER ANALYSIS: Specialist desks ─────────────────────── */}
        {SPECIALIST_ANALYSTS.map((agent, i) => {
          const id      = roomIdFor(agent.key);
          const pos     = roomPos[id];
          const asset   = ROOM_ASSETS[agent.key];
          const num     = `A${String(i + 1).padStart(2, "0")}`;
          const enabled = enabledAgentKeys.has(agent.key);
          return (
            <AbsRoom
              key={id}
              roomId={id}
              left={pos.x}
              top={pos.y}
              w={ROOM_W}
              h={ROOM_H}
              disabled={!enabled}
              selected={selectedRoomId === id}
              onRoomSelect={onRoomSelect}
              name={agent.name}
              callsign={agent.callsign}
              hasNewChart={newChartRoomIds?.has(id)}
              pixelArt={!!asset}
              replayClass={replayActive ? replayRoomClass(id) : ""}
            >
              {asset ? (
                <PixelRoom
                  agent={agent}
                  state={rooms[id]}
                  roomNumber={num}
                  asset={asset}
                  enabled={enabled}
                />
              ) : (
                <Room agent={agent} state={rooms[id]} roomNumber={num} enabled={enabled} />
              )}
            </AbsRoom>
          );
        })}

        {/* ── QUANT DESK (v2): Alpha models ──────────────────────────── */}
        {QUANT_ANALYSTS.map((agent, i) => {
          const id      = roomIdFor(agent.key);
          const pos     = roomPos[id];
          const asset   = ROOM_ASSETS[agent.key];
          const num     = `Q${String(i + 1).padStart(2, "0")}`;
          const enabled = enabledAgentKeys.has(agent.key);
          return (
            <AbsRoom
              key={id}
              roomId={id}
              left={pos.x}
              top={pos.y}
              w={ROOM_W}
              h={ROOM_H}
              disabled={!enabled}
              selected={selectedRoomId === id}
              onRoomSelect={onRoomSelect}
              name={agent.name}
              callsign={agent.callsign}
              hasNewChart={newChartRoomIds?.has(id)}
              pixelArt={!!asset}
              replayClass={replayActive ? replayRoomClass(id) : ""}
            >
              {asset ? (
                <PixelRoom
                  agent={agent}
                  state={rooms[id]}
                  roomNumber={num}
                  asset={asset}
                  enabled={enabled}
                />
              ) : (
                <Room agent={agent} state={rooms[id]} roomNumber={num} enabled={enabled} />
              )}
            </AbsRoom>
          );
        })}

        {/* ── ARGUMENT ROOM (center debate chamber) ──────────────────── */}
        <AbsRoom
          roomId={DEBATE_ROOM_ID}
          left={debateX}
          top={debateY}
          w={DEBATE_W}
          h={DEBATE_H}
          zClass="z-[12]"
          pixelArt
          selected={selectedRoomId === DEBATE_ROOM_ID}
          onRoomSelect={onRoomSelect}
          name="Argument Room"
          callsign="DEBATE"
          replayClass={replayActive ? replayRoomClass(DEBATE_ROOM_ID) : ""}
        >
          <DebateRoom
            state={rooms[DEBATE_ROOM_ID] ?? { status: "STANDBY", ticker: null, message: "chamber idle", analysis: null, updatedAt: 0, history: [], debateFeed: [], debateRounds: [], activeDebateTicker: null }}
            roomImage={ROOM_ASSETS.argument_room?.roomImage ?? "/rooms/argument_room.png"}
          />
        </AbsRoom>

        {/* Sprites above debate room art (z-16 vs room z-12) */}
        <FloorAgentSprites rooms={rooms} enabledAgentKeys={enabledAgentKeys} />

        {/* Pre-debate consultation envelopes flying between rooms */}
        <ConsultationLayer messages={rooms[CONSULTATION_ID]?.consultations ?? []} />

        <FloorCausalityLayer
          rooms={rooms}
          visible={runState === "running" || runState === "complete"}
        />

        {/* Above consultation pins (z-28) so the trigger stays clickable */}
        <DebateTheaterTrigger
          state={
            rooms[DEBATE_ROOM_ID] ?? {
              status: "STANDBY",
              ticker: null,
              message: "chamber idle",
              analysis: null,
              updatedAt: 0,
              history: [],
            }
          }
          debateX={debateX}
          debateY={debateY}
          onOpen={onOpenDebateTheater}
        />

        {/* ── TIER 2: Risk Gate ──────────────────────────────────────── */}
        <AbsRoom
          roomId={RISK_MANAGER_ID}
          left={riskPos?.x ?? 0}
          top={riskPos?.y ?? 0}
          w={RISK_W}
          h={RISK_H}
          selected={selectedRoomId === RISK_MANAGER_ID}
          onRoomSelect={onRoomSelect}
          name={RISK_MANAGER.name}
          callsign={RISK_MANAGER.callsign}
          replayClass={replayActive ? replayRoomClass(RISK_MANAGER_ID) : ""}
        >
          <Room
            agent={RISK_MANAGER}
            state={rooms[RISK_MANAGER_ID]}
            roomNumber="R-01"
            wide
          />
        </AbsRoom>

        {/* ── TIER 3: Portfolio Manager ──────────────────────────────── */}
        <AbsRoom
          roomId={PORTFOLIO_MANAGER_ID}
          left={pmPos?.x ?? 0}
          top={pmPos?.y ?? 0}
          w={PM_W}
          h={PM_H}
          selected={selectedRoomId === PORTFOLIO_MANAGER_ID}
          onRoomSelect={onRoomSelect}
          name={PORTFOLIO_MANAGER.name}
          callsign={PORTFOLIO_MANAGER.callsign}
          replayClass={replayActive ? replayRoomClass(PORTFOLIO_MANAGER_ID) : ""}
        >
          <Room
            agent={PORTFOLIO_MANAGER}
            state={rooms[PORTFOLIO_MANAGER_ID]}
            roomNumber="PM-00"
            wide
            boss
          />
        </AbsRoom>
      </div>

      {/* ── Zoom controls ──────────────────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1">
        <FloorLayoutToggle mode={mode} onToggle={toggleMode} />
        <ZoomBtn onClick={zoomIn} label="+" title="zoom in" />
        <ZoomBtn onClick={zoomOut} label="−" title="zoom out" />
        <ZoomBtn
          onClick={() => fitView(
            containerRef.current?.clientWidth ?? 1200,
            containerRef.current?.clientHeight ?? 700,
            canvasW,
            canvasH,
            fitFocusY,
          )}
          label="⊞"
          title="fit view"
        />
        <div className="mt-1 border border-wire-800 bg-ink-950/90 px-2 py-1 text-center text-[9px] uppercase tracking-[0.32em] text-wire-600">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* ── Mini tier map ──────────────────────────────────────────────── */}
      <TierMap rooms={rooms} runState={runState} />
    </div>
  );
});

// ─── Absolutely-positioned room wrapper ──────────────────────────────────────
const AbsRoom = memo(function AbsRoom({
  roomId,
  left,
  top,
  w,
  h,
  disabled,
  selected,
  onRoomSelect,
  zClass = "z-[5]",
  name,
  callsign,
  hasNewChart,
  pixelArt,
  replayClass = "",
  children,
}: {
  roomId?: string;
  left: number;
  top: number;
  w: number;
  h: number;
  disabled?: boolean;
  selected?: boolean;
  onRoomSelect?: (roomId: string) => void;
  zClass?: string;
  name?: string;
  callsign?: string;
  hasNewChart?: boolean;
  /** Scaled pixel-art rooms — never apply CSS filters on hover/disabled. */
  pixelArt?: boolean;
  replayClass?: string;
  children: React.ReactNode;
}) {
  const clickable = !disabled && !!onRoomSelect && !!roomId;
  const showAlert = !!hasNewChart && !disabled;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? "Open thesis & investor profile" : undefined}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              onRoomSelect!(roomId!);
            }
          : undefined
      }
      onMouseDown={
        clickable
          ? (e) => {
              e.stopPropagation();
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onRoomSelect!(roomId!);
              }
            }
          : undefined
      }
      className={`absolute ${zClass} overflow-visible transition-[opacity,box-shadow] duration-300 ${
        pixelArt ? "room-pixel-slot" : ""
      } ${
        disabled ? "pointer-events-none opacity-[0.28]" : ""
      } ${
        clickable
          ? "cursor-pointer hover:shadow-[inset_0_0_0_1px_rgb(var(--phos)/0.42)]"
          : ""
      } ${
        selected ? "desk-room-selected shadow-[inset_0_0_0_2px_rgb(var(--phos)/0.65)]" : ""
      } ${
        clickable ? "transition-transform duration-200 hover:scale-[1.015]" : ""
      } ${replayClass}`}
      style={{ left, top, width: w, height: h }}
      data-room-id={roomId}
    >
      {name ? <RoomNamePlate name={name} callsign={callsign} /> : null}
      {showAlert ? <NewChartBadge /> : null}
      {children}
    </div>
  );
});

// ─── Debate theater trigger (topmost interactive layer on the chamber) ─────
function DebateTheaterTrigger({
  state,
  debateX,
  debateY,
  onOpen,
}: {
  state: RoomState;
  debateX: number;
  debateY: number;
  onOpen?: () => void;
}) {
  const feedLen = state.debateFeed?.length ?? 0;
  const roundsLen = state.debateRounds?.length ?? 0;
  const active = state.status === "WORKING";
  const hasContent = feedLen > 0 || roundsLen > 0;
  if (!onOpen || (!active && !hasContent)) return null;

  const label =
    feedLen > 0
      ? `▶ live debate (${feedLen})`
      : active
        ? "▶ open debate theater"
        : "▶ view debate recap";

  return (
    <button
      type="button"
      data-no-pan
      title="Open the debate theater"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute z-[35] rounded-sm border border-siren/45 bg-ink-950/96 px-2 py-0.5 font-mono text-[7px] uppercase tracking-[0.18em] text-siren shadow-[0_0_8px_rgba(255,59,59,0.2)] transition hover:border-phos/70 hover:text-phos"
      style={{
        left: debateX + DEBATE_W / 2,
        top: debateY + DEBATE_H - 26,
        transform: "translateX(-50%)",
      }}
    >
      {label}
    </button>
  );
}

// ─── New-chart alert badge ───────────────────────────────────────────────────
function NewChartBadge() {
  return (
    <div
      className="pointer-events-none absolute -right-2 -top-2 z-30"
      title="New chart generated — open this room to view"
      aria-label="New chart generated"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass/60" />
        <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-brass bg-ink-950 font-mono text-[11px] font-bold leading-none text-brass shadow-[0_0_10px_rgba(227,178,75,0.7)]">
          !
        </span>
      </span>
    </div>
  );
}

function RoomNamePlate({ name, callsign }: { name: string; callsign?: string }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full pb-1"
      aria-hidden
    >
      <div className="whitespace-nowrap border border-wire-800 bg-ink-950/95 px-2 py-0.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
        <div className="text-[10px] font-medium leading-tight tracking-wide text-wire-100">
          {name}
        </div>
        {callsign ? (
          <div className="text-[8px] uppercase tracking-[0.24em] text-phos/80">
            {callsign}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Floor layout toggle ─────────────────────────────────────────────────────
function FloorLayoutToggle({
  mode,
  onToggle,
}: {
  mode: "stack" | "wings";
  onToggle: () => void;
}) {
  const meta = FLOOR_LAYOUT_META[mode];
  const alt = mode === "stack" ? FLOOR_LAYOUT_META.wings : FLOOR_LAYOUT_META.stack;
  return (
    <button
      type="button"
      title={`Switch to ${alt.label} layout — ${alt.description}`}
      onClick={onToggle}
      onMouseDown={(e) => e.stopPropagation()}
      className="mb-1 flex min-w-[2rem] flex-col items-center border border-wire-800 bg-ink-950/90 px-1.5 py-1.5 transition-all duration-200 hover:border-phos hover:text-phos active:scale-95"
    >
      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-wire-400">
        map
      </span>
      <span className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-phos">
        {meta.short}
      </span>
    </button>
  );
}

// ─── Zoom button ─────────────────────────────────────────────────────────────
function ZoomBtn({
  onClick,
  label,
  title,
}: {
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex h-8 w-8 items-center justify-center border border-wire-800 bg-ink-950/90 text-base font-bold text-wire-300 transition-all duration-200 hover:scale-105 hover:border-phos hover:text-phos active:scale-95"
    >
      {label}
    </button>
  );
}

// ─── Shelved tier map (collapsed by default) ─────────────────────────────────
const TierMap = memo(function TierMap({
  rooms,
  runState,
}: {
  rooms: Record<string, RoomState>;
  runState: RunState;
}) {
  const [open, setOpen] = useState(false);
  const pulseWorking = runState === "running";
  const workingTotal = useMemo(
    () => Object.values(rooms).filter((r) => r.status === "WORKING").length,
    [rooms],
  );
  const tiers = [
    { label: "T0 DATA",  agents: DATA_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "RISK ROW", agents: RISK_PIPELINE_AGENTS.map(a => a.key) },
    { label: "T1 FLOOR", agents: NAMED_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "ANALYSIS", agents: SPECIALIST_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "QUANT",    agents: QUANT_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "DEBATE",   agents: [DEBATE_ROOM_ID] },
    { label: "T2 RISK",  agents: [RISK_MANAGER_ID] },
    { label: "T3 BOSS",  agents: [PORTFOLIO_MANAGER_ID] },
  ] as const;

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-1">
      <div className="border border-wire-800 bg-ink-950/92 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-ink-900/70"
        >
          <svg
            viewBox="0 0 12 12"
            className={`h-2.5 w-2.5 shrink-0 text-wire-500 transition ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2.5 8.5 6 4 9.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[9px] uppercase tracking-[0.32em] text-wire-500">tier map</span>
        </button>

        {open ? (
          <div className="border-t border-wire-800/80 px-3 pb-3 pt-2">
            <div className="flex flex-col gap-1">
              {tiers.map(tier => {
                const statuses = tier.agents.map(id => rooms[id]?.status ?? "STANDBY");
                const working = statuses.filter(s => s === "WORKING").length;
                const done = statuses.filter(s => s === "DONE").length;
                const total = statuses.length;
                return (
                  <div key={tier.label} className="flex items-center gap-3">
                    <span className="w-[52px] text-[9px] uppercase tracking-[0.22em] text-wire-500">
                      {tier.label}
                    </span>
                    <span className="flex gap-[2px]">
                      {statuses.map((s, i) => (
                        <span
                          key={i}
                          className={`inline-block h-[6px] w-[6px] ${
                            s === "WORKING" ? (pulseWorking ? "bg-amber animate-pulse" : "bg-amber") :
                            s === "DONE"    ? "bg-phos" :
                            s === "ERROR"   ? "bg-siren" :
                            "bg-wire-800"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-[9px] tracking-[0.16em] text-wire-600">
                      {working > 0 ? <span className="text-amber">{working}▲ </span> : null}
                      {done}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border border-wire-800/80 bg-ink-950/90 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.24em]">
        <span className="text-wire-600">working </span>
        <span className={workingTotal > 0 ? "text-phos phos-glow-soft" : "text-wire-400"}>
          {workingTotal}
        </span>
      </div>
    </div>
  );
});
