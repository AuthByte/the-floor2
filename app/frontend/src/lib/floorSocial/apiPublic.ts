import { getApiBaseUrl } from "../api";
import { buildReplayFromSnapshot } from "../shiftReplay";
import type { ReplayEvent } from "../shiftReplay";
import type { LogLine } from "../types";
import type { FloorPost, PublicPost } from "./types";
import { emptyReactionCounts } from "./types";

export interface PublicReplayPayload {
  timeline: ReplayEvent[];
  roomIds: string[];
  shiftStartedAt: number;
  log: LogLine[];
  synthesized: boolean;
}

export class PublicPostError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PublicPostError";
  }
}

export function publicPostToFloorPost(post: PublicPost): FloorPost {
  return {
    id: post.id,
    authorId: "public",
    author: {
      id: "public",
      displayName: post.author.displayName,
      handle: post.author.handle,
      avatarUrl: post.author.avatarUrl,
    },
    shiftId: post.shiftId ?? null,
    runId: null,
    watchlistId: null,
    postKind: "shift",
    caption: post.caption,
    tickers: post.tickers,
    model: post.model,
    analystCount: post.analystCount,
    tsMs: post.tsMs,
    snapshot: post.snapshot,
    heroArtifactUrl: post.heroArtifactUrl ?? null,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    publishedAt: post.publishedAt,
    reactionCounts: post.reactionCounts,
    scorecard: post.scorecard,
  };
}

export async function fetchPublicPost(postId: string): Promise<PublicPost> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new PublicPostError("Public posts require API configuration.", 503);
  }

  const res = await fetch(`${base}/public/posts/${encodeURIComponent(postId)}`);
  if (res.status === 404) {
    throw new PublicPostError("Post not found.", 404);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      /* use raw text */
    }
    throw new PublicPostError(message, res.status);
  }
  return res.json() as Promise<PublicPost>;
}

export async function fetchPublicReplay(postId: string): Promise<PublicReplayPayload | null> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new PublicPostError("Public posts require API configuration.", 503);
  }

  const res = await fetch(`${base}/public/posts/${encodeURIComponent(postId)}/replay`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      /* use raw text */
    }
    throw new PublicPostError(message, res.status);
  }

  const data = (await res.json()) as {
    timeline?: PublicReplayPayload["timeline"];
    roomIds?: string[];
    shiftStartedAt?: number;
    log?: PublicReplayPayload["log"];
    synthesized?: boolean;
    snapshot?: PublicPost["snapshot"];
    tsMs?: number;
  };

  if (data.timeline?.length) {
    return {
      timeline: data.timeline,
      roomIds: data.roomIds ?? [],
      shiftStartedAt: data.shiftStartedAt ?? 0,
      log: data.log ?? [],
      synthesized: Boolean(data.synthesized),
    };
  }

  if (data.synthesized && data.snapshot) {
    const fallback = buildReplayFromSnapshot(data.snapshot, data.tsMs ?? Date.now());
    if (!fallback.timeline.length) return null;
    return {
      timeline: fallback.timeline,
      roomIds: fallback.roomIds,
      shiftStartedAt: fallback.shiftStartedAt,
      log: fallback.log ?? [],
      synthesized: true,
    };
  }

  return null;
}

export function emptyPublicPost(id: string): PublicPost {
  return {
    id,
    tickers: [],
    caption: null,
    model: "",
    analystCount: 0,
    tsMs: 0,
    publishedAt: "",
    author: { displayName: "Desk analyst", handle: null, avatarUrl: null },
    snapshot: { tickers: [], artifacts: [], ephemeralArtifactWarnings: [] },
    scorecard: {},
    reactionCounts: emptyReactionCounts(),
    likeCount: 0,
    commentCount: 0,
    hasArchivedReplay: false,
  };
}
