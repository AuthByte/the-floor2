import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AppNotification,
  FloorPost,
  FloorPostAuthor,
  FloorPostComment,
  MemberDesk,
  MemberProfile,
  ShadowVerdictCommentMetadata,
  ShiftPresence,
  PostReactionKind,
} from "./types";
import { emptyReactionCounts } from "./types";
import { fetchFeed } from "./api";

interface MemberDeskRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  enabled_agents: string[];
  model: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  kind: string;
  metadata: ShadowVerdictCommentMetadata | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  profiles:
    | { id: string; display_name: string | null; avatar_url: string | null }
    | { id: string; display_name: string | null; avatar_url: string | null }[]
    | null;
}

const DESK_SELECT =
  "id, user_id, name, description, enabled_agents, model, is_public, created_at, updated_at";

function mapAuthor(
  row:
    | { id: string; display_name: string | null; avatar_url: string | null }
    | { id: string; display_name: string | null; avatar_url: string | null }[]
    | null,
  fallbackId: string,
): FloorPostAuthor {
  const resolved = Array.isArray(row) ? row[0] : row;
  return {
    id: resolved?.id ?? fallbackId,
    displayName: resolved?.display_name?.trim() || "Desk analyst",
    avatarUrl: resolved?.avatar_url,
  };
}

function rowToDesk(row: MemberDeskRow): MemberDesk {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    enabledAgents: row.enabled_agents ?? [],
    model: row.model,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchMemberDesks(
  supabase: SupabaseClient,
  userId: string,
): Promise<MemberDesk[]> {
  const { data, error } = await supabase
    .from("member_desks")
    .select(DESK_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data as MemberDeskRow[]) ?? []).map(rowToDesk);
}

export async function fetchPublicDesks(
  supabase: SupabaseClient,
  limit = 24,
): Promise<MemberDesk[]> {
  const { data, error } = await supabase
    .from("member_desks")
    .select(DESK_SELECT)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as MemberDeskRow[]) ?? []).map(rowToDesk);
}

export interface SaveMemberDeskInput {
  id?: string;
  name: string;
  description?: string | null;
  enabledAgents: string[];
  model?: string | null;
  isPublic?: boolean;
}

export async function saveMemberDesk(
  supabase: SupabaseClient,
  userId: string,
  input: SaveMemberDeskInput,
): Promise<MemberDesk> {
  const row = {
    user_id: userId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    enabled_agents: input.enabledAgents,
    model: input.model?.trim() || null,
    is_public: input.isPublic ?? false,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("member_desks")
      .update(row)
      .eq("id", input.id)
      .eq("user_id", userId)
      .select(DESK_SELECT)
      .single();
    if (error) throw error;
    return rowToDesk(data as MemberDeskRow);
  }

  const { data, error } = await supabase
    .from("member_desks")
    .insert(row)
    .select(DESK_SELECT)
    .single();
  if (error) throw error;
  return rowToDesk(data as MemberDeskRow);
}

export async function deleteMemberDesk(
  supabase: SupabaseClient,
  userId: string,
  deskId: string,
): Promise<void> {
  const { error } = await supabase
    .from("member_desks")
    .delete()
    .eq("id", deskId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function addShadowComment(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  body: string,
  metadata: ShadowVerdictCommentMetadata,
): Promise<FloorPostComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment cannot be empty.");

  const { data, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: postId,
      user_id: userId,
      body: trimmed,
      kind: "shadow_verdict",
      metadata,
    })
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
    author: mapAuthor(row.profiles, row.user_id),
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: "shadow_verdict",
    metadata: row.metadata,
  };
}

export async function applyMemberDesk(
  supabase: SupabaseClient,
  userId: string,
  deskId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("member_desks")
    .select("enabled_agents")
    .eq("id", deskId)
    .or(`user_id.eq.${userId},is_public.eq.true`)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return (data.enabled_agents as string[]) ?? [];
}

interface PresenceRow {
  user_id: string;
  tickers: string[];
  model: string;
  analyst_count: number;
  visible: boolean;
  started_at: string;
  updated_at: string;
  profiles:
    | { id: string; display_name: string | null; avatar_url: string | null }
    | { id: string; display_name: string | null; avatar_url: string | null }[]
    | null;
}

