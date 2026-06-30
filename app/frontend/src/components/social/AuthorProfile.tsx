import { useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { fetchProfileByHandle, toggleFollow } from "../../lib/floorSocial/apiExtended";
import { getSupabase } from "../../lib/supabase";
import type { FloorPost, MemberProfile } from "../../lib/floorSocial/types";
import { AuthorChip } from "./AuthorChip";
import { FloorPostCard } from "./FloorPostCard";

interface Props {
  handle: string;
  onClose: () => void;
  onOpenPost?: (post: FloorPost) => void;
  onToggleLike?: (postId: string) => void;
  /** Parent may supply profile data instead of fetching */
  profile?: MemberProfile;
  posts?: FloorPost[];
}

export function AuthorProfile({
  handle,
  onClose,
  onOpenPost,
  onToggleLike,
  profile: profileProp,
  posts: postsProp,
}: Props) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<MemberProfile | null>(profileProp ?? null);
  const [posts, setPosts] = useState<FloorPost[]>(postsProp ?? []);
  const [loading, setLoading] = useState(!profileProp);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (profileProp) {
      setProfile(profileProp);
      setPosts(postsProp ?? []);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    void fetchProfileByHandle(supabase, userId, handle)
      .then((result) => {
        if (!result) {
          setError("Profile not found.");
          setProfile(null);
          setPosts([]);
          return;
        }
        setProfile(result.profile);
        setPosts(result.posts);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load profile");
      })
      .finally(() => setLoading(false));
  }, [handle, profileProp, postsProp, session?.user?.id]);

  async function handleFollow() {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId || !profile || profile.id === userId) return;

    const wasFollowing = Boolean(profile.followingByMe);
    setFollowBusy(true);
    setProfile((p) =>
      p
        ? {
            ...p,
            followingByMe: !wasFollowing,
            followerCount: Math.max(0, p.followerCount + (wasFollowing ? -1 : 1)),
          }
        : p,
    );
    try {
      await toggleFollow(supabase, userId, profile.id, wasFollowing);
    } catch {
      setProfile((p) =>
        p
          ? {
              ...p,
              followingByMe: wasFollowing,
              followerCount: profile.followerCount,
            }
          : p,
      );
    } finally {
      setFollowBusy(false);
    }
  }

  const displayHandle = profile?.handle ?? handle.replace(/^@/, "");

  return (
    <div
      className="desk-backdrop absolute inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/55 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-2xl animate-slide-in-right flex-col border-l border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="author-profile-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">
                member profile
              </div>
              <h2
                id="author-profile-title"
                className="mt-1 font-display text-base font-bold tracking-wide text-wire-100"
              >
                @{displayHandle}
              </h2>
              {profile ? (
                <div className="mt-2">
                  <AuthorChip author={profile} />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>

          {profile ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex gap-4 font-mono text-[10px] text-wire-400">
                <span>
                  <strong className="text-wire-200">{profile.followerCount}</strong> followers
                </span>
                <span>
                  <strong className="text-wire-200">{profile.followingCount}</strong> following
                </span>
              </div>
              {session?.user?.id && profile.id !== session.user.id ? (
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={() => void handleFollow()}
                  className={`rounded border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition disabled:opacity-40 ${
                    profile.followingByMe
                      ? "border-wire-700 text-wire-400 hover:border-siren/40 hover:text-siren"
                      : "border-brass/50 bg-brass/10 text-brass hover:bg-brass/20"
                  }`}
                >
                  {profile.followingByMe ? "Unfollow" : "Follow"}
                </button>
              ) : null}
            </div>
          ) : null}

          {profile?.bio ? (
            <p className="mt-3 text-[13px] leading-relaxed text-wire-400">{profile.bio}</p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="py-12 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-wire-600">
              Loading profile…
            </p>
          ) : error ? (
            <p className="text-[12px] text-siren">{error}</p>
          ) : posts.length === 0 ? (
            <p className="font-mono text-[10px] text-wire-600">No shared runs yet.</p>
          ) : (
            <ul className="space-y-3">
              {posts.map((post) => (
                <li key={post.id}>
                  <FloorPostCard
                    post={post}
                    mode="live"
                    onOpen={() => onOpenPost?.(post)}
                    onToggleLike={onToggleLike ? () => onToggleLike(post.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
