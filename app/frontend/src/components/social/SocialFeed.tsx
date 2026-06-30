import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../../lib/supabase";
import { fetchFollowingFeed, toggleReaction as apiToggleReaction } from "../../lib/floorSocial/apiExtended";
import { fetchPost } from "../../lib/floorSocial/api";
import { useFloorFeed } from "../../lib/floorSocial/useFloorFeed";
import type { FeedMode, FloorPost, PostReactionKind } from "../../lib/floorSocial/types";
import { emptyReactionCounts } from "../../lib/floorSocial/types";
import { ActiveDesksBar } from "./ActiveDesksBar";
import { ComparePostsModal } from "./ComparePostsModal";
import { FloorPostCard } from "./FloorPostCard";
import { FloorPostDetail } from "./FloorPostDetail";
import { PresenceOptIn } from "./PresenceOptIn";

interface Props {
  feedMode?: FeedMode;
  onFeedModeChange?: (mode: FeedMode) => void;
  onOpenProfile?: (handle: string) => void;
  onCompare?: (left: FloorPost, right: FloorPost) => void;
  onReplayOnFloor?: (post: FloorPost) => void;
  /** Deep-link / notification: open this post on mount */
  initialPostId?: string | null;
  /** Bump to force feed refresh (e.g. after fork publish). */
  refreshNonce?: number;
}

const TABS: { id: FeedMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "compare", label: "Compare" },
];

