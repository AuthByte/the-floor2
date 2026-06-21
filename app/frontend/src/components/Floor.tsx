import { useEffect } from "react";
import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  SPECIALIST_ANALYSTS,
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
  CANVAS_H,
  CANVAS_W,
  CONSULTATION_ID,
  DEBATE_H,
  DEBATE_ROOM_ID,
  DEBATE_W,
  DEBATE_X,
  DEBATE_Y,
  PM_H,
  PM_W,
  RISK_H,
  RISK_W,
  ROOM_H,
  ROOM_POS,
  ROOM_W,
  roomBounds,
  T2_X,
  T2_Y,
  T3_X,
  T3_Y,
} from "../lib/layout";
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

export function Floor({
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
  const { x, y, scale, containerRef, onMouseDown, zoomIn, zoomOut, fitView, focusOnRoom, isDragging } =
    usePanZoom();

  // Fit entire floor ONCE on first mount. Any later re-fits are explicit
  // (via the fit button) — never automatic. We were using a ResizeObserver
  // that kept firing whenever the side panel changed size during a shift,
  // which caused the floor to zoom out unexpectedly.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    fitView(el.clientWidth, el.clientHeight, CANVAS_W, CANVAS_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        }}
      >
        {/* Floor grid on the canvas too */}
        <div className="pointer-events-none absolute inset-0 noise opacity-20" />

        {/* SVG signal traces — circuit map under the rooms */}
        <FloorHallways />

        {/* ── TIER 0: Data Feeds ─────────────────────────────────────── */}
        {DATA_ANALYSTS.map((agent, i) => {
          const id      = roomIdFor(agent.key);
          const pos     = ROOM_POS[id];
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
              onSelect={() => onRoomSelect(id)}
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
          const pos = ROOM_POS[id];
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
              onSelect={() => onRoomSelect(id)}
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
          const pos     = ROOM_POS[id];
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
              onSelect={() => onRoomSelect(id)}
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
          const pos     = ROOM_POS[id];
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
              onSelect={() => onRoomSelect(id)}
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
          left={DEBATE_X}
          top={DEBATE_Y}
          w={DEBATE_W}
          h={DEBATE_H}
          zClass="z-[12]"
          pixelArt
          selected={selectedRoomId === DEBATE_ROOM_ID}
          onSelect={() => onRoomSelect(DEBATE_ROOM_ID)}
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
          onOpen={onOpenDebateTheater}
        />

        {/* ── TIER 2: Risk Gate ──────────────────────────────────────── */}
        <AbsRoom
          roomId={RISK_MANAGER_ID}
          left={T2_X}
          top={T2_Y}
          w={RISK_W}
          h={RISK_H}
          selected={selectedRoomId === RISK_MANAGER_ID}
          onSelect={() => onRoomSelect(RISK_MANAGER_ID)}
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
          left={T3_X}
          top={T3_Y}
          w={PM_W}
          h={PM_H}
          selected={selectedRoomId === PORTFOLIO_MANAGER_ID}
          onSelect={() => onRoomSelect(PORTFOLIO_MANAGER_ID)}
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
        <ZoomBtn onClick={zoomIn} label="+" title="zoom in" />
        <ZoomBtn onClick={zoomOut} label="−" title="zoom out" />
        <ZoomBtn
          onClick={() => fitView(
            containerRef.current?.clientWidth ?? 1200,
            containerRef.current?.clientHeight ?? 700,
            CANVAS_W,
            CANVAS_H,
          )}
          label="⊞"
          title="fit view"
        />
        <div className="mt-1 border border-wire-800 bg-ink-950/90 px-2 py-1 text-center text-[9px] uppercase tracking-[0.32em] text-wire-600">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* ── Mini tier map ──────────────────────────────────────────────── */}
      <TierMap rooms={rooms} />
    </div>
  );
}

// ─── Absolutely-positioned room wrapper ──────────────────────────────────────
function AbsRoom({
  roomId,
  left,
  top,
  w,
  h,
  disabled,
  selected,
  onSelect,
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
  onSelect?: () => void;
  zClass?: string;
  name?: string;
  callsign?: string;
  hasNewChart?: boolean;
  /** Scaled pixel-art rooms — never apply CSS filters on hover/disabled. */
  pixelArt?: boolean;
  replayClass?: string;
  children: React.ReactNode;
}) {
  const clickable = !disabled && !!onSelect;
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
              onSelect();
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
                onSelect();
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
        selected ? "shadow-[inset_0_0_0_2px_rgb(var(--phos)/0.65)]" : ""
      } ${replayClass}`}
      style={{ left, top, width: w, height: h }}
      data-room-id={roomId}
    >
      {name ? <RoomNamePlate name={name} callsign={callsign} /> : null}
      {showAlert ? <NewChartBadge /> : null}
      {children}
    </div>
  );
}

// ─── Debate theater trigger (topmost interactive layer on the chamber) ─────
function DebateTheaterTrigger({
  state,
  onOpen,
}: {
  state: RoomState;
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
        left: DEBATE_X + DEBATE_W / 2,
        top: DEBATE_Y + DEBATE_H - 26,
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
      className="flex h-8 w-8 items-center justify-center border border-wire-800 bg-ink-950/90 text-base font-bold text-wire-300 transition hover:border-phos hover:text-phos active:scale-95"
    >
      {label}
    </button>
  );
}

// ─── Mini tier map in corner ─────────────────────────────────────────────────
function TierMap({ rooms }: { rooms: Record<string, RoomState> }) {
  const tiers = [
    { label: "T0 DATA",  agents: DATA_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "RISK ROW", agents: RISK_PIPELINE_AGENTS.map(a => a.key) },
    { label: "T1 FLOOR", agents: NAMED_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "ANALYSIS", agents: SPECIALIST_ANALYSTS.map(a => roomIdFor(a.key)) },
    { label: "DEBATE",   agents: [DEBATE_ROOM_ID] },
    { label: "T2 RISK",  agents: [RISK_MANAGER_ID] },
    { label: "T3 BOSS",  agents: [PORTFOLIO_MANAGER_ID] },
  ] as const;

  return (
    <div className="absolute bottom-4 left-4 z-20 border border-wire-800 bg-ink-950/90 p-3">
      <div className="mb-2 text-[9px] uppercase tracking-[0.32em] text-wire-600">tier map</div>
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
                      s === "WORKING" ? "bg-amber animate-pulse" :
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
  );
}
