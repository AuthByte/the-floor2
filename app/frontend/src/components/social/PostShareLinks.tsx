import { useCallback, useState } from "react";

import { buildPostEmbedUrl, buildPostReplayUrl } from "../../lib/floorSocial/useAppUrl";

interface Props {
  postId: string;
  compact?: boolean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PostShareLinks({ postId, compact = false }: Props) {
  const [replayCopied, setReplayCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const replayUrl = buildPostReplayUrl(postId);
  const embedUrl = buildPostEmbedUrl(postId);
  const embedWithReplayUrl = buildPostEmbedUrl(postId, { inlineReplay: true });

  const handleCopyReplay = useCallback(async () => {
    if (await copyText(replayUrl)) {
      setReplayCopied(true);
      window.setTimeout(() => setReplayCopied(false), 2000);
    }
  }, [replayUrl]);

  const handleCopyEmbed = useCallback(async () => {
    const snippet = `<iframe src="${embedWithReplayUrl}" width="480" height="640" frameborder="0" title="THE FLOOR shift replay"></iframe>`;
    if (await copyText(snippet)) {
      setEmbedCopied(true);
      window.setTimeout(() => setEmbedCopied(false), 2000);
    }
  }, [embedWithReplayUrl]);

  const btnClass = compact
    ? "rounded border border-wire-800 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-400 hover:border-brass/40 hover:text-brass"
    : "rounded border border-wire-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-wire-400 transition hover:border-brass/50 hover:text-brass";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "gap-2"}`}>
      <button type="button" onClick={() => void handleCopyReplay()} className={btnClass}>
        {replayCopied ? "Copied!" : "Copy replay link"}
      </button>
      <button type="button" onClick={() => void handleCopyEmbed()} className={btnClass}>
        {embedCopied ? "Copied!" : "Copy embed code"}
      </button>
      {!compact ? (
        <span className="font-mono text-[9px] text-wire-700" title={embedUrl}>
          Public card + replay
        </span>
      ) : null}
    </div>
  );
}
