import type { FloorPost } from "./types";

const W = 720;
const H = 400;

function actionColor(action: string): string {
  if (action === "buy" || action === "cover") return "#4ade80";
  if (action === "sell" || action === "short") return "#f87171";
  return "#fbbf24";
}

export async function renderPostShareCard(post: FloorPost): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(201, 168, 76, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  ctx.fillStyle = "rgba(201, 168, 76, 0.7)";
  ctx.font = "600 11px ui-monospace, monospace";
  ctx.fillText("THE FLOOR · SHARED RUN", 32, 48);

  ctx.fillStyle = "#e8eaed";
  ctx.font = "bold 28px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(post.tickers.join(", "), 32, 92);

  const primary = post.snapshot.tickers[0];
  const action = primary?.summaryLine?.action ?? "hold";
  const conf = primary?.summaryLine?.confidence;

  ctx.fillStyle = actionColor(action);
  ctx.font = "600 14px ui-monospace, monospace";
  ctx.fillText(
    `BOSS ${action.toUpperCase()}${conf != null ? ` · ${conf}%` : ""}`,
    32,
    124,
  );

  if (primary) {
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(
      `${primary.tally.bullish} bull · ${primary.tally.bearish} bear · ${primary.tally.neutral} neutral`,
      32,
      156,
    );
  }

  if (post.caption) {
    ctx.fillStyle = "#c5cad3";
    ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
    const words = post.caption.split(/\s+/);
    let line = "";
    let y = 196;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > W - 64) {
        ctx.fillText(line, 32, y);
        line = word;
        y += 22;
        if (y > 300) break;
      } else {
        line = test;
      }
    }
    if (line && y <= 300) ctx.fillText(line, 32, y);
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(
    `@${post.author.handle ?? post.author.displayName} · ${post.analystCount} desks`,
    32,
    H - 36,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export image"));
    }, "image/png");
  });
}

export function downloadShareCard(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
