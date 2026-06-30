import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getSupabase } from "../supabase";
import { fetchFeed, toggleLike as apiToggleLike } from "./api";
import type { FloorPost } from "./types";

const PAGE_SIZE = 20;

export function useFloorFeed() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<FloorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (reset = false) => {
      const supabase = getSupabase();
      const userId = session?.user?.id;
      if (!supabase || !userId) {
        setPosts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const offset = reset ? 0 : posts.length;
        const batch = await fetchFeed(supabase, userId, {
          limit: PAGE_SIZE,
          offset,
        });
        setPosts((prev) => (reset ? batch : [...prev, ...batch]));
        setHasMore(batch.length === PAGE_SIZE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load feed");
      } finally {
        setLoading(false);
      }
    },
    [session?.user?.id, posts.length],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const refresh = useCallback(() => load(true), [load]);

  const toggleLike = useCallback(
    async (postId: string) => {
      const supabase = getSupabase();
      const userId = session?.user?.id;
      if (!supabase || !userId) return;

      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      const wasLiked = Boolean(post.likedByMe);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByMe: !wasLiked,
                likeCount: Math.max(0, p.likeCount + (wasLiked ? -1 : 1)),
              }
            : p,
        ),
      );

      try {
        await apiToggleLike(supabase, userId, postId, wasLiked);
      } catch {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  likedByMe: wasLiked,
                  likeCount: post.likeCount,
                }
              : p,
          ),
        );
      }
    },
    [posts, session?.user?.id],
  );

  return { posts, loading, error, hasMore, loadMore: () => load(false), refresh, toggleLike };
}