export function SocialFeed({
  feedMode: feedModeProp,
  onFeedModeChange,
  onOpenProfile,
  onCompare,
  onReplayOnFloor,
  initialPostId,
  refreshNonce,
}: Props = {}) {
  const { session } = useAuth();
  const { posts: allPosts, loading, error, hasMore, loadMore, refresh, toggleLike } = useFloorFeed();
  const [feedMode, setFeedMode] = useState<FeedMode>(feedModeProp ?? "all");
  const [followingPosts, setFollowingPosts] = useState<FloorPost[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [selected, setSelected] = useState<FloorPost | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSeed, setCompareSeed] = useState<FloorPost | null>(null);
  const [reactionOverrides, setReactionOverrides] = useState<
    Record<string, Pick<FloorPost, "myReactions" | "reactionCounts">>
  >({});

  const mode = feedModeProp ?? feedMode;

  function mergePost(post: FloorPost): FloorPost {
    const patch = reactionOverrides[post.id];
    return patch ? { ...post, ...patch } : post;
  }

  const setMode = useCallback(
    (next: FeedMode) => {
      if (feedModeProp == null) setFeedMode(next);
      onFeedModeChange?.(next);
      if (next === "compare") setCompareOpen(true);
    },
    [feedModeProp, onFeedModeChange],
  );

  useEffect(() => {
    if (feedModeProp != null) setFeedMode(feedModeProp);
  }, [feedModeProp]);

  useEffect(() => {
    if (!initialPostId) return;
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) return;
    void fetchPost(supabase, userId, initialPostId).then((p) => {
      if (p) setSelected(p);
    });
  }, [initialPostId, session?.user?.id]);

  useEffect(() => {
    if (!refreshNonce) return;
    void refresh();
  }, [refreshNonce, refresh]);

  useEffect(() => {
    if (mode !== "following") return;
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setFollowingPosts([]);
      return;
    }
    setFollowingLoading(true);
    void fetchFollowingFeed(supabase, userId)
      .then(setFollowingPosts)
      .finally(() => setFollowingLoading(false));
  }, [mode, session?.user?.id]);

  const posts = (mode === "following" ? followingPosts : allPosts).map(mergePost);
  const listLoading = mode === "following" ? followingLoading : loading;

  async function handleToggleReaction(postId: string, reaction: PostReactionKind) {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const counts = post.reactionCounts ?? emptyReactionCounts();
    const mine = post.myReactions ?? [];
    const wasActive = mine.includes(reaction);

    const patch = (p: FloorPost): FloorPost =>
      p.id !== postId
        ? p
        : {
            ...p,
            myReactions: wasActive
              ? mine.filter((r) => r !== reaction)
              : [...mine, reaction],
            reactionCounts: {
              ...counts,
              [reaction]: Math.max(0, counts[reaction] + (wasActive ? -1 : 1)),
            },
          };

    const updated = patch(post);
    setReactionOverrides((prev) => ({
      ...prev,
      [postId]: {
        myReactions: updated.myReactions,
        reactionCounts: updated.reactionCounts,
      },
    }));

    if (mode === "following") {
      setFollowingPosts((prev) => prev.map(patch));
    }

    try {
      await apiToggleReaction(supabase, userId, postId, reaction, wasActive);
    } catch {
      setReactionOverrides((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      if (mode === "following") void fetchFollowingFeed(supabase, userId).then(setFollowingPosts);
    }
  }

  function openProfile(handle: string | null | undefined) {
    if (handle) onOpenProfile?.(handle);
  }

  function resolveParentPost(post: FloorPost): FloorPost | undefined {
    const parentId = post.forkedFromPostId ?? post.forkMeta?.parentPostId;
    if (!parentId) return undefined;
    return allPosts.find((p) => p.id === parentId) ?? followingPosts.find((p) => p.id === parentId);
  }

  function openParentPost(parentId: string) {
    const cached = allPosts.find((p) => p.id === parentId) ?? followingPosts.find((p) => p.id === parentId);
    if (cached) {
      setSelected(cached);
      return;
    }
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) return;
    void fetchPost(supabase, userId, parentId).then((p) => {
      if (p) setSelected(p);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-wire-800/80 px-5 py-4">
        <div className="text-[9px] font-medium uppercase tracking-[0.32em] text-brass/70">
          members wire
        </div>
        <h1 className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100">
          Shared runs
        </h1>
        <p className="mt-1 text-[11px] text-wire-500">
          Published shifts from cleared desks — committee votes, disputes, and artifacts.
        </p>
        <div className="mt-3">
          <PresenceOptIn />
        </div>

        <div className="mt-4 flex gap-1 rounded border border-wire-800/80 bg-ink-900/40 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`flex-1 rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                mode === tab.id
                  ? "bg-brass/15 text-brass"
                  : "text-wire-500 hover:text-wire-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <ActiveDesksBar />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {mode === "compare" ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-wire-600">
              Compare two shared runs
            </p>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="rounded border border-brass/50 bg-brass/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brass transition hover:bg-brass/20"
            >
              Open compare
            </button>
          </div>
        ) : listLoading && posts.length === 0 ? (
          <p className="py-12 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-wire-600">
            Loading feed…
          </p>
        ) : error && mode === "all" ? (
          <div className="rounded border border-siren/40 bg-siren/5 px-4 py-3 text-[12px] text-siren">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="h-1.5 w-1.5 rounded-full bg-wire-700" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-wire-600">
              {mode === "following" ? "no posts from followed desks" : "feed empty"}
            </p>
            <p className="max-w-[32ch] text-[11px] leading-relaxed text-wire-700">
              {mode === "following"
                ? "Follow members to see their shared runs here."
                : "Share a completed shift from the shift ledger to post it here for other members."}
            </p>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-3">
            {posts.map((post) => (
              <li key={post.id}>
                <FloorPostCard
                  post={post}
                  mode="live"
                  showScorecard
                  parentPost={resolveParentPost(post)}
                  onOpenParent={openParentPost}
                  onOpen={() => setSelected(post)}
                  onToggleLike={() => void toggleLike(post.id)}
                  onAuthorClick={() => openProfile(post.author.handle)}
                  onToggleReaction={(r) => void handleToggleReaction(post.id, r)}
                />
              </li>
            ))}
          </ul>
        )}

        {mode === "all" && hasMore && posts.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="rounded border border-wire-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/50 hover:text-brass disabled:opacity-40"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <FloorPostDetail
          post={
            posts.find((p) => p.id === selected.id) ??
            allPosts.find((p) => p.id === selected.id) ??
            selected
          }
          onClose={() => setSelected(null)}
          onToggleLike={() => void toggleLike(selected.id)}
          onDeleted={() => {
            setSelected(null);
            void refresh();
          }}
          onCompare={(p) => {
            setCompareSeed(p);
            setCompareOpen(true);
          }}
          onReplayOnFloor={onReplayOnFloor}
          onOpenProfile={onOpenProfile}
          onOpenParentPost={openParentPost}
          onToggleReaction={(r) => void handleToggleReaction(selected.id, r)}
        />
      ) : null}

      <ComparePostsModal
        open={compareOpen}
        posts={allPosts}
        leftId={compareSeed?.id}
        onClose={() => {
          setCompareOpen(false);
          setCompareSeed(null);
        }}
        onCompare={onCompare}
      />
    </div>
  );
}
