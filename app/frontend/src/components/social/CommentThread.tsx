import { FormEvent, useState } from "react";

import type { FloorPostComment } from "../../lib/floorSocial/types";
import { AuthorChip } from "./AuthorChip";

interface Props {
  comments: FloorPostComment[];
  loading?: boolean;
  currentUserId?: string | null;
  onAdd?: (body: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  readOnly?: boolean;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CommentThread({
  comments,
  loading,
  currentUserId,
  onAdd,
  onDelete,
  readOnly,
}: Props) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!onAdd || !body.trim()) return;
    setBusy(true);
    try {
      await onAdd(body.trim());
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h4 className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
        Comments ({comments.length})
      </h4>

      {loading ? (
        <p className="font-mono text-[10px] text-wire-600">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="font-mono text-[10px] text-wire-700">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded border border-wire-800/80 bg-ink-900/40 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <AuthorChip author={c.author} />
                <span className="shrink-0 font-mono text-[9px] text-wire-700">
                  {formatWhen(c.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-wire-300">{c.body}</p>
              {onDelete && currentUserId === c.userId ? (
                <button
                  type="button"
                  onClick={() => void onDelete(c.id)}
                  className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-wire-600 transition hover:text-siren"
                >
                  delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && onAdd ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded border border-brass/50 bg-brass/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20 disabled:opacity-40"
          >
            {busy ? "Posting…" : "Post comment"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
