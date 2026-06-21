import type { RoomVerdict } from "../lib/types";
import { outlookPlaqueLine } from "../lib/outlookFormat";

interface Props {
  verdict: RoomVerdict;
  compact?: boolean;
}

export function RoomVerdictPlaque({ verdict, compact }: Props) {
  const isBull = verdict.signal === "bullish";
  const isBear = verdict.signal === "bearish";
  const conf = Math.round(verdict.confidence);
  const outlookLine = outlookPlaqueLine(verdict);

  const accent = isBull
    ? {
        border: "border-phos/45",
        chip: "bg-phos/15 text-phos",
        text: "text-phos",
        bar: "bg-phos",
        label: "bull",
        glyph: "▲",
      }
    : isBear
      ? {
          border: "border-siren/45",
          chip: "bg-siren/15 text-siren",
          text: "text-siren",
          bar: "bg-siren",
          label: "bear",
          glyph: "▼",
        }
      : {
          border: "border-wire-700",
          chip: "bg-wire-800 text-wire-300",
          text: "text-wire-300",
          bar: "bg-wire-500",
          label: "neutral",
          glyph: "◆",
        };

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1 z-[22] w-[min(96%,300px)] -translate-x-1/2 ${
        compact ? "scale-90" : ""
      }`}
    >
      <div
        className={`overflow-hidden rounded-lg border ${accent.border} bg-ink-950/95 shadow-float backdrop-blur-sm`}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${accent.chip}`}
            aria-hidden
          >
            {accent.glyph}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-1">
              <span
                className={`text-[9px] font-bold uppercase tracking-[0.22em] ${accent.text}`}
              >
                {accent.label}
              </span>
              <span
                className={`font-mono text-[10px] font-bold tabular-nums ${accent.text}`}
              >
                {conf}%
              </span>
            </div>
            <p className="truncate text-[10px] leading-snug text-wire-200">
              {verdict.summary}
            </p>
            {outlookLine ? (
              <p className={`truncate font-mono text-[9px] tabular-nums ${accent.text}`}>
                {outlookLine}
              </p>
            ) : null}
          </div>
        </div>
        <div className="h-0.5 w-full bg-wire-900">
          <div
            className={`h-full ${accent.bar}`}
            style={{ width: `${conf}%` }}
          />
        </div>
      </div>
    </div>
  );
}
