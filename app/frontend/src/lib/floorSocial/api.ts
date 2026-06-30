import type { SupabaseClient } from "@supabase/supabase-js";

import { getApiBaseUrl } from "../api";
import { assertCanPublishSocial } from "../entitlements";
import { inferPostKind, parseForkMeta } from "./forkSnapshot";
import type {
  FloorPost,
  FloorPostAuthor,
  FloorPostComment,
  FloorPostSnapshot,
  PublishDigestPostInput,
  PublishPostInput,
} from "./types";
import { emptyReactionCounts } from "./types";

interface PostRow {
  id: string;
  author_id: string;
  shift_id: string | null;
  run_id: string | null;
  watchlist_id: string | null;
  post_kind: string | null;
  forked_from_post_id: string | null;
  fork_meta: unknown;
  caption: string | null;
  tickers: string[];
  model: string;
  analyst_count: number;
  ts_ms: number;
  snapshot: FloorPostSnapshot;
  hero_artifact_url: string | null;
  like_count: number;
  comment_count: number;
  published_at: string;
  reaction_counts?: import("./types").PostReactionCounts;
  scorecard?: import("./types").PostScorecard;
  scores_updated_at?: string | null;
  profiles: ProfileRow | ProfileRow[] | null;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle?: string | null;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  profiles: ProfileRow | ProfileRow[] | null;
}

function resolveProfile(
  profiles: ProfileRow | ProfileRow[] | null | undefined,
  fallbackId: string,
): FloorPostAuthor {
  const row = Array.isArray(profiles) ? profiles[0] : profiles;
  return mapAuthor(row ?? null, fallbackId);
}

function mapAuthor(row: ProfileRow | null, fallbackId: string): FloorPostAuthor {
  return {
    id: row?.id ?? fallbackId,
    displayName: row?.display_name?.trim() || "Desk analyst",
    handle: row?.handle ?? null,
    avatarUrl: row?.avatar_url,
  };
}

function rowToPost(row: PostRow, likedByMe = false): FloorPost {
  return {
    id: row.id,
    authorId: row.author_id,
    author: resolveProfile(row.profiles, row.author_id),
    shiftId: row.shift_id,
    runId: row.run_id,
    watchlistId: row.watchlist_id ?? null,
    postKind: inferPostKind(row),
    caption: row.caption,
    tickers: row.tickers ?? [],
    model: row.model,
    analystCount: row.analyst_count,
    tsMs: row.ts_ms,
    snapshot: row.snapshot,
    heroArtifactUrl: row.hero_artifact_url,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    publishedAt: row.published_at,
    likedByMe,
    reactionCounts: row.reaction_counts ?? emptyReactionCounts(),
    scorecard: row.scorecard,
    scoresUpdatedAt: row.scores_updated_at ?? null,
    forkedFromPostId: row.forked_from_post_id ?? null,
    forkMeta: parseForkMeta(row.fork_meta),
  };
}

export const FLOOR_POST_SELECT = `
  id, author_id, shift_id, run_id, watchlist_id, post_kind, caption, tickers, model, analyst_count,
  ts_ms, snapshot, hero_artifact_url, like_count, comment_count, published_at,
  reaction_counts, scorecard, scores_updated_at,
  forked_from_post_id, fork_meta,
  profiles!author_id ( id, display_name, avatar_url, handle )
`;

const POST_SELECT = FLOOR_POST_SELECT;

export { rowToPost as mapFloorPostRow };
export type { PostRow as FloorPostRow };

