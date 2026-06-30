import { CONDITION_COPY } from "../../lib/weatherReport";

import type { DemoFloorPost, FloorPost, PostReactionKind } from "../../lib/floorSocial/types";

import { emptyReactionCounts } from "../../lib/floorSocial/types";
import { isForkPost } from "../../lib/floorSocial/forkSnapshot";

import { AuthorChip } from "./AuthorChip";
import { ForkBadge } from "./ForkBadge";

import { LikeButton } from "./LikeButton";

import { PostScorecard } from "./PostScorecard";
import { extractAgentOutcomes, PostAgentOutcomes } from "./PostAgentOutcomes";

import { ReactionBar } from "./ReactionBar";



const ACTION_CHIP: Record<string, string> = {

  buy: "border-phos/40 bg-phos/10 text-phos",

  cover: "border-phos/30 bg-phos/5 text-phos",

  sell: "border-siren/40 bg-siren/10 text-siren",

  short: "border-siren/40 bg-siren/10 text-siren",

  hold: "border-amber/40 bg-amber/10 text-amber",

};



type CardPost = FloorPost | DemoFloorPost;



interface Props {

  post: CardPost;

  mode?: "live" | "demo";

  onOpen?: () => void;

  onToggleLike?: () => void;

  onAuthorClick?: () => void;

  onToggleReaction?: (reaction: PostReactionKind) => void;

  showScorecard?: boolean;

  parentPost?: Pick<FloorPost, "id" | "author" | "tickers"> | null;

  onOpenParent?: (parentPostId: string) => void;

}



function formatWhen(tsMs: number): string {

  return new Date(tsMs).toLocaleDateString(undefined, {

    month: "short",

    day: "numeric",

    year: "numeric",

  });

}



