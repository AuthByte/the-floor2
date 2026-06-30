import { useState } from "react";

import type { FloorPost } from "../../lib/floorSocial/types";
import { downloadShareCard, renderPostShareCard } from "../../lib/floorSocial/shareCard";

interface Props {
  post: FloorPost;
  className?: string;
}

export function ShareCardButton({ post, className = "" }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const blob = await renderPostShareCard(post);
      const ticker = post.tickers[0] ?? "run";
      downloadShareCard(blob, `floor-${ticker}-${post.id.slice(0, 8)}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleExport()}
        className="rounded border border-wire-800 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-400 transition hover:border-brass/40 hover:text-brass disabled:opacity-40"
      >
        {busy ? "Exporting…" : "Share card"}
      </button>
      {error ? <p className="mt-1 text-[10px] text-siren">{error}</p> : null}
    </div>
  );
}