function rowToPresence(row: PresenceRow): ShiftPresence {
  return {
    userId: row.user_id,
    tickers: row.tickers ?? [],
    model: row.model,
    analystCount: row.analyst_count,
    visible: row.visible,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    author: mapAuthor(row.profiles, row.user_id),
  };
}

const PRESENCE_SELECT = `
  user_id, tickers, model, analyst_count, visible, started_at, updated_at,
  profiles!user_id ( id, display_name, avatar_url )
`;

export async function fetchShiftPresence(
  supabase: SupabaseClient,
): Promise<ShiftPresence[]> {
  return fetchActivePresence(supabase);
}

export async function fetchActivePresence(
  supabase: SupabaseClient,
): Promise<ShiftPresence[]> {
  const { data, error } = await supabase
    .from("shift_presence")
    .select(PRESENCE_SELECT)
    .eq("visible", true)
    .order("updated_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return ((data as unknown as PresenceRow[]) ?? []).map(rowToPresence);
}

export async function upsertShiftPresence(
  supabase: SupabaseClient,
  userId: string,
  input: {
    tickers: string[];
    model: string;
    analystCount: number;
    visible?: boolean;
  },
): Promise<ShiftPresence> {
  const row = {
    user_id: userId,
    tickers: input.tickers,
    model: input.model,
    analyst_count: input.analystCount,
    visible: input.visible ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("shift_presence")
    .upsert(row, { onConflict: "user_id" })
    .select(PRESENCE_SELECT)
    .single();
  if (error) throw error;
  return rowToPresence(data as unknown as PresenceRow);
}

export async function clearShiftPresence(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("shift_presence").delete().eq("user_id", userId);
  if (error) throw error;
}

interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  actor_id: string | null;
  post_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
  profiles:
    | { id: string; display_name: string | null; avatar_url: string | null }
    | { id: string; display_name: string | null; avatar_url: string | null }[]
    | null;
}

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as AppNotification["kind"],
    actorId: row.actor_id,
    actor: row.actor_id ? mapAuthor(row.profiles, row.actor_id) : null,
    postId: row.post_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function fetchNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, user_id, kind, actor_id, post_id, body, read_at, created_at, profiles!actor_id ( id, display_name, avatar_url )",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as NotificationRow[]) ?? []).map(rowToNotification);
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  ids?: string[],
): Promise<void> {
  const now = new Date().toISOString();
  let query = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .is("read_at", null);
  if (ids?.length) query = query.in("id", ids);
  const { error } = await query;
  if (error) throw error;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  following_count: number;
}

export async function fetchProfileByHandle(
  supabase: SupabaseClient,
  viewerId: string,
  handle: string,
): Promise<{ profile: MemberProfile; posts: FloorPost[] } | null> {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  const { data: profileRow, error } = await supabase
    .from("profiles")
    .select("id, display_name, handle, avatar_url, bio, follower_count, following_count")
    .ilike("handle", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!profileRow) return null;

  const row = profileRow as ProfileRow;

  const { data: follow } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("following_id", row.id)
    .maybeSingle();

  const profile: MemberProfile = {
    id: row.id,
    displayName: row.display_name?.trim() || "Desk analyst",
    avatarUrl: row.avatar_url,
    handle: row.handle,
    bio: row.bio,
    followerCount: row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    followingByMe: Boolean(follow),
  };

  const { data: postRows, error: postErr } = await supabase
    .from("floor_posts")
    .select(
      "id, author_id, shift_id, run_id, caption, tickers, model, analyst_count, ts_ms, snapshot, hero_artifact_url, like_count, comment_count, published_at, profiles!author_id ( id, display_name, avatar_url )",
    )
    .eq("author_id", row.id)
    .order("published_at", { ascending: false })
    .limit(20);
  if (postErr) throw postErr;

  const posts: FloorPost[] = ((postRows as unknown[]) ?? []).map((p) => {
    const pr = p as {
      id: string;
      author_id: string;
      shift_id: string | null;
      run_id: string | null;
      caption: string | null;
      tickers: string[];
      model: string;
      analyst_count: number;
      ts_ms: number;
      snapshot: FloorPost["snapshot"];
      hero_artifact_url: string | null;
      like_count: number;
      comment_count: number;
      published_at: string;
      profiles: ProfileRow | ProfileRow[] | null;
    };
    return {
      id: pr.id,
      authorId: pr.author_id,
      author: mapAuthor(pr.profiles as Parameters<typeof mapAuthor>[0], pr.author_id),
      shiftId: pr.shift_id,
      runId: pr.run_id,
      watchlistId: null,
      postKind: "shift",
      caption: pr.caption,
      tickers: pr.tickers ?? [],
      model: pr.model,
      analystCount: pr.analyst_count,
      tsMs: pr.ts_ms,
      snapshot: pr.snapshot,
      heroArtifactUrl: pr.hero_artifact_url,
      likeCount: pr.like_count,
      commentCount: pr.comment_count,
      publishedAt: pr.published_at,
      likedByMe: false,
    };
  });

  // Enrich likedByMe from feed helper when needed
  if (posts.length) {
    const feed = await fetchFeed(supabase, viewerId, { limit: 40 });
    const liked = new Set(feed.filter((p) => p.likedByMe).map((p) => p.id));
    for (const post of posts) {
      post.likedByMe = liked.has(post.id);
    }
  }

  return { profile, posts };
}