export function FloorPostCard({

  post,

  mode = "live",

  onOpen,

  onToggleLike,

  onAuthorClick,

  onToggleReaction,

  showScorecard = false,

  parentPost,

  onOpenParent,

}: Props) {

  const isDemo = mode === "demo" || ("isDemo" in post && post.isDemo);

  const primary = post.snapshot.tickers[0];

  const weather = primary?.weather;

  const condition = weather ? CONDITION_COPY[weather.condition] : null;

  const reactionCounts =

    "reactionCounts" in post && post.reactionCounts

      ? post.reactionCounts

      : emptyReactionCounts();

  const myReactions = "myReactions" in post ? (post.myReactions ?? []) : [];

  const scorecard = "scorecard" in post ? post.scorecard : undefined;
  const agentOutcomes = extractAgentOutcomes(
    scorecard as Record<string, unknown> | undefined,
  );

  const forkMeta = "forkMeta" in post ? post.forkMeta : undefined;
  const isFork = isForkPost(post);
  const parentPostId =
    ("forkedFromPostId" in post ? post.forkedFromPostId : null) ??
    forkMeta?.parentPostId ??
    null;

  return (

    <article className="overflow-hidden rounded-lg border border-wire-800/90 bg-ink-900/50 shadow-[inset_0_1px_0_rgb(var(--brass)/0.08)]">

      <button

        type="button"

        onClick={onOpen}

        disabled={!onOpen}

        className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-ink-800/40 disabled:cursor-default"

      >

        <div className="flex items-start justify-between gap-3">

          <AuthorChip author={post.author} onClick={onAuthorClick} />

          <div className="flex shrink-0 items-center gap-2">

            {isFork ? <ForkBadge compact /> : null}

            {isDemo ? (

              <span className="rounded border border-brass/30 bg-brass/5 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-brass/80">

                Example

              </span>

            ) : null}

            {"postKind" in post &&
            (post.postKind === "watchlist_digest" || post.watchlistId) ? (
              <span className="rounded border border-phos/30 bg-phos/5 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-phos/90">
                Watchlist · auto
              </span>
            ) : null}

            <span className="font-mono text-[9px] text-wire-600">{formatWhen(post.tsMs)}</span>

          </div>

        </div>



        {isFork && parentPostId ? (

          <p className="font-mono text-[10px] text-wire-500">

            fork of{" "}

            {parentPost ? (

              <button

                type="button"

                onClick={(e) => {

                  e.stopPropagation();

                  onOpenParent?.(parentPostId);

                }}

                className="text-brass hover:underline"

              >

                @{parentPost.author.handle ?? parentPost.author.displayName}'s{" "}

                {parentPost.tickers.join(", ")} run

              </button>

            ) : (

              <button

                type="button"

                onClick={(e) => {

                  e.stopPropagation();

                  onOpenParent?.(parentPostId);

                }}

                className="text-brass hover:underline"

              >

                parent run

              </button>

            )}

          </p>

        ) : null}



        {post.caption ? (

          <p className="whitespace-pre-line text-[13px] leading-relaxed text-wire-200">{post.caption}</p>

        ) : forkMeta ? (

          <p className="text-[13px] leading-relaxed text-wire-300">{forkMeta.label}</p>

        ) : null}



        {isFork && forkMeta ? (

          <div className="grid gap-2 sm:grid-cols-3">

            <div className="rounded border border-wire-800/80 bg-ink-950/50 px-3 py-2">

              <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">Boss</div>

              <div className="mt-1 font-mono text-[11px] font-semibold uppercase text-wire-300">

                {forkMeta.bossAction ?? "hold"}

                {forkMeta.bossConfidence != null ? ` ${forkMeta.bossConfidence}%` : ""}

              </div>

            </div>

            <div className="rounded border border-phos/30 bg-phos/5 px-3 py-2">

              <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-wire-600">Shadow</div>

              <div className="mt-1 font-mono text-[11px] font-semibold uppercase text-phos">

                {forkMeta.shadow.action} {forkMeta.shadow.confidence}%

              </div>

            </div>

            {forkMeta.shadow.flippedFromBoss ? (

              <div className="flex items-center rounded border border-phos/25 bg-phos/5 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-phos">

                flip · fragility {forkMeta.shadow.fragility}

              </div>

            ) : (

              <div className="flex items-center rounded border border-wire-800 px-3 py-2 font-mono text-[9px] text-wire-500">

                {forkMeta.preset} · {forkMeta.weightMode}

              </div>

            )}

          </div>

        ) : null}



        <div className="flex flex-wrap items-center gap-2">

          <span className="font-mono text-sm font-bold tracking-wide text-wire-100">

            {post.tickers.join(", ")}

          </span>

          {primary?.summaryLine && !isFork ? (

            <span

              className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${

                ACTION_CHIP[primary.summaryLine.action] ?? "border-wire-700 text-wire-400"

              }`}

            >

              {primary.summaryLine.action}

              {primary.summaryLine.confidence != null

                ? ` ${primary.summaryLine.confidence}%`

                : ""}

            </span>

          ) : null}

          {condition ? (

            <span

              className={`font-mono text-[9px] uppercase tracking-[0.16em] ${condition.tone}`}

            >

              {condition.emoji} {condition.label}

            </span>

          ) : null}

        </div>



        {primary ? (

          <div className="flex flex-wrap gap-2">

            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-phos">

              {(isFork && forkMeta ? forkMeta.shadow.tally.bullish : primary.tally.bullish)} bull

            </span>

            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-siren">

              {(isFork && forkMeta ? forkMeta.shadow.tally.bearish : primary.tally.bearish)} bear

            </span>

            <span className="rounded border border-wire-800 px-2 py-0.5 font-mono text-[9px] text-wire-500">

              {(isFork && forkMeta ? forkMeta.shadow.tally.neutral : primary.tally.neutral)} neutral

            </span>

            <span className="font-mono text-[9px] text-wire-600">

              · {post.analystCount} desks · {post.model.split("/").pop()}

            </span>

          </div>

        ) : null}



        {showScorecard && scorecard && Object.keys(scorecard).length > 0 ? (

          <PostScorecard scorecard={scorecard} tickers={post.tickers} compact />

        ) : null}

        {agentOutcomes ? <PostAgentOutcomes outcomes={agentOutcomes} compact /> : null}



        {primary && primary.opinions.length > 0 ? (

          <div className="space-y-1.5 border-t border-wire-800/60 pt-3">

            {primary.opinions.slice(0, 3).map((op) => (

              <p key={op.agentKey} className="text-[11px] leading-relaxed text-wire-500">

                <span className="font-semibold text-wire-300">{op.agentName}</span>

                <span className="mx-1.5 text-wire-700">·</span>

                <span

                  className={

                    op.signal === "bullish"

                      ? "text-phos"

                      : op.signal === "bearish"

                        ? "text-siren"

                        : "text-amber"

                  }

                >

                  {op.signal}

                </span>

                {op.confidence != null ? ` ${op.confidence}%` : ""}

                {" — "}

                {op.summary.length > 100 ? `${op.summary.slice(0, 97)}…` : op.summary}

              </p>

            ))}

          </div>

        ) : null}

      </button>



      {!isDemo ? (

        <div className="space-y-2 border-t border-wire-800/60 px-4 py-2">

          <div className="flex flex-wrap items-center gap-3">

            <LikeButton

              count={post.likeCount}

              liked={Boolean("likedByMe" in post && post.likedByMe)}

              onToggle={onToggleLike}

            />

            <span className="font-mono text-[10px] text-wire-600">

              {post.commentCount} comment{post.commentCount === 1 ? "" : "s"}

            </span>

          </div>

          {onToggleReaction || reactionCounts.contrarian || reactionCounts.bear_case || reactionCounts.nailed_it ? (

            <ReactionBar

              counts={reactionCounts}

              active={myReactions}

              onToggle={onToggleReaction}

              compact

            />

          ) : null}

        </div>

      ) : null}

    </article>

  );

}

