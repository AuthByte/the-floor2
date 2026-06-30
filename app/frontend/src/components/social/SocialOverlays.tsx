import { useEffect, useState } from "react";



import {

  fetchPublicPost,

  publicPostToFloorPost,

  PublicPostError,

} from "../../lib/floorSocial/apiPublic";

import { buildPostReplayUrl } from "../../lib/floorSocial/useAppUrl";

import type { FloorPost } from "../../lib/floorSocial/types";

import type { ReplayRoomSnapshot } from "../../lib/shiftReplay";

import type { DebateRound } from "../../lib/types";

import { AuthorProfile } from "./AuthorProfile";

import { PostEmbed } from "./PostEmbed";

import { PostFloorReplayPanel } from "./PostFloorReplayPanel";



/** Standalone embed page for ?embed=postId deep links (anonymous-safe). */

export function PostEmbedPage({

  postId,

  inlineReplay = false,

}: {

  postId: string;

  inlineReplay?: boolean;

}) {

  const [post, setPost] = useState<FloorPost | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [statusCode, setStatusCode] = useState<number | null>(null);



  useEffect(() => {

    let cancelled = false;

    setError(null);

    setPost(null);



    void fetchPublicPost(postId)

      .then((p) => {

        if (cancelled) return;

        setPost(publicPostToFloorPost(p));

      })

      .catch((e: unknown) => {

        if (cancelled) return;

        if (e instanceof PublicPostError) {

          setStatusCode(e.status);

          setError(e.status === 404 ? "Post not found." : e.message);

        } else {

          setError(e instanceof Error ? e.message : "Failed to load post");

        }

      });



    return () => {

      cancelled = true;

    };

  }, [postId]);



  if (error) {

    return (

      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-ink-950 p-6 text-center">

        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-siren">{error}</p>

        {statusCode === 404 ? (

          <p className="max-w-sm text-[11px] text-wire-600">

            This post may have been removed or the link is invalid.

          </p>

        ) : null}

        <a

          href="/"

          className="rounded border border-wire-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 hover:border-brass/50 hover:text-brass"

        >

          Run your own shift →

        </a>

      </div>

    );

  }



  if (!post) {

    return (

      <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 font-mono text-[11px] uppercase tracking-[0.28em] text-wire-600">

        Loading embed…

      </div>

    );

  }



  const replayUrl = buildPostReplayUrl(post.id);



  return (

    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink-950 p-6">

      <div className="w-full max-w-md space-y-4">

        <PostEmbed post={post} watchReplayUrl={replayUrl} />

        {inlineReplay ? (

          <PostFloorReplayPanel

            open

            post={post}

            onClose={() => {}}

            onSnapshotChange={() => {}}

          />

        ) : null}

      </div>

      <footer className="mt-6 text-center">

        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

          Powered by <span className="text-brass/80">THE FLOOR</span>

        </p>

        <a

          href="/"

          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-brass/80 hover:text-brass"

        >

          Run your own shift →

        </a>

      </footer>

    </div>

  );

}



interface OverlayProps {

  profileHandle: string | null;

  onCloseProfile: () => void;

  postReplayPost: FloorPost | null;

  postReplayOpen: boolean;

  onClosePostReplay: () => void;

  onPostReplaySnapshot: (snapshot: Record<string, ReplayRoomSnapshot> | null) => void;

  onOpenDebateTheater?: (rounds: DebateRound[], opts?: { synthesized?: boolean }) => void;

}



export function SocialOverlays({

  profileHandle,

  onCloseProfile,

  postReplayPost,

  postReplayOpen,

  onClosePostReplay,

  onPostReplaySnapshot,

  onOpenDebateTheater,

}: OverlayProps) {

  return (

    <>

      {profileHandle ? (

        <AuthorProfile handle={profileHandle} onClose={onCloseProfile} />

      ) : null}

      {postReplayPost && postReplayOpen ? (

        <PostFloorReplayPanel

          open

          post={postReplayPost}

          onClose={onClosePostReplay}

          onSnapshotChange={onPostReplaySnapshot}

          onOpenDebateTheater={onOpenDebateTheater}

        />

      ) : null}

    </>

  );

}

