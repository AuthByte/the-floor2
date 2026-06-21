import { memo } from "react";
import type { AgentDef } from "../lib/agents";
import type { RoomState } from "../lib/types";
import { RoomThesisHint } from "./RoomThesisHint";
import { RoomVerdictPlaque } from "./RoomVerdictPlaque";

interface Props {
  agent: AgentDef;
  state: RoomState;
  roomNumber: string;
  wide?: boolean;
  boss?: boolean;
  enabled?: boolean;
}

const STATUS_BADGE: Record<
  RoomState["status"],
  { label: string; cls: string; dot: string }
> = {
  STANDBY: { label: "STANDBY", cls: "text-wire-600", dot: "bg-wire-800" },
  WORKING: { label: "WORKING", cls: "text-amber",  dot: "bg-amber animate-pulse" },
  DONE:    { label: "DONE",    cls: "text-phos phos-glow-soft", dot: "bg-phos" },
  ERROR:   { label: "FAULT",   cls: "text-siren siren-glow",   dot: "bg-siren animate-pulse" },
};

function RoomImpl({ agent, state, roomNumber, wide, boss, enabled = true }: Props) {
  const badge   = !enabled
    ? { label: "OFFLINE", cls: "text-wire-700", dot: "bg-wire-900" }
    : STATUS_BADGE[state.status];
  const isWork  = state.status === "WORKING";
  const isDone  = state.status === "DONE";
  const isErr   = state.status === "ERROR";

  const frameCls = isWork
    ? "border-phos/80 shadow-phos animate-glow"
    : isDone
    ? "border-wire-500/70 shadow-phos-soft"
    : isErr
    ? "border-siren/80 shadow-siren"
    : boss
    ? "border-wire-600"
    : "border-wire-800";

  const ticker = state.ticker || "";

  return (
    <article
      className={`relative flex h-full w-full flex-col border bg-ink-950/90 ${frameCls} ${
        boss ? "p-4" : wide ? "p-3" : "p-3"
      }`}
    >
      {state.verdict ? <RoomVerdictPlaque verdict={state.verdict} compact /> : null}
      <RoomThesisHint state={state} />
      {/* Room number tab */}
      <div className="absolute -top-[9px] left-3 bg-ink-950 px-1.5 text-[8px] uppercase tracking-[0.3em] text-wire-600">
        {roomNumber}
      </div>

      {/* Corner ticks */}
      <Tick cls="left-0 top-0" />
      <Tick cls="right-0 top-0 -scale-x-100" />
      <Tick cls="bottom-0 left-0 -scale-y-100" />
      <Tick cls="bottom-0 right-0 scale-[-1]" />

      {/* Header */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-bold uppercase leading-snug ${
              boss ? "text-sm tracking-[0.14em]" : "text-[11px] tracking-[0.16em]"
            } ${isDone || isWork ? "text-wire-100" : "text-wire-300"}`}
            title={agent.name}
          >
            {agent.name}
          </div>
          <div className="truncate text-[9px] uppercase tracking-[0.22em] text-wire-600">
            {agent.desk}
          </div>
        </div>
        <div
          className={`shrink-0 text-[9px] uppercase tracking-[0.28em] text-wire-500 ${
            boss ? "text-phos phos-glow-soft text-[10px]" : ""
          }`}
        >
          {agent.callsign}
        </div>
      </header>

      <div className="my-2 h-px bg-gradient-to-r from-wire-800 via-wire-700 to-transparent" />

      {/* Status row */}
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.28em] ${badge.cls}`}>
          <span className={`inline-block h-1.5 w-1.5 ${badge.dot}`} />
          {badge.label}
        </span>
        {ticker ? (
          <span className="truncate text-[9px] uppercase tracking-[0.22em] text-wire-300">
            {ticker}
          </span>
        ) : null}
      </div>

      {/* Task message */}
      <div className="mt-1.5 min-h-[22px] flex-1">
        <p
          className={`line-clamp-2 break-words text-[10px] leading-snug ${
            isErr  ? "text-siren" :
            isWork ? "text-wire-100" :
            isDone ? "text-wire-200" :
            "text-wire-700"
          }`}
        >
          {state.status === "STANDBY" ? "// awaiting orders" : state.message}
          {isWork ? (
            <span className="ml-0.5 inline-block h-[10px] w-[5px] -mb-[1px] bg-phos animate-blink align-baseline" />
          ) : null}
        </p>
      </div>

      {/* Progress bar */}
      <div className="relative mt-2 h-[3px] overflow-hidden bg-wire-900/60">
        {isWork ? (
          <div className="absolute inset-y-0 w-1/3 bg-phos/80 animate-bar shadow-[0_0_8px_rgba(34,255,102,0.6)]" />
        ) : isDone ? (
          <div className="absolute inset-y-0 left-0 right-0 bg-phos/60" />
        ) : isErr ? (
          <div className="absolute inset-y-0 left-0 right-0 bg-siren/60" />
        ) : null}
      </div>
    </article>
  );
}

function Tick({ cls }: { cls: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-2 w-2 border-l border-t border-wire-600/60 ${cls}`}
    />
  );
}

export const Room = memo(RoomImpl);
