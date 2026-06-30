import type { CommitteeOpinion } from "../opinions";
import type { AgentArtifact } from "../parseAgentAnalysis";
import type { ShiftReplayArchive } from "../userData/types";
import type { ShiftSummaryLine } from "../shiftLedger";
import type { CompletePayload, DebateRound, FinalDecisionAction } from "../types";
import type { WeatherReport } from "../weatherReport";
import type { WeightMode } from "../shadowBench";

export interface FloorPostAuthor {
  id: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

export type FeedMode = "all" | "following" | "compare";

export interface MemberProfile extends FloorPostAuthor {
  handle: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  followingByMe?: boolean;
}

export type PostReactionKind = "contrarian" | "bear_case" | "nailed_it";

export const POST_REACTION_KINDS: PostReactionKind[] = [
  "contrarian",
  "bear_case",
  "nailed_it",
];

export type PostReactionCounts = Record<PostReactionKind, number>;

export function emptyReactionCounts(): PostReactionCounts {
  return { contrarian: 0, bear_case: 0, nailed_it: 0 };
}

export type ScorecardHorizon = "1w" | "1m";

export interface TickerScorecard {
  publishPrice: number | null;
  currentPrice: number | null;
  bossAction: FinalDecisionAction["action"] | null;
  pnlPct: number | null;
  horizon: ScorecardHorizon;
  correct?: boolean;
}

export type PostScorecard = Record<string, TickerScorecard>;

export interface PostAgentOutcomeSlice {
  direction_hits: number;
  direction_total: number;
  target_hits?: number;
  target_total?: number;
}

export type PostAgentOutcomes = Record<string, PostAgentOutcomeSlice>;

export interface MemberDesk {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  enabledAgents: string[];
  model: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftPresence {
  userId: string;
  tickers: string[];
  model: string;
  analystCount: number;
  visible: boolean;
  startedAt: string;
  updatedAt: string;
  author?: FloorPostAuthor;
}

export type NotificationKind =
  | "like"
  | "comment"
  | "reaction"
  | "follow"
  | "score_milestone"
  | "digest_published"
  | "watchlist_digest"
  | "fork_published"
  | "fork_duel";

export type PostKind = "shift" | "shadow_fork" | "watchlist_digest";

export interface ForkMetaDiffPreview {
  agentKey: string;
  agentName: string;
  beforeSignal: string;
  afterSignal: string;
  changed: boolean;
}

/** Stored in floor_posts.fork_meta when post is a shadow fork */
export interface ForkMeta {
  version: 1;
  kind: "shadow_fork";
  ticker: string;
  label: string;
  preset: string;
  weightMode: WeightMode;
  enabledAgents: string[];
  disabledAgents: string[];
  bossAction: FinalDecisionAction["action"] | null;
  bossConfidence: number | null;
  refPrice: number | null;
  shadow: {
    action: FinalDecisionAction["action"];
    confidence: number;
    signal: "bullish" | "bearish" | "neutral";
    flippedFromBoss: boolean;
    fragility: number;
    fragilityLabel: string;
    tally: { bullish: number; bearish: number; neutral: number };
  };
  diffPreview: ForkMetaDiffPreview[];
  ancestorPostId?: string;
  parentPostId: string;
  clientForkId?: string;
  memberDeskId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  actorId: string | null;
  actor: FloorPostAuthor | null;
  postId: string | null;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface WatchlistWithAutoPublish {
  id: string;
  label: string;
  tickers: string;
  hint?: string;
  autoPublish: boolean;
  sortOrder: number;
}

export interface TickerSnapshot {
  ticker: string;
  bossDecision: FinalDecisionAction | null;
  price: number | null;
  summaryLine: ShiftSummaryLine | null;
  opinions: CommitteeOpinion[];
  tally: { bullish: number; bearish: number; neutral: number };
  weather: WeatherReport | null;
  disputes: Array<{ summary: string; agents?: unknown[] }>;
  debateRounds: DebateRound[];
}

export interface FloorPostSnapshot {
  tickers: TickerSnapshot[];
  artifacts: AgentArtifact[];
  ephemeralArtifactWarnings: string[];
}

export interface FloorPost {
  id: string;
  authorId: string;
  author: FloorPostAuthor;
  shiftId: string | null;
  runId: string | null;
  watchlistId: string | null;
  postKind: PostKind;
  caption: string | null;
  tickers: string[];
  model: string;
  analystCount: number;
  tsMs: number;
  snapshot: FloorPostSnapshot;
  heroArtifactUrl: string | null;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  likedByMe?: boolean;
  reactionCounts?: PostReactionCounts;
  myReactions?: PostReactionKind[];
  scorecard?: PostScorecard;
  scoresUpdatedAt?: string | null;
  forkedFromPostId?: string | null;
  forkMeta?: ForkMeta | null;
  parentPost?: FloorPost | null;
}

export interface DemoFloorPost extends Omit<FloorPost, "id" | "authorId" | "likedByMe"> {
  id: string;
  isDemo: true;
}

export type CommentKind = "text" | "shadow_verdict";

export interface ShadowVerdictCommentMetadata {
  ticker: string;
  verdict: string;
  agents: string[];
  weightMode: WeightMode;
}

export interface FloorPostComment {
  id: string;
  postId: string;
  userId: string;
  author: FloorPostAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
  kind?: CommentKind;
  metadata?: ShadowVerdictCommentMetadata | Record<string, unknown>;
}

export interface PostReactionsState {
  counts: PostReactionCounts;
  mine: PostReactionKind[];
}

export interface AppUrlState {
  view?: string;
  postId?: string;
  profileHandle?: string;
  compareIds?: string[];
  embedPostId?: string;
  replayPostId?: string;
  embedReplay?: boolean;
  memoRunId?: string;
}

export interface PublicPostAuthor {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface PublicPost {
  id: string;
  tickers: string[];
  caption: string | null;
  model: string;
  analystCount: number;
  tsMs: number;
  publishedAt: string;
  author: PublicPostAuthor;
  snapshot: FloorPostSnapshot;
  scorecard: PostScorecard;
  reactionCounts: PostReactionCounts;
  likeCount: number;
  commentCount: number;
  hasArchivedReplay: boolean;
  shiftId?: string | null;
  heroArtifactUrl?: string | null;
}

export type ShiftReplayForPost = ShiftReplayArchive | null;

export interface PublishPostInput {
  shiftId: string;
  runId?: string | null;
  caption?: string;
  tickers: string[];
  model: string;
  analystCount: number;
  tsMs: number;
  snapshot: FloorPostSnapshot;
  heroArtifactUrl?: string | null;
  watchlistId?: string | null;
  postKind?: PostKind;
}

export interface PublishDigestPostInput extends PublishPostInput {
  watchlistId: string;
}

export interface PublishForkInput {
  parentPostId: string;
  caption?: string;
  forkMeta: ForkMeta;
  snapshot: FloorPostSnapshot;
  tickers: string[];
  model: string;
  analystCount: number;
  tsMs: number;
  shiftId?: string | null;
  runId?: string | null;
  heroArtifactUrl?: string | null;
}

export type ShiftArchiveInput = {
  id: string;
  ts: number;
  runId?: string | null;
  tickers: string[];
  model: string;
  analystCount: number;
  summary: ShiftSummaryLine[];
  decisions: CompletePayload["decisions"];
  prices: Record<string, number> | null;
  payload: CompletePayload | null;
};
