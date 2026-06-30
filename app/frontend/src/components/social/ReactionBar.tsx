import type { PostReactionCounts, PostReactionKind } from "../../lib/floorSocial/types";
import { POST_REACTION_KINDS } from "../../lib/floorSocial/types";

const REACTION_META: Record<
  PostReactionKind,
  { emoji: string; label: string; active: string; idle: string }
> = {
  contrarian: {
    emoji: "🔥",
    label: "contrarian",
    active: "border-amber/50 bg-amber/10 text-amber",
    idle: "border-wire-800 text-wire-500 hover:border-amber/40 hover:text-amber",
  },
  bear_case: {
    emoji: "📉",
    label: "bear case",
    active: "border-siren/50 bg-siren/10 text-siren",
    idle: "border-wire-800 text-wire-500 hover:border-siren/40 hover:text-siren",
  },
  nailed_it: {
    emoji: "🎯",
    label: "nailed it",
    active: "border-phos/50 bg-phos/10 text-phos",
    idle: "border-wire-800 text-wire-500 hover:border-phos/40 hover:text-phos",
  },
};

interface Props {
  counts: PostReactionCounts;
  active: PostReactionKind[];
  onToggle?: (reaction: PostReactionKind) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ReactionBar({ counts, active, onToggle, disabled, compact }: Props) {
  const activeSet = new Set(active);

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`}>
      {POST_REACTION_KINDS.map((kind) => {
        const meta = REACTION_META[kind];
        const isOn = activeSet.has(kind);
        const count = counts[kind] ?? 0;

        if (!onToggle) {
          return (
            <span
              key={kind}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-wire-600"
            >
              <span aria-hidden>{meta.emoji}</span>
              {count}
            </span>
          );
        }

        return (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(kind)}
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition disabled:opacity-40 ${
              isOn ? meta.active : meta.idle
            }`}
            title={meta.label}
          >
            <span aria-hidden>{meta.emoji}</span>
            <span className="hidden sm:inline">{meta.label}</span>
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
