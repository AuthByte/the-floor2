import { tallyCommitteeOpinions } from "../opinions";
import type { FinalDecisionAction } from "../types";
import {
  buildForkSnapshot,
  diffForkOpinions,
  type ForkSnapshot,
} from "../shiftFork";
import type { FloorPost, FloorPostSnapshot, ForkMeta, PostKind } from "./types";

export function isForkPost(post: Pick<FloorPost, "postKind" | "forkMeta">): boolean {
  return post.postKind === "shadow_fork" || post.forkMeta?.kind === "shadow_fork";
}

export function inferPostKind(row: {
  post_kind?: string | null;
  fork_meta?: unknown;
}): PostKind {
  if (row.post_kind === "shadow_fork") return "shadow_fork";
  if (row.post_kind === "watchlist_digest") return "watchlist_digest";
  const meta = parseForkMeta(row.fork_meta);
  if (meta?.kind === "shadow_fork") return "shadow_fork";
  return "shift";
}

export function parseForkMeta(raw: unknown): ForkMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return null;
  if (obj.version !== 1 || obj.kind !== "shadow_fork") return null;
  if (typeof obj.parentPostId !== "string" || !obj.parentPostId) return null;
  if (!obj.shadow || typeof obj.shadow !== "object") return null;
  return obj as unknown as ForkMeta;
}

export function buildForkMetaFromSnapshot(
  fork: ForkSnapshot,
  parentPost: FloorPost,
): ForkMeta {
  const parentTicker = parentPost.snapshot.tickers.find(
    (t) => t.ticker.toUpperCase() === fork.ticker.toUpperCase(),
  );
  const parentOpinions = parentTicker?.opinions ?? [];
  const enabledSet = new Set(fork.enabledAgents);
  const disabledAgents = parentOpinions
    .map((o) => o.agentKey)
    .filter((k) => !enabledSet.has(k));

  const diffPreview = diffForkOpinions(parentOpinions, fork.verdict.opinions)
    .filter((r) => r.changed)
    .slice(0, 8)
    .map(({ agentKey, agentName, beforeSignal, afterSignal, changed }) => ({
      agentKey,
      agentName,
      beforeSignal,
      afterSignal,
      changed,
    }));

  const parentIsFork = isForkPost(parentPost);
  const ancestorPostId =
    parentPost.forkMeta?.ancestorPostId ??
    (parentIsFork ? (parentPost.forkedFromPostId ?? parentPost.id) : parentPost.id);

  const boss = fork.bossDecision ?? parentTicker?.bossDecision ?? null;

  return {
    version: 1,
    kind: "shadow_fork",
    ticker: fork.ticker.toUpperCase(),
    label: fork.label,
    preset: fork.preset,
    weightMode: fork.weightMode,
    enabledAgents: [...fork.enabledAgents],
    disabledAgents,
    bossAction: boss?.action ?? null,
    bossConfidence: boss?.confidence ?? null,
    refPrice: fork.refPrice ?? parentTicker?.price ?? null,
    shadow: {
      action: fork.verdict.action,
      confidence: fork.verdict.confidence,
      signal: fork.verdict.signal,
      flippedFromBoss: fork.verdict.flippedFromBoss,
      fragility: fork.verdict.fragility,
      fragilityLabel: fork.verdict.fragilityLabel,
      tally: { ...fork.verdict.tally },
    },
    diffPreview,
    ancestorPostId,
    parentPostId: parentPost.id,
    clientForkId: fork.id,
  };
}

export function buildForkPostSnapshot(
  parentSnapshot: FloorPostSnapshot,
  fork: ForkSnapshot,
): FloorPostSnapshot {
  const upper = fork.ticker.toUpperCase();
  const tickers = parentSnapshot.tickers.map((ts) => {
    if (ts.ticker.toUpperCase() !== upper) return ts;
    const opinions = fork.verdict.opinions;
    const tally = tallyCommitteeOpinions(opinions);
    return {
      ...ts,
      opinions,
      tally,
      summaryLine: {
        ticker: upper,
        action: fork.verdict.action,
        confidence: fork.verdict.confidence,
      },
      bossDecision: ts.bossDecision,
    };
  });

  return {
    ...parentSnapshot,
    tickers,
  };
}

export function defaultForkCaption(meta: ForkMeta): string {
  const flip = meta.shadow.flippedFromBoss ? " (flip)" : "";
  return `${meta.preset} fork · ${meta.ticker} → ${meta.shadow.action}${flip}`;
}

export function buildForkPublishBundle(params: {
  fork: ForkSnapshot;
  parentPost: FloorPost;
  caption?: string;
}): {
  forkMeta: ForkMeta;
  snapshot: FloorPostSnapshot;
  caption: string;
  tickers: string[];
} {
  const forkMeta = buildForkMetaFromSnapshot(params.fork, params.parentPost);
  const snapshot = buildForkPostSnapshot(params.parentPost.snapshot, params.fork);
  const caption = params.caption?.trim() || defaultForkCaption(forkMeta);
  const tickers = [forkMeta.ticker];
  return { forkMeta, snapshot, caption, tickers };
}

export function buildForkSnapshotFromBench(params: {
  ticker: string;
  label: string;
  enabledAgents: string[];
  weightMode: ForkSnapshot["weightMode"];
  preset: string;
  payload: Parameters<typeof buildForkSnapshot>[0]["payload"];
  parentShiftId?: string;
  parentPostId?: string;
}): ForkSnapshot {
  return buildForkSnapshot(params);
}

export function bossActionLabel(
  action: FinalDecisionAction["action"] | null | undefined,
): string {
  return action ?? "hold";
}
