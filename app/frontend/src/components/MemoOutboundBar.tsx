import { useCallback, useState } from "react";
import type { MemoDocument } from "../lib/types";
import {
  ALPACA_LEGAL_DISCLAIMER,
  buildMemoShareUrl,
  copyMemoLink,
  downloadMemoMarkdown,
  printMemoPdf,
} from "../lib/memoExport";
const HAIR = "rgba(22,20,15,0.16)";
const INK_SOFT = "#4A463C";
const FAINT = "#807A6B";
const BRASS = "#A57E22";
const EMERALD = "#0E9F6E";

interface Props {
  doc: MemoDocument;
  onShareToFeed?: () => void;
  publishedPostId?: string | null;
}

export function MemoOutboundBar({ doc, onShareToFeed, publishedPostId }: Props) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyMemoLink({
      ...doc,
      publishedPostId: publishedPostId ?? doc.publishedPostId,
    });
    if (ok) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [doc, publishedPostId]);

  const shareUrl = buildMemoShareUrl({
    ...doc,
    publishedPostId: publishedPostId ?? doc.publishedPostId,
  });

  return (
    <div
      className="memo-outbound-bar flex flex-wrap items-center gap-2 pb-1 print:hidden"
    >
      <ToolbarButton
        label={linkCopied ? "Copied!" : "Copy link"}
        onClick={() => void handleCopyLink()}
        title={shareUrl}
        accent={linkCopied}
      />

      <div className="relative">
        <ToolbarButton
          label="Export ▾"
          onClick={() => setExportOpen((v) => !v)}
          aria-expanded={exportOpen}
        />
        {exportOpen ? (
          <>
            <div
              className="fixed inset-0 z-20"
              aria-hidden
              onClick={() => setExportOpen(false)}
            />
            <div
              className="absolute bottom-full left-0 z-30 mb-1 min-w-[148px] rounded-[3px] py-1 shadow-lg"
              style={{ border: `1px solid ${HAIR}`, background: "#FAF7EF" }}
              role="menu"
            >
              <MenuItem
                label="Download .md"
                onClick={() => {
                  downloadMemoMarkdown(doc);
                  setExportOpen(false);
                }}
              />
              <MenuItem
                label="Print / PDF"
                onClick={() => {
                  printMemoPdf();
                  setExportOpen(false);
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      {onShareToFeed ? (
        <ToolbarButton
          label={publishedPostId ? "On the feed" : "Share to feed"}
          onClick={publishedPostId ? undefined : onShareToFeed}
          disabled={Boolean(publishedPostId)}
          accent={Boolean(publishedPostId)}
        />
      ) : null}

      <p
        className="w-full text-[8px] leading-relaxed tracking-[0.06em]"
        style={{ color: FAINT }}
      >
        {ALPACA_LEGAL_DISCLAIMER}
      </p>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  title,
  disabled,
  accent,
  "aria-expanded": ariaExpanded,
}: {
  label: string;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  accent?: boolean;
  "aria-expanded"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-expanded={ariaExpanded}
      className="rounded-[2px] px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors disabled:cursor-default"
      style={{
        border: `1px solid ${accent ? `${EMERALD}66` : HAIR}`,
        color: accent ? EMERALD : disabled ? FAINT : INK_SOFT,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.color = BRASS;
        e.currentTarget.style.borderColor = `${BRASS}88`;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.color = accent ? EMERALD : INK_SOFT;
        e.currentTarget.style.borderColor = accent ? `${EMERALD}66` : HAIR;
      }}
    >
      {label}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.14em] transition-colors"
      style={{ color: INK_SOFT }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = BRASS;
        e.currentTarget.style.background = "rgba(165,126,34,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = INK_SOFT;
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}
