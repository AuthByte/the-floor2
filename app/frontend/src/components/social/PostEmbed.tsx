import { CONDITION_COPY } from "../../lib/weatherReport";
import type { FloorPost } from "../../lib/floorSocial/types";
import { AuthorChip } from "./AuthorChip";

const ACTION_CHIP: Record<string, string> = {
  buy: "border-phos/40 bg-phos/10 text-phos",
  cover: "border-phos/30 bg-phos/5 text-phos",
  sell: "border-siren/40 bg-siren/10 text-siren",
  short: "border-siren/40 bg-siren/10 text-siren",
  hold: "border-amber/40 bg-amber/10 text-amber",
};

interface Props {
  post: FloorPost;
  onOpen?: () => void;
  watchReplayUrl?: string;
}

export function PostEmbed({ post, onOpen, watchReplayUrl }: Props) {
  const primary = post.snapshot.tickers[0];
  const weather = primary?.weather;
  const condition = weather ? CONDITION_COPY[weather.condition] : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <AuthorChip author={post.author} />
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-brass/60">
          embed
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-wire-100">{post.tickers.join(", ")}</span>
        {primary?.summaryLine ? (
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${
              ACTION_CHIP[primary.summaryLine.action] ?? "border-wire-700 text-wire-400"
            }`}
          >
            {primary.summaryLine.action}
          </span>
        ) : null}
      </div>

      {post.caption ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-wire-400">
          {post.caption}
        </p>
      ) : null}

      {primary ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="font-mono text-[8px] text-phos">{primary.tally.bullish}b</span>
          <span className="font-mono text-[8px] text-siren">{primary.tally.bearish}b</span>
          <span className="font-mono text-[8px] text-wire-500">{primary.tally.neutral}n</span>
          {condition ? (
            <span className={`font-mono text-[8px] uppercase ${condition.tone}`}>
              {condition.emoji}
            </span>
          ) : null}
        </div>
      ) : null}

      {watchReplayUrl ? (
        <a
          href={watchReplayUrl}
          className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-brass hover:text-brass/80"
        >
          Watch replay →
        </a>
      ) : null}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block w-full max-w-sm rounded-lg border border-wire-800/90 bg-ink-900/60 p-3 text-left shadow-[inset_0_1px_0_rgb(var(--brass)/0.06)] transition hover:border-brass/30 hover:bg-ink-800/50"
      >
        {inner}
      </button>
    );
  }

  return (
    <article className="w-full max-w-sm rounded-lg border border-wire-800/90 bg-ink-900/60 p-3 shadow-[inset_0_1px_0_rgb(var(--brass)/0.06)]">
      {inner}
    </article>
  );
}
