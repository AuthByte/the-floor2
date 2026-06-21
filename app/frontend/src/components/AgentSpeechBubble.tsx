import type { RoomState } from "../lib/types";

interface Props {
  state: RoomState;
}

/** Extract readable thesis text from streamed JSON or plain reasoning. */
function displayText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as { reasoning?: string };
    if (parsed.reasoning) return parsed.reasoning;
  } catch {
    const match = trimmed.match(/"reasoning"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return trimmed;
}

export function AgentSpeechBubble({ state }: Props) {
  if (!state.analysis) return null;

  const msg = state.message.toLowerCase();
  if (
    msg.includes("queued") ||
    msg.includes("offline") ||
    msg.includes("awaiting") ||
    msg.includes("chamber idle")
  ) {
    return null;
  }

  const text = displayText(state.analysis);
  if (!text) return null;

  const streaming =
    state.status === "WORKING" &&
    (state.message.toLowerCase().includes("composing") ||
      state.message.toLowerCase().includes("generating") ||
      state.message.toLowerCase().includes("debating"));

  const isDebate = state.message.toLowerCase().includes("debating");

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 z-[25] w-[min(260px,90vw)] -translate-x-1/2 -translate-y-[calc(100%+6px)]"
      aria-live="polite"
    >
      <div
        className="relative border border-phos/35 bg-ink-950/95 px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.55)]"
        style={{ imageRendering: "pixelated" }}
      >
        <div className="mb-1 text-[8px] uppercase tracking-[0.28em] text-phos/70">
          {isDebate ? "rebuttal" : "live thesis"}
        </div>
        <p className="max-h-[88px] overflow-hidden text-[10px] leading-snug text-wire-100">
          {text}
          {streaming ? (
            <span className="ml-0.5 inline-block h-[10px] w-[5px] animate-blink bg-phos align-[-1px]" />
          ) : null}
        </p>
        <span
          className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-phos/35 bg-ink-950/95"
          aria-hidden
        />
      </div>
    </div>
  );
}
