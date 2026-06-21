import { useCallback, useEffect, useRef, useState } from "react";
import { agentForCallsign } from "../lib/agents";
import { roomBounds } from "../lib/layout";
import type { LogLine, RunState } from "../lib/types";

const PIN_THRESHOLD_PX = 48;

interface Props {
  log: LogLine[];
  runState: RunState;
  onFocusRoom?: (roomId: string) => void;
}

export function TerminalLog({ log, runState, onFocusRoom }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    if (behavior === "auto") {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const handleScroll = useCallback(() => {
    const pinned = isNearBottom();
    pinnedRef.current = pinned;
    setShowJump(!pinned);
  }, [isNearBottom]);

  useEffect(() => {
    const grew = log.length > prevLenRef.current;
    prevLenRef.current = log.length;

    if (!grew && log.length > 0) return;
    if (!pinnedRef.current) return;

    requestAnimationFrame(() => {
      scrollToBottom(grew && log.length > 8 ? "smooth" : "auto");
    });
  }, [log, scrollToBottom]);

  useEffect(() => {
    if (runState === "running") pinnedRef.current = true;
  }, [runState]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-wire-800/80 bg-ink-950/95">
      <header className="flex shrink-0 items-center justify-between border-b border-wire-800/80 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              runState === "running"
                ? "bg-phos animate-pulse-dot"
                : "bg-wire-700"
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-wire-300">
            live wire
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.18em] text-wire-700">
          tail&nbsp;-f&nbsp;/floor
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 py-2.5"
        >
          {log.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="h-1.5 w-1.5 rounded-full bg-wire-800" />
              <p className="text-[10px] uppercase tracking-[0.32em] text-wire-700">
                wire is quiet
              </p>
              <p className="max-w-[22ch] text-[10px] leading-relaxed text-wire-800">
                start a shift to stream the desk in real time
              </p>
            </div>
          ) : (
            <ul className="space-y-px font-mono text-[11px] leading-snug">
              {log.map((line) => (
                <LogRow key={line.id} line={line} onFocusRoom={onFocusRoom} />
              ))}
            </ul>
          )}
          {runState === "running" && log.length > 0 ? (
            <div className="flex items-center gap-1.5 px-2 pt-2 text-[11px] text-wire-500">
              <span className="text-brass">$</span>
              <span className="inline-block h-3 w-[2px] bg-brass animate-blink" />
            </div>
          ) : null}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={() => {
              pinnedRef.current = true;
              setShowJump(false);
              scrollToBottom("smooth");
            }}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 animate-rise-in rounded-full border border-brass/50 bg-ink-950/95 px-3 py-1 text-[9px] uppercase tracking-[0.22em] text-brass shadow-brass-soft backdrop-blur transition hover:border-brass hover:bg-ink-900"
          >
            ↓ latest
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function LogRow({
  line,
  onFocusRoom,
}: {
  line: LogLine;
  onFocusRoom?: (roomId: string) => void;
}) {
  const time = formatTime(line.ts);
  const floorRoomId =
    line.roomId && roomBounds(line.roomId) ? line.roomId : null;
  const agent = agentForCallsign(line.callsign);
  const tone =
    line.level === "err"
      ? "text-siren siren-glow"
      : line.level === "ok"
        ? "text-phos phos-glow-soft"
        : line.level === "warn"
          ? "text-amber"
          : "text-wire-200";
  const rail =
    line.level === "err"
      ? "bg-siren/70"
      : line.level === "ok"
        ? "bg-phos/70"
        : line.level === "warn"
          ? "bg-amber/70"
          : "bg-transparent";
  return (
    <li className="group flex gap-2 rounded-sm px-2 py-0.5 transition-colors hover:bg-wire-900/40">
      <span className={`-ml-1 w-0.5 shrink-0 rounded-full ${rail}`} aria-hidden />
      <span className="shrink-0 text-wire-700">{time}</span>
      {floorRoomId && onFocusRoom ? (
        <button
          type="button"
          onClick={() => onFocusRoom(floorRoomId)}
          className="shrink-0 rounded-sm text-brass/90 underline decoration-brass/30 underline-offset-2 transition hover:text-brass hover:decoration-brass/70"
          title={
            agent
              ? `Zoom to ${agent.name}'s room`
              : `Zoom to [${line.callsign}] on the floor`
          }
        >
          [{line.callsign}]
        </button>
      ) : (
        <span className="shrink-0 text-brass/70">[{line.callsign}]</span>
      )}
      {line.ticker ? (
        <span className="shrink-0 font-semibold text-wire-300">
          {line.ticker}
        </span>
      ) : null}
      <span className={`min-w-0 break-words ${tone}`}>{line.status}</span>
    </li>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
