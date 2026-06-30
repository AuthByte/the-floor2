import { useEffect, useState } from "react";



import { useAuth } from "../../contexts/AuthContext";

import { getSupabase } from "../../lib/supabase";

import { toggleReaction as apiToggleReaction } from "../../lib/floorSocial/apiExtended";

import {

  addComment,

  deleteComment,

  deletePost,

  fetchComments,

  fetchPost,

} from "../../lib/floorSocial/api";

import type {

  FloorPost,

  FloorPostComment,

  PostReactionKind,

  ShadowVerdictCommentMetadata,

} from "../../lib/floorSocial/types";

import { emptyReactionCounts } from "../../lib/floorSocial/types";

import { CONDITION_COPY } from "../../lib/weatherReport";

import { ArtifactGallery } from "../analysis/ArtifactGallery";

import { InvestorAvatar } from "../InvestorAvatar";

import { AuthorChip } from "./AuthorChip";

import { CommentThread } from "./CommentThread";

import { LikeButton } from "./LikeButton";

import { PostScorecard } from "./PostScorecard";
import { extractAgentOutcomes, PostAgentOutcomes } from "./PostAgentOutcomes";

import { ReactionBar } from "./ReactionBar";

import { ShareCardButton } from "./ShareCardButton";
import { PostShareLinks } from "./PostShareLinks";
import { ForkBadge } from "./ForkBadge";
import { isForkPost } from "../../lib/floorSocial/forkSnapshot";
import { fetchForksForPost } from "../../lib/floorSocial/publishFork";



const ACTION_CHIP: Record<string, string> = {

  buy: "border-phos/40 bg-phos/10 text-phos",

  cover: "border-phos/30 bg-phos/5 text-phos",

  sell: "border-siren/40 bg-siren/10 text-siren",

  short: "border-siren/40 bg-siren/10 text-siren",

  hold: "border-amber/40 bg-amber/10 text-amber",

};



interface Props {

  post: FloorPost;

  onClose: () => void;

  onToggleLike: () => void;

  onDeleted?: () => void;

  onCompare?: (post: FloorPost) => void;

  onReplayOnFloor?: (post: FloorPost) => void;

  onOpenProfile?: (handle: string) => void;

  onToggleReaction?: (reaction: PostReactionKind) => void;

  onOpenParentPost?: (postId: string) => void;

}



function ShadowVerdictComment({

  comment,

  metadata,

}: {

  comment: FloorPostComment;

  metadata: ShadowVerdictCommentMetadata;

}) {

  return (

    <li className="rounded border border-brass/25 bg-brass/5 px-3 py-3">

      <div className="flex items-center gap-2">

        <span className="font-mono text-[8px] uppercase tracking-[0.28em] text-brass">

          shadow verdict

        </span>

        <span className="font-mono text-[9px] text-wire-500">{metadata.ticker}</span>

      </div>

      <p className="mt-2 font-mono text-[12px] font-semibold uppercase tracking-wide text-wire-100">

        {metadata.verdict}

      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-wire-400">{comment.body}</p>

      {metadata.agents.length > 0 ? (

        <p className="mt-2 font-mono text-[9px] text-wire-600">

          agents: {metadata.agents.join(", ")} · {metadata.weightMode}

        </p>

      ) : null}

      <div className="mt-2">

        <AuthorChip author={comment.author} />

      </div>

    </li>

  );

}