export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<void> {
  const displayName = email?.split("@")[0] || "desk_analyst";
  const { error } = await supabase.from("profiles").upsert(
    { id: userId, display_name: displayName, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<FloorPostAuthor | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapAuthor(data, userId);
}

export async function updateDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchFeed(
  supabase: SupabaseClient,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<FloorPost[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error } = await supabase
    .from("floor_posts")
    .select(POST_SELECT)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const posts = (data as PostRow[]) ?? [];
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: likes, error: likeErr } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  if (likeErr) throw likeErr;

  const liked = new Set((likes ?? []).map((l) => l.post_id as string));
  return posts.map((row) => rowToPost(row, liked.has(row.id)));
}

export async function fetchPost(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
): Promise<FloorPost | null> {
  const { data, error } = await supabase
    .from("floor_posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: like } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  return rowToPost(data as PostRow, Boolean(like));
}

export async function isShiftPublished(
  supabase: SupabaseClient,
  userId: string,
  shiftId: string,
  runId?: string | null,
): Promise<boolean> {
  if (/^[0-9a-f-]{36}$/i.test(shiftId)) {
    const { data, error } = await supabase
      .from("floor_posts")
      .select("id")
      .eq("author_id", userId)
      .eq("shift_id", shiftId)
      .maybeSingle();
    if (error) throw error;
    if (data) return true;
  }
  if (runId) {
    const { data, error } = await supabase
      .from("floor_posts")
      .select("id")
      .eq("author_id", userId)
      .eq("run_id", runId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  return false;
}

async function linkOutcomesHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { getSupabase } = await import("../supabase");
    const sb = getSupabase();
    if (!sb) return headers;
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    /* optional */
  }
  return headers;
}

export async function linkOutcomesToPost(postId: string, shiftId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/posts/${postId}/link-outcomes`, {
    method: "POST",
    headers: await linkOutcomesHeaders(),
    body: JSON.stringify({ shift_id: shiftId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `link-outcomes failed (${res.status})`);
  }
}

export async function publishPost(
  supabase: SupabaseClient,
  userId: string,
  input: PublishPostInput,
): Promise<FloorPost> {
  await assertCanPublishSocial();
  const isUuid = /^[0-9a-f-]{36}$/i.test(input.shiftId);
  const row = {
    author_id: userId,
    shift_id: isUuid ? input.shiftId : null,
    run_id: input.runId ?? null,
    watchlist_id: input.watchlistId ?? null,
    post_kind: input.postKind ?? "shift",
    caption: input.caption?.trim() || null,
    tickers: input.tickers,
    model: input.model,
    analyst_count: input.analystCount,
    ts_ms: input.tsMs,
    snapshot: input.snapshot,
    hero_artifact_url: input.heroArtifactUrl ?? null,
  };

  const { data, error } = await supabase
    .from("floor_posts")
    .insert(row)
    .select(POST_SELECT)
    .single();
  if (error) throw error;
  const post = rowToPost(data as PostRow, false);
  if (isUuid) {
    try {
      await linkOutcomesToPost(post.id, input.shiftId);
    } catch {
      /* non-fatal — outcomes may not exist yet */
    }
  }
  return post;
}

async function assertWatchlistOwned(
  supabase: SupabaseClient,
  userId: string,
  watchlistId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("Watchlist not found or does not belong to you.");
  }
}

export async function publishDigestPost(
  supabase: SupabaseClient,
  userId: string,
  input: PublishDigestPostInput,
): Promise<FloorPost> {
  await assertWatchlistOwned(supabase, userId, input.watchlistId);
  return publishPost(supabase, userId, {
    ...input,
    postKind: "watchlist_digest",
  });
}

export async function deletePost(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("floor_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", userId);
  if (error) throw error;
}

export async function toggleLike(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  currentlyLiked: boolean,
): Promise<void> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
  if (error) throw error;
}

export async function fetchComments(
  supabase: SupabaseClient,
  postId: string,
): Promise<FloorPostComment[]> {
  const { data, error } = await supabase
    .from("post_comments")
    .select(
      "id, post_id, user_id, body, kind, metadata, created_at, updated_at, profiles!user_id ( id, display_name, avatar_url )",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data as CommentRow[]) ?? []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    author: resolveProfile(row.profiles, row.user_id),
    body: row.body,
    kind: (row.kind as FloorPostComment["kind"]) ?? "text",
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function addComment(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  body: string,
): Promise<FloorPostComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty.");

  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: userId, body: trimmed })
    .select(
      "id, post_id, user_id, body, kind, metadata, created_at, updated_at, profiles!user_id ( id, display_name, avatar_url )",
    )
    .single();
  if (error) throw error;

  const row = data as CommentRow;
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    author: resolveProfile(row.profiles, row.user_id),
    body: row.body,
    kind: (row.kind as FloorPostComment["kind"]) ?? "text",
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteComment(
  supabase: SupabaseClient,
  userId: string,
  commentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
}
