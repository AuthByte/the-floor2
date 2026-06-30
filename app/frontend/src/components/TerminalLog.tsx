import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { agentForCallsign } from "../lib/agents";
import { roomBounds } from "../lib/layout";
import type { LogLine, RunState } from "../lib/types";

const PIN_THRESHOLD_PX = 48;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

function wireHaystack(line: LogLine): string {
  const agent = agentForCallsign(line.callsign);
  return [
    line.callsign,
    line.ticker ?? "",
    line.status,
    agent?.name ?? "",
    agent?.desk ?? "",
    agent?.key ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function lineMatchesQuery(line: LogLine, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return wireHaystack(line).includes(q);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={`${i}-${part}`}
        className="rounded-sm bg-brass/25 text-inherit ring-1 ring-brass/30"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

interface Props {
  log: LogLine[];
  runState: RunState;
  onFocusRoom?: (roomId: string) => void;
}

export const TerminalLog = memo(function TerminalLog({ log, runState, onFocusRoom }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const trimmedQuery = searchQuery.trim();
  const isFiltering = trimmedQuery.length > 0;

  const visibleLog = useMemo(
    () => (isFiltering ? log.filter((line) => lineMatchesQuery(line, trimmedQuery)) : log),
    [log, isFiltering, trimmedQuery],
  );

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
    if (isFiltering) return;

    const grew = log.length > prevLenRef.current;
    prevLenRef.current = log.length;

    if (!grew && log.length > 0) return;
    if (!pinnedRef.current) return;

    requestAnimationFrame(() => {
      scrollToBottom(grew && log.length > 8 ? "smooth" : "auto");
    });
  }, [log, scrollToBottom, isFiltering]);

  useEffect(() => {
    if (runState === "running" && !isFiltering) pinnedRef.current = true;
  }, [runState, isFiltering]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      data-tour="wire-log"
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-wire-800/80 bg-ink-950/95"
    >
      <header className="shrink-0 border-b border-wire-800/80">
        <div className="flex items-center justify-between px-4 py-2.5">
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
        </div>

        <div className="flex items-center gap-2 border-t border-wire-900/80 px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <span
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-wire-600"
              aria-hidden
            >
              /
            </span>
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => {
                const next = e.target.value;
                setSearchQuery(next);
                if (next.trim()) {
                  pinnedRef.current = false;
                  setShowJump(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (searchQuery) {
                    e.stopPropagation();
                    setSearchQuery("");
                  } else {
                    searchRef.current?.blur();
                  }
                }
              }}
              placeholder="search wire…"
              aria-label="Search live wire"
              className="w-full rounded-sm border border-wire-800/90 bg-ink-900/80 py-1 pl-5 pr-7 font-mono text-[10px] text-wire-200 placeholder:text-wire-700 outline-none transition focus:border-brass/50 focus:ring-1 focus:ring-brass/25"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 font-mono text-[10px] text-wire-600 transition hover:text-brass"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
          {isFiltering ? (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-600">
              {visibleLog.length}/{log.length}
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 py-2.5"
        >
          {log.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  runState === "running" ? "bg-amber animate-pulse" : "bg-wire-800"
                }`}
              />
              <p className="text-[10px] uppercase tracking-[0.32em] text-wire-700">
                {runState === "running" ? "desk connecting" : "wire is quiet"}
              </p>
              <p className="max-w-[28ch] text-[10px] leading-relaxed text-wire-800">
                {runState === "running"
                  ? "waiting for the backend stream — tier-0 feeds can take a minute with a full roster"
                  : "start a shift to stream the desk in real time"}
              </p>
            </div>
          ) : isFiltering && visibleLog.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[10px] uppercase tracking-[0.28em] text-wire-600">
                no matches
              </p>
              <p className="max-w-[26ch] font-mono text-[10px] leading-relaxed text-wire-700">
                nothing on the wire for &ldquo;{trimmedQuery}&rdquo;
              </p>
            </div>
          ) : (
            <ul className="space-y-px font-mono text-[11px] leading-snug">
              {visibleLog.map((line, i) => (
                <LogRow
                  key={line.id}
                  line={line}
                  query={trimmedQuery}
                  isNew={!isFiltering && i === visibleLog.length - 1}
                  onFocusRoom={onFocusRoom}
                />
              ))}
            </ul>
          )}
          {runState === "running" && log.length > 0 && !isFiltering ? (
            <div className="flex items-center gap-1.5 px-2 pt-2 text-[11px] text-wire-500">
              <span className="text-brass">$</span>
              <span className="inline-block h-3 w-[2px] bg-brass animate-blink" />
            </div>
          ) : null}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>

        {showJump && !isFiltering ? (
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
});

const LogRow = memo(function LogRow({
  line,
  query = "",
  isNew = false,
  onFocusRoom,
}: {
  line: LogLine;
  query?: string;
  isNew?: boolean;
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
    <li
      className={`group flex gap-2 rounded-sm px-2 py-0.5 transition-colors hover:bg-wire-900/40 ${
        isNew ? "animate-wire-in" : ""
      }`}
    >
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
          [{highlightMatch(line.callsign, query)}]
        </button>
      ) : (
        <span className="shrink-0 text-brass/70">
          [{highlightMatch(line.callsign, query)}]
        </span>
      )}
      {line.ticker ? (
        <span className="shrink-0 font-semibold text-wire-300">
          {highlightMatch(line.ticker, query)}
        </span>
      ) : null}
      <span className={`min-w-0 break-words ${tone}`}>
        {highlightMatch(line.status, query)}
      </span>
    </li>
  );
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