export function FloorPostDetail({

  post,

  onClose,

  onToggleLike,

  onDeleted,

  onCompare,

  onReplayOnFloor,

  onOpenProfile,

  onToggleReaction: onToggleReactionProp,

  onOpenParentPost,

}: Props) {

  const { session } = useAuth();

  const userId = session?.user?.id;

  const isFork = isForkPost(post);
  const forkMeta = post.forkMeta;
  const parentPostId = post.forkedFromPostId ?? forkMeta?.parentPostId ?? null;

  const [parentPost, setParentPost] = useState<FloorPost | null>(null);

  const [childForks, setChildForks] = useState<FloorPost[]>([]);

  const [comments, setComments] = useState<FloorPostComment[]>([]);

  const [commentsLoading, setCommentsLoading] = useState(true);

  const [myReactions, setMyReactions] = useState<PostReactionKind[]>(post.myReactions ?? []);

  const [detailTab, setDetailTab] = useState<"memo" | "agents">("memo");

  const agentOutcomes = extractAgentOutcomes(
    post.scorecard as Record<string, unknown> | undefined,
  );

  const [reactionCounts, setReactionCounts] = useState(

    post.reactionCounts ?? emptyReactionCounts(),

  );



  useEffect(() => {

    setMyReactions(post.myReactions ?? []);

    setReactionCounts(post.reactionCounts ?? emptyReactionCounts());

  }, [post.id, post.myReactions, post.reactionCounts]);



  useEffect(() => {

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "Escape") onClose();

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [onClose]);



  useEffect(() => {

    const supabase = getSupabase();

    if (!supabase) return;

    setCommentsLoading(true);

    void fetchComments(supabase, post.id)

      .then(setComments)

      .finally(() => setCommentsLoading(false));

  }, [post.id]);



  useEffect(() => {

    if (!isFork || !parentPostId) {

      setParentPost(null);

      return;

    }

    const supabase = getSupabase();

    if (!supabase || !userId) return;

    void fetchPost(supabase, userId, parentPostId).then((p) => setParentPost(p));

  }, [isFork, parentPostId, userId]);



  useEffect(() => {

    const supabase = getSupabase();

    if (!supabase || !userId) {

      setChildForks([]);

      return;

    }

    void fetchForksForPost(supabase, userId, post.id).then(setChildForks);

  }, [post.id, userId]);



  async function handleAddComment(body: string) {

    const supabase = getSupabase();

    if (!supabase || !userId) return;

    const created = await addComment(supabase, userId, post.id, body);

    setComments((prev) => [...prev, created]);

  }



  async function handleDeleteComment(commentId: string) {

    const supabase = getSupabase();

    if (!supabase || !userId) return;

    await deleteComment(supabase, userId, commentId);

    setComments((prev) => prev.filter((c) => c.id !== commentId));

  }



  async function handleDeletePost() {

    const supabase = getSupabase();

    if (!supabase || !userId || post.authorId !== userId) return;

    await deletePost(supabase, userId, post.id);

    onDeleted?.();

    onClose();

  }



  async function handleToggleReaction(reaction: PostReactionKind) {

    if (onToggleReactionProp) {

      onToggleReactionProp(reaction);

      return;

    }



    const supabase = getSupabase();

    if (!supabase || !userId) return;



    const wasActive = myReactions.includes(reaction);

    setMyReactions((prev) =>

      wasActive ? prev.filter((r) => r !== reaction) : [...prev, reaction],

    );

    setReactionCounts((prev) => ({

      ...prev,

      [reaction]: Math.max(0, prev[reaction] + (wasActive ? -1 : 1)),

    }));



    try {

      await apiToggleReaction(supabase, userId, post.id, reaction, wasActive);

    } catch {

      setMyReactions(post.myReactions ?? []);

      setReactionCounts(post.reactionCounts ?? emptyReactionCounts());

    }

  }



  const textComments = comments.filter((c) => c.kind !== "shadow_verdict");

  const shadowComments = comments.filter((c) => c.kind === "shadow_verdict");



  return (

    <div

      className="desk-backdrop absolute inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/55 backdrop-blur-[2px]"

      role="presentation"

      onMouseDown={onClose}

    >

      <aside

        className="flex h-full w-full max-w-2xl animate-slide-in-right flex-col border-l border-brass/25 bg-ink-950 shadow-float"

        role="dialog"

        aria-labelledby="post-detail-title"

        onMouseDown={(e) => e.stopPropagation()}

      >

        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">

          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />

          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0">

              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">

                {isFork ? "shadow fork" : "shared run"}

              </div>

              {isFork ? <ForkBadge compact /> : null}

              <h2

                id="post-detail-title"

                className="mt-1 font-display text-base font-bold tracking-wide text-wire-100"

              >

                {post.tickers.join(", ")}

              </h2>

              <div className="mt-2">

                <AuthorChip

                  author={post.author}

                  onClick={

                    post.author.handle && onOpenProfile

                      ? () => onOpenProfile(post.author.handle!)

                      : undefined

                  }

                />

              </div>

              {isFork && parentPostId ? (

                <p className="mt-2 font-mono text-[10px] text-wire-500">

                  fork of{" "}

                  <button

                    type="button"

                    onClick={() => onOpenParentPost?.(parentPostId)}

                    className="text-brass hover:underline"

                  >

                    {parentPost

                      ? `@${parentPost.author.handle ?? parentPost.author.displayName}'s ${parentPost.tickers.join(", ")} run`

                      : "parent run"}

                  </button>

                </p>

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

          {post.caption ? (

            <p className="mt-3 text-[13px] leading-relaxed text-wire-300">{post.caption}</p>

          ) : null}



          <div className="mt-3 flex flex-wrap items-center gap-2">

            <LikeButton

              count={post.likeCount}

              liked={Boolean(post.likedByMe)}

              onToggle={onToggleLike}

            />

            <span className="font-mono text-[10px] text-wire-600">

              {post.commentCount} comments

            </span>

            {onCompare ? (

              <button

                type="button"

                onClick={() => onCompare(post)}

                className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-400 hover:border-brass/40 hover:text-brass"

              >

                Compare

              </button>

            ) : null}

            {onReplayOnFloor && post.shiftId ? (

              <button

                type="button"

                onClick={() => onReplayOnFloor(post)}

                className="rounded border border-wire-800 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-wire-400 hover:border-brass/40 hover:text-brass"

              >

                Replay on floor

              </button>

            ) : null}

            <ShareCardButton post={post} />

            <PostShareLinks postId={post.id} compact />

            {userId === post.authorId ? (

              <button

                type="button"

                onClick={() => void handleDeletePost()}

                className="ml-auto font-mono text-[9px] uppercase tracking-[0.18em] text-wire-600 transition hover:text-siren"

              >

                unpublish

              </button>

            ) : null}

          </div>



          <div className="mt-3">

            <ReactionBar

              counts={reactionCounts}

              active={myReactions}

              onToggle={userId ? handleToggleReaction : undefined}

            />

          </div>



          {post.scorecard && Object.keys(post.scorecard).length > 0 ? (

            <div className="mt-3">

              <PostScorecard scorecard={post.scorecard} tickers={post.tickers} />

            </div>

          ) : null}

          {agentOutcomes ? (
            <div className="mt-3 flex gap-2 border-t border-wire-800/60 pt-3">
              <button
                type="button"
                onClick={() => setDetailTab("memo")}
                className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
                  detailTab === "memo" ? "text-brass" : "text-wire-600"
                }`}
              >
                Memo
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("agents")}
                className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
                  detailTab === "agents" ? "text-brass" : "text-wire-600"
                }`}
              >
                Agent outcomes
              </button>
            </div>
          ) : null}

        </header>



        {detailTab === "agents" && agentOutcomes ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <PostAgentOutcomes outcomes={agentOutcomes} />
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">

          {isFork && forkMeta ? (

            <section className="rounded border border-brass/25 bg-brass/5 p-4">

              <h3 className="font-mono text-[9px] uppercase tracking-[0.28em] text-brass/80">

                Fork diff summary

              </h3>

              <p className="mt-2 text-[12px] text-wire-300">

                {forkMeta.label} · {forkMeta.preset} · {forkMeta.weightMode} ·{" "}

                {forkMeta.enabledAgents.length} desks active

                {forkMeta.disabledAgents.length > 0

                  ? ` · ${forkMeta.disabledAgents.length} muted`

                  : ""}

              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">

                <div className="rounded border border-wire-800/80 bg-ink-950/50 px-3 py-2">

                  <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">

                    Boss

                  </div>

                  <div className="mt-1 font-mono text-[11px] font-semibold uppercase text-wire-300">

                    {forkMeta.bossAction ?? "hold"}

                    {forkMeta.bossConfidence != null ? ` ${forkMeta.bossConfidence}%` : ""}

                  </div>

                </div>

                <div className="rounded border border-phos/30 bg-phos/5 px-3 py-2">

                  <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">

                    Shadow

                  </div>

                  <div className="mt-1 font-mono text-[11px] font-semibold uppercase text-phos">

                    {forkMeta.shadow.action} {forkMeta.shadow.confidence}%

                  </div>

                </div>

                {forkMeta.shadow.flippedFromBoss ? (

                  <div className="flex items-center rounded border border-phos/25 bg-phos/5 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-phos">

                    flip · fragility {forkMeta.shadow.fragility}

                  </div>

                ) : (

                  <div className="flex items-center rounded border border-wire-800/80 bg-ink-950/50 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-wire-500">

                    {forkMeta.preset} · {forkMeta.weightMode}

                  </div>

                )}

              </div>

              {forkMeta.disabledAgents.length > 0 ? (

                <p className="mt-2 font-mono text-[9px] text-wire-600">

                  muted desks: {forkMeta.disabledAgents.join(", ")}

                </p>

              ) : null}

              {forkMeta.diffPreview.length > 0 ? (

                <ul className="mt-3 space-y-1">

                  {forkMeta.diffPreview.map((d) => (

                    <li key={d.agentKey} className="font-mono text-[10px] text-wire-500">

                      {d.agentName}: {d.beforeSignal} → {d.afterSignal}

                    </li>

                  ))}

                </ul>

              ) : null}

              {parentPostId ? (

                <button

                  type="button"

                  onClick={() => onOpenParentPost?.(parentPostId)}

                  className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brass hover:underline"

                >

                  {parentPost

                    ? `Compare to parent · @${parentPost.author.handle ?? parentPost.author.displayName}'s ${parentPost.tickers.join(", ")} run`

                    : "Open parent run"}

                </button>

              ) : null}

            </section>

          ) : null}



          {!isFork && childForks.length > 0 ? (

            <section className="rounded border border-wire-800/80 bg-ink-900/30 p-4">

              <h3 className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                Shadow forks ({childForks.length})

              </h3>

              <ul className="mt-3 space-y-2">

                {childForks.map((fork) => (

                  <li key={fork.id}>

                    <button

                      type="button"

                      onClick={() => onOpenParentPost?.(fork.id)}

                      className="w-full rounded border border-wire-800/60 bg-ink-950/40 px-3 py-2 text-left transition hover:border-brass/40"

                    >

                      <div className="flex flex-wrap items-center gap-2">

                        <ForkBadge compact />

                        <span className="font-mono text-[10px] text-wire-300">

                          @{fork.author.handle ?? fork.author.displayName}

                        </span>

                        {fork.forkMeta ? (

                          <span className="font-mono text-[9px] uppercase text-phos">

                            shadow {fork.forkMeta.shadow.action}

                          </span>

                        ) : null}

                      </div>

                      {fork.forkMeta?.label ? (

                        <p className="mt-1 text-[11px] text-wire-500">{fork.forkMeta.label}</p>

                      ) : null}

                    </button>

                  </li>

                ))}

              </ul>

            </section>

          ) : null}



          {post.snapshot.tickers.map((t) => {

            const condition = t.weather ? CONDITION_COPY[t.weather.condition] : null;

            return (

              <section

                key={t.ticker}

                className="rounded border border-wire-800/80 bg-ink-900/30 p-4"

              >

                <div className="flex flex-wrap items-center gap-2">

                  <span className="font-mono text-lg font-bold text-wire-100">{t.ticker}</span>

                  {t.summaryLine ? (

                    <span

                      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${

                        ACTION_CHIP[t.summaryLine.action] ?? "border-wire-700 text-wire-400"

                      }`}

                    >

                      boss {t.summaryLine.action}

                      {t.summaryLine.confidence != null ? ` ${t.summaryLine.confidence}%` : ""}

                    </span>

                  ) : null}

                  {condition ? (

                    <span className={`font-mono text-[9px] uppercase ${condition.tone}`}>

                      {condition.emoji} {t.weather?.headline}

                    </span>

                  ) : null}

                </div>



                {t.bossDecision?.reasoning ? (

                  <p className="mt-2 text-[12px] leading-relaxed text-wire-400">

                    {t.bossDecision.reasoning}

                  </p>

                ) : null}



                <div className="mt-4">

                  <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                    Committee

                  </h3>

                  <ul className="space-y-2">

                    {t.opinions.map((op) => (

                      <li

                        key={op.agentKey}

                        className="flex gap-3 rounded border border-wire-800/60 bg-ink-950/40 p-2.5"

                      >

                        <InvestorAvatar agentKey={op.agentKey} name={op.agentName} size={32} />

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-2">

                            <span className="font-mono text-[11px] font-semibold text-wire-200">

                              {op.agentName}

                            </span>

                            <span

                              className={`font-mono text-[9px] uppercase ${

                                op.signal === "bullish"

                                  ? "text-phos"

                                  : op.signal === "bearish"

                                    ? "text-siren"

                                    : "text-amber"

                              }`}

                            >

                              {op.signal}

                              {op.confidence != null ? ` ${op.confidence}%` : ""}

                            </span>

                          </div>

                          <p className="mt-1 text-[11px] leading-relaxed text-wire-500">

                            {op.summary}

                          </p>

                        </div>

                      </li>

                    ))}

                  </ul>

                </div>



                {t.disputes.length > 0 ? (

                  <div className="mt-4">

                    <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                      Disputes

                    </h3>

                    <ul className="space-y-1">

                      {t.disputes.map((d, i) => (

                        <li key={i} className="text-[11px] text-wire-500">

                          · {d.summary}

                        </li>

                      ))}

                    </ul>

                  </div>

                ) : null}



                {t.debateRounds.length > 0 ? (

                  <div className="mt-4">

                    <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">

                      Debate

                    </h3>

                    {t.debateRounds.map((round, i) => (

                      <div

                        key={i}

                        className="mb-2 rounded border border-wire-800/60 bg-ink-950/40 p-2.5 text-[11px] text-wire-500"

                      >

                        <span className="font-semibold text-brass">

                          {round.winner_name ?? round.winner ?? "Round"}

                        </span>

                        {round.summary ? ` — ${round.summary}` : null}

                      </div>

                    ))}

                  </div>

                ) : null}

              </section>

            );

          })}



          {post.snapshot.artifacts.length > 0 ? (

            <ArtifactGallery artifacts={post.snapshot.artifacts} />

          ) : null}



          {shadowComments.length > 0 ? (

            <section className="space-y-2">

              <h4 className="font-mono text-[9px] uppercase tracking-[0.28em] text-brass/70">

                Shadow verdicts

              </h4>

              <ul className="space-y-2">

                {shadowComments.map((c) => (

                  <ShadowVerdictComment

                    key={c.id}

                    comment={c}

                    metadata={(c.metadata ?? {}) as ShadowVerdictCommentMetadata}

                  />

                ))}

              </ul>

            </section>

          ) : null}



          <CommentThread

            comments={textComments}

            loading={commentsLoading}

            currentUserId={userId}

            onAdd={userId ? handleAddComment : undefined}

            onDelete={userId ? handleDeleteComment : undefined}

          />

        </div>
        )}

      </aside>

    </div>

  );

}

