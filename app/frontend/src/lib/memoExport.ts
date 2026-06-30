import {
  collectCommitteeOpinions,
  tallyCommitteeOpinions,
  type CommitteeOpinion,
  type ThesisRevision,
} from "./opinions";
import { formatPriceTarget, formatUpsidePct, outlookPlaqueLine } from "./outlookFormat";
import type {
  ChairImpact,
  ChairImpactBlock,
  CompletePayload,
  FinalDecisionAction,
  MemoDocument,
  MemoPosition,
  PaperTradingResult,
} from "./types";

export interface BuildMemoDocumentMeta {
  runId: string;
  shiftId?: string | null;
  publishedPostId?: string | null;
  stampUtc?: string;
}

export const ALPACA_LEGAL_DISCLAIMER =
  "Simulated execution via Alpaca paper. THE FLOOR does not provide investment advice.";

function mapChairImpact(impact: ChairImpact | undefined): ChairImpactBlock | null {
  if (!impact?.consult_count) return null;

  const pmDecisionDelta = Object.entries(impact.decisions)
    .filter(([, d]) => d.changed)
    .map(([ticker, d]) => ({
      ticker,
      before: String(d.before?.action ?? "hold").toUpperCase(),
      after: String(d.after?.action ?? "hold").toUpperCase(),
    }));

  const revisions = impact.revisions
    .filter((r) => r.prompt)
    .map((r, i) => ({
      agentKey: `consult-${i}`,
      agentName: "Chair consult",
      prompt: r.prompt ?? "",
      before: r.before,
      after: r.after,
    }));

  return {
    consultCount: impact.consult_count,
    materialCount: impact.material_count,
    consultedAgents: revisions.map((r) => r.agentKey),
    revisions,
    pmDecisionDelta: pmDecisionDelta.length ? pmDecisionDelta : undefined,
  };
}

export function buildMemoDocument(
  payload: CompletePayload,
  meta: BuildMemoDocumentMeta,
): MemoDocument {
  const decisions = payload.decisions ?? {};
  const analystSignals = payload.analyst_signals ?? {};
  const tickers = Object.keys(decisions);
  const paper = payload.paper_trading;

  const positions: MemoPosition[] = tickers.map((ticker) => {
    const action = decisions[ticker] as FinalDecisionAction;
    const opinions = collectCommitteeOpinions(ticker, analystSignals);
    return {
      ticker,
      action,
      opinions,
      tally: tallyCommitteeOpinions(opinions),
      dossier: payload.ticker_dossiers?.[ticker] ?? null,
      risk: payload.risk_pipeline?.[ticker] ?? null,
      artifacts: payload.shift_artifacts?.[ticker],
    };
  });

  return {
    version: 1,
    runId: meta.runId,
    shiftId: meta.shiftId ?? null,
    publishedPostId: meta.publishedPostId ?? null,
    stampUtc: meta.stampUtc ?? new Date().toISOString().replace("T", " ").slice(0, 19),
    tickers,
    positions,
    paperTrading: paper ?? null,
    chairImpact: mapChairImpact(payload.chair_impact),
    footerNote: paper?.enabled ? "ALPACA PAPER" : "PAPER ONLY",
  };
}

export function buildMemoShareUrl(doc: MemoDocument, baseUrl?: string): string {
  const origin = baseUrl ?? window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  if (doc.publishedPostId) {
    params.set("post", doc.publishedPostId);
  } else if (doc.runId) {
    params.set("memo", doc.runId);
  }
  const qs = params.toString();
  return qs ? `${origin}?${qs}` : origin;
}

function actionLabel(action: string): string {
  return action.toUpperCase();
}