export async function toggleFollow(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  currentlyFollowing: boolean,
): Promise<void> {
  if (currentlyFollowing) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", targetId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: userId, following_id: targetId });
  if (error) throw error;
}

const POST_SELECT = `
  id, author_id, shift_id, run_id, caption, tickers, model, analyst_count,
  ts_ms, snapshot, hero_artifact_url, like_count, comment_count, published_at,
  reaction_counts, profiles!author_id ( id, display_name, avatar_url )
`;

function rowToFeedPost(
  row: {
    id: string;
    author_id: string;
    shift_id: string | null;
    run_id: string | null;
    caption: string | null;
    tickers: string[];
    model: string;
    analyst_count: number;
    ts_ms: number;
    snapshot: FloorPost["snapshot"];
    hero_artifact_url: string | null;
    like_count: number;
    comment_count: number;
    published_at: string;
    reaction_counts?: FloorPost["reactionCounts"];
    profiles: Parameters<typeof mapAuthor>[0];
  },
  likedByMe = false,
  myReactions: PostReactionKind[] = [],
): FloorPost {
  return {
    id: row.id,
    authorId: row.author_id,
    author: mapAuthor(row.profiles, row.author_id),
    shiftId: row.shift_id,
    runId: row.run_id,
    watchlistId: null,
    postKind: "shift",
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
    myReactions,
  };
}

export async function fetchFollowingFeed(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<FloorPost[]> {
  const { data: follows, error: followErr } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (followErr) throw followErr;

  const followingIds = (follows ?? []).map((f) => f.following_id as string);
  if (!followingIds.length) return [];

  const { data, error } = await supabase
    .from("floor_posts")
    .select(POST_SELECT)
    .in("author_id", followingIds)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const posts = (data as unknown[]) ?? [];
  if (!posts.length) return [];

  const postIds = posts.map((p) => (p as { id: string }).id);
  const { data: likes } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  const liked = new Set((likes ?? []).map((l) => l.post_id as string));

  const { data: reactions } = await supabase
    .from("post_reactions")
    .select("post_id, reaction")
    .eq("user_id", userId)
    .in("post_id", postIds);
  const mineByPost = new Map<string, PostReactionKind[]>();
  for (const r of reactions ?? []) {
    const pid = r.post_id as string;
    const list = mineByPost.get(pid) ?? [];
    list.push(r.reaction as PostReactionKind);
    mineByPost.set(pid, list);
  }

  return posts.map((row) =>
    rowToFeedPost(
      row as Parameters<typeof rowToFeedPost>[0],
      liked.has((row as { id: string }).id),
      mineByPost.get((row as { id: string }).id) ?? [],
    ),
  );
}

export async function toggleReaction(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  reaction: PostReactionKind,
  currentlyActive: boolean,
): Promise<void> {
  if (currentlyActive) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("reaction", reaction);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("post_reactions").insert({
    post_id: postId,
    user_id: userId,
    reaction,
  });
  if (error) throw error;
}
