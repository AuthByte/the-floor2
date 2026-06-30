import { useEffect, useMemo, useState } from "react";

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
  open: boolean;
  posts: FloorPost[];
  leftId?: string | null;
  rightId?: string | null;
  onClose: () => void;
  onCompare?: (left: FloorPost, right: FloorPost) => void;
}

function PostPicker({
  label,
  posts,
  value,
  onChange,
}: {
  label: string;
  posts: FloorPost[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[11px] text-wire-200 outline-none focus:border-brass/50"
      >
        <option value="">Select a run…</option>
        {posts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.tickers.join(", ")} — {p.author.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function SnapshotColumn({ post }: { post: FloorPost }) {
  const primary = post.snapshot.tickers[0];
  const weather = primary?.weather;
  const condition = weather ? CONDITION_COPY[weather.condition] : null;

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded border border-wire-800/80 bg-ink-900/30 p-4">
      <AuthorChip author={post.author} />
      <div className="font-mono text-lg font-bold text-wire-100">{post.tickers.join(", ")}</div>
      {post.caption ? (
        <p className="text-[12px] leading-relaxed text-wire-400">{post.caption}</p>
      ) : null}

      {primary ? (
        <>
          <div className="flex flex-wrap gap-2">
            {primary.summaryLine ? (
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                  ACTION_CHIP[primary.summaryLine.action] ?? "border-wire-700 text-wire-400"
                }`}
              >
                boss {primary.summaryLine.action}
                {primary.summaryLine.confidence != null
                  ? ` ${primary.summaryLine.confidence}%`
                  : ""}
              </span>
            ) : null}
            {condition ? (
              <span className={`font-mono text-[9px] uppercase ${condition.tone}`}>
                {condition.emoji} {weather?.headline}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-phos">
              {primary.tally.bullish} bull
            </span>
            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-siren">
              {primary.tally.bearish} bear
            </span>
            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-wire-500">
              {primary.tally.neutral} neutral
            </span>
          </div>

          {primary.disputes.length > 0 ? (
            <div>
              <h4 className="mb-1 font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
                Disputes
              </h4>
              <ul className="space-y-1">
                {primary.disputes.map((d, i) => (
                  <li key={i} className="text-[11px] text-wire-500">
                    · {d.summary}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="font-mono text-[9px] text-wire-600">
        {post.analystCount} desks · {post.model.split("/").pop()}
      </div>
    </div>
  );
}

export function ComparePostsModal({
  open,
  posts,
  leftId,
  rightId,
  onClose,
  onCompare,
}: Props) {
  const [left, setLeft] = useState(leftId ?? "");
  const [right, setRight] = useState(rightId ?? "");

  useEffect(() => {
    if (open) {
      setLeft(leftId ?? "");
      setRight(rightId ?? "");
    }
  }, [open, leftId, rightId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const leftPost = useMemo(() => posts.find((p) => p.id === left), [posts, left]);
  const rightPost = useMemo(() => posts.find((p) => p.id === right), [posts, right]);

  if (!open) return null;

  return (
    <div
      className="desk-backdrop absolute inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink-950/65 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-brass/30 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="compare-posts-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-5 py-4">
          <h2
            id="compare-posts-title"
            className="font-display text-base font-bold tracking-wide text-wire-100"
          >
            Compare runs
          </h2>
          <p className="mt-1 text-[11px] text-wire-500">
            Side-by-side tally, disputes, weather, and boss action.
          </p>
        </header>

        <div className="grid shrink-0 gap-3 border-b border-wire-800 px-5 py-4 sm:grid-cols-2">
          <PostPicker label="Run A" posts={posts} value={left} onChange={setLeft} />
          <PostPicker label="Run B" posts={posts} value={right} onChange={setRight} />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 sm:grid-cols-2">
          {leftPost ? (
            <SnapshotColumn post={leftPost} />
          ) : (
            <div className="flex items-center justify-center rounded border border-dashed border-wire-800 p-8 font-mono text-[10px] text-wire-600">
              Pick run A
            </div>
          )}
          {rightPost ? (
            <SnapshotColumn post={rightPost} />
          ) : (
            <div className="flex items-center justify-center rounded border border-dashed border-wire-800 p-8 font-mono text-[10px] text-wire-600">
              Pick run B
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-wire-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wire-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400"
          >
            Close
          </button>
          {leftPost && rightPost && onCompare ? (
            <button
              type="button"
              onClick={() => onCompare(leftPost, rightPost)}
              className="rounded border border-brass/50 bg-brass/10 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass"
            >
              Confirm compare
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