function revisionDiffLine(revisions: ThesisRevision[] | undefined): string | null {
  if (!revisions?.length) return null;
  const latest = revisions[revisions.length - 1];
  if (!latest?.before || !latest?.after) return null;
  const b = latest.before;
  const a = latest.after;
  const parts: string[] = [];
  if (b.signal !== a.signal) {
    parts.push(`signal: ${b.signal ?? "—"} → ${a.signal ?? "—"}`);
  }
  if (b.confidence !== a.confidence) {
    parts.push(`conf: ${b.confidence ?? "—"}% → ${a.confidence ?? "—"}%`);
  }
  if (b.price_target !== a.price_target) {
    parts.push(
      `PT: ${b.price_target != null ? `$${b.price_target}` : "—"} → ${a.price_target != null ? `$${a.price_target}` : "—"}`,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

function formatOpinionRow(op: CommitteeOpinion): string {
  const conf = op.confidence != null ? `${op.confidence}%` : "—";
  const revised = op.userConsulted && op.revisionHistory?.length ? " · revised" : "";
  const outlook = outlookPlaqueLine(op);
  const outlookPart = outlook ? ` · ${outlook}` : "";
  let line = `| ${op.agentName} | ${op.signal} | ${conf} |${revised}${outlookPart} |`;
  const diff = revisionDiffLine(op.revisionHistory);
  if (diff) {
    line += `\n  _${diff}_`;
  }
  if (op.summary) {
    line += `\n  ${op.summary.replace(/\n/g, " ")}`;
  }
  return line;
}

function formatPositionBlock(pos: MemoPosition): string {
  const { ticker, action, opinions, tally } = pos;
  const act = actionLabel(action.action);
  const qty = action.quantity != null ? ` ${action.quantity}` : "";
  const conf =
    typeof action.confidence === "number"
      ? ` · ${Math.round(action.confidence)}% conviction`
      : "";

  const lines: string[] = [
    `## ${ticker} — ${act}${qty}${conf}`,
  ];

  if (action.reasoning?.trim()) {
    lines.push("", `> ${action.reasoning.trim().replace(/\n/g, "\n> ")}`);
  }

  lines.push(
    "",
    `### Committee · ${tally.bullish} bull · ${tally.bearish} bear · ${tally.neutral} neutral`,
    "",
    "| Agent | Signal | Conf | Notes |",
    "|-------|--------|------|-------|",
  );

  for (const op of opinions) {
    lines.push(formatOpinionRow(op));
  }

  const dossier = pos.dossier;
  if (dossier) {
    const facts = dossier.facts?.length ?? 0;
    const claims = dossier.claims?.length ?? 0;
    const disputes = dossier.disputes?.length ?? 0;
    if (facts + claims + disputes > 0) {
      lines.push("", `### Dossier · ${facts} facts · ${claims} claims${disputes ? ` · ${disputes} disputes` : ""}`);
      for (const d of dossier.disputes ?? []) {
        lines.push(`- ⚑ ${d.summary ?? d.kind}`);
      }
    }
  }

  const risk = pos.risk;
  if (risk) {
    const risks = risk.inventory?.length ?? 0;
    const scenarios = risk.scenarios?.length ?? 0;
    if (risks + scenarios > 0) {
      lines.push("", `### Risk pipeline · ${risks} risks · ${scenarios} scenarios`);
      for (const r of risk.inventory?.slice(0, 5) ?? []) {
        lines.push(`- ${r.title}`);
      }
      for (const sc of risk.scenarios?.slice(0, 3) ?? []) {
        lines.push(
          `- ${sc.title}: rev ${sc.impacts?.revenue_pct ?? "—"}% / EPS ${sc.impacts?.eps_pct ?? "—"}%`,
        );
      }
    }
  }

  return lines.join("\n");
}

function formatChairImpact(chair: ChairImpactBlock): string {
  const consultCount = chair.consultCount ?? chair.revisions.length;
  const materialCount = chair.materialCount ?? 0;
  const pmChanged = chair.pmDecisionDelta ?? [];
  let headline = `${consultCount} consult${consultCount === 1 ? "" : "s"} · ${materialCount} material`;
  if (pmChanged.length) {
    headline += ` · PM action changed on ${pmChanged.map((d) => d.ticker).join(", ")}`;
  }

  const lines: string[] = ["## Changed by Chair", "", headline, ""];

  for (const d of pmChanged) {
    lines.push(`**${d.ticker}**: ${d.before} → ${d.after}`);
  }

  for (const rev of chair.revisions) {
    if (!rev.prompt) continue;
    const b = rev.before;
    const a = rev.after;
    const delta =
      b && a
        ? `${a.signal ?? "—"} ${a.confidence != null ? `${a.confidence}%` : ""} (was ${b.signal ?? "—"} ${b.confidence != null ? `${b.confidence}%` : ""})`
        : "";
    lines.push(`- @consult: "${rev.prompt}" → ${delta}`);
  }

  return lines.join("\n");
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatPaperTrading(paper: PaperTradingResult): string {
  const lines: string[] = ["## Alpaca paper desk"];
  if (!paper.enabled && paper.skipped_reason) {
    lines.push("", paper.skipped_reason);
    return lines.join("\n");
  }
  const acct = paper.account;
  if (acct) {
    lines.push(
      "",
      `Equity: ${acct.equity ?? "—"} · Cash: ${acct.cash ?? "—"}`,
    );
  }
  if (paper.orders.length) {
    lines.push(
      "",
      "| Symbol | Action | Qty | Fill | Ref | Status |",
      "|--------|--------|-----|------|-----|--------|",
    );
    for (const o of paper.orders) {
      lines.push(
        `| ${o.ticker} | ${o.action} | ${o.requested_qty} | ${formatPrice(o.filled_avg_price)} | ${formatPrice(o.ref_price)} | ${o.status} |`,
      );
    }
  }
  lines.push("", `_${ALPACA_LEGAL_DISCLAIMER}_`);
  return lines.join("\n");
}

export function memoToMarkdown(doc: MemoDocument): string {
  const header = [
    "# BOSS MEMO",
    `**PORTFOLIO MANAGER → TRADING DESK** · ${doc.stampUtc} UTC`,
    "",
  ];

  const body = doc.positions.map(formatPositionBlock).join("\n\n");

  const chair =
    doc.chairImpact && (doc.chairImpact.revisions.length || doc.chairImpact.pmDecisionDelta?.length)
      ? `\n\n${formatChairImpact(doc.chairImpact)}`
      : "";

  const paper =
    doc.paperTrading && (doc.paperTrading.enabled || doc.paperTrading.skipped_reason)
      ? `\n\n${formatPaperTrading(doc.paperTrading)}`
      : "";

  const footer = [
    "",
    "---",
    `*The Boss · ${doc.positions.length} POSITION${doc.positions.length === 1 ? "" : "S"} · ${doc.footerNote}*`,
    `*${ALPACA_LEGAL_DISCLAIMER}*`,
  ];

  if (doc.runId) {
    footer.push(`*Run: ${doc.runId}*`);
  }

  return [...header, body, chair, paper, ...footer].filter(Boolean).join("\n");
}

export function memoDownloadFilename(doc: MemoDocument): string {
  const syms = doc.tickers.slice(0, 3).join("-") || "shift";
  const date = doc.stampUtc.slice(0, 10);
  return `boss-memo-${syms}-${date}.md`;
}

export function downloadMemoMarkdown(doc: MemoDocument): void {
  const md = memoToMarkdown(doc);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = memoDownloadFilename(doc);
  a.click();
  URL.revokeObjectURL(url);
}

export function printMemoPdf(): void {
  window.print();
}

export async function copyMemoLink(doc: MemoDocument): Promise<boolean> {
  const url = buildMemoShareUrl(doc);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** One-line price target for email/export parity helpers. */
export function opinionOutlookExport(op: CommitteeOpinion): string | null {
  const line = outlookPlaqueLine(op);
  if (!line) return null;
  const target = formatPriceTarget(op.priceTarget);
  const upside = formatUpsidePct(op.upsidePct);
  return [target !== "—" ? `PT ${target}` : null, line, upside || null]
    .filter(Boolean)
    .join(" · ");
}
