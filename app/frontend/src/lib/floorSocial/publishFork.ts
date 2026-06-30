import type { SupabaseClient } from "@supabase/supabase-js";

import { FLOOR_POST_SELECT, fetchPost, mapFloorPostRow, type FloorPostRow } from "./api";
import { isForkPost } from "./forkSnapshot";
import type { FloorPost, PublishForkInput } from "./types";

export async function publishForkPost(
  supabase: SupabaseClient,
  userId: string,
  input: PublishForkInput,
): Promise<FloorPost> {
  if (!input.parentPostId) {
    throw new Error("Parent post is required to publish a fork.");
  }
  if (input.forkMeta.parentPostId !== input.parentPostId) {
    throw new Error("fork_meta.parentPostId must match parentPostId.");
  }
  if (input.forkMeta.version !== 1 || input.forkMeta.kind !== "shadow_fork") {
    throw new Error("Invalid fork metadata.");
  }
  if (input.forkMeta.enabledAgents.length < 1) {
    throw new Error("At least one desk must remain enabled.");
  }

  const parent = await fetchPost(supabase, userId, input.parentPostId);
  if (!parent) {
    throw new Error("Parent post not found or not visible.");
  }

  const parentTicker = parent.snapshot.tickers.find(
    (t) => t.ticker.toUpperCase() === input.forkMeta.ticker.toUpperCase(),
  );
  if (!parentTicker) {
    throw new Error(`Ticker ${input.forkMeta.ticker} is not in the parent snapshot.`);
  }

  const row = {
    author_id: userId,
    shift_id: input.shiftId ?? parent.shiftId,
    run_id: input.runId ?? parent.runId,
    caption: input.caption?.trim() || null,
    tickers: input.tickers,
    model: input.model,
    analyst_count: input.analystCount,
    ts_ms: input.tsMs,
    snapshot: input.snapshot,
    hero_artifact_url: input.heroArtifactUrl ?? parent.heroArtifactUrl,
    forked_from_post_id: input.parentPostId,
    fork_meta: input.forkMeta,
    post_kind: "shadow_fork",
  };

  const { data, error } = await supabase
    .from("floor_posts")
    .insert(row)
    .select(FLOOR_POST_SELECT)
    .single();
  if (error) throw error;
  return mapFloorPostRow(data as FloorPostRow, false);
}

export async function fetchForksForPost(
  supabase: SupabaseClient,
  userId: string,
  parentPostId: string,
  limit = 20,
): Promise<FloorPost[]> {
  const { data, error } = await supabase
    .from("floor_posts")
    .select(FLOOR_POST_SELECT)
    .eq("forked_from_post_id", parentPostId)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const posts = (data as FloorPostRow[]) ?? [];
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: likes, error: likeErr } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  if (likeErr) throw likeErr;

  const liked = new Set((likes ?? []).map((l) => l.post_id as string));
  return posts.map((row) => mapFloorPostRow(row, liked.has(row.id)));
}

export async function findUserShiftPost(
  supabase: SupabaseClient,
  userId: string,
  opts: { runId?: string | null; shiftId?: string | null; ticker?: string },
): Promise<FloorPost | null> {
  let query = supabase
    .from("floor_posts")
    .select(FLOOR_POST_SELECT)
    .eq("author_id", userId)
    .neq("post_kind", "shadow_fork")
    .order("published_at", { ascending: false })
    .limit(20);

  if (opts.runId) {
    query = query.eq("run_id", opts.runId);
  } else if (opts.shiftId && /^[0-9a-f-]{36}$/i.test(opts.shiftId)) {
    query = query.eq("shift_id", opts.shiftId);
  } else {
    return null;
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data as FloorPostRow[]) ?? [];
  const shiftPosts = rows.filter((r) => !isForkPost({ postKind: r.post_kind as FloorPost["postKind"], forkMeta: null }));
  if (!opts.ticker) {
    return shiftPosts.length ? mapFloorPostRow(shiftPosts[0], false) : null;
  }

  const upper = opts.ticker.toUpperCase();
  const match = shiftPosts.find((r) =>
    (r.tickers ?? []).some((t) => t.toUpperCase() === upper),
  );
  return match ? mapFloorPostRow(match, false) : shiftPosts.length ? mapFloorPostRow(shiftPosts[0], false) : null;
}
