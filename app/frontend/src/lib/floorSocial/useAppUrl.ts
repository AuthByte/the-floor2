import type { AppUrlState } from "./types";

const PARAM_VIEW = "view";
const PARAM_POST = "post";
const PARAM_PROFILE = "profile";
const PARAM_COMPARE = "compare";
const PARAM_EMBED = "embed";
const PARAM_REPLAY = "replay";
const PARAM_MEMO = "memo";

function appOrigin(): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://thefloor.app";
}

export function parseUrlState(): AppUrlState {
  const params = new URLSearchParams(window.location.search);

  const compareRaw = params.get(PARAM_COMPARE);
  const compareIds = compareRaw
    ? compareRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const embedPostId = params.get(PARAM_EMBED) ?? undefined;
  const replayParam = params.get(PARAM_REPLAY);
  const replayPostId =
    replayParam && !embedPostId ? replayParam : undefined;
  const embedReplay = Boolean(embedPostId && replayParam === "1");

  return {
    view: params.get(PARAM_VIEW) ?? undefined,
    postId: params.get(PARAM_POST) ?? undefined,
    profileHandle: params.get(PARAM_PROFILE) ?? undefined,
    compareIds: compareIds?.length ? compareIds : undefined,
    embedPostId,
    replayPostId,
    embedReplay,
    memoRunId: params.get(PARAM_MEMO) ?? undefined,
  };
}

export function isPublicAppRoute(state: AppUrlState = parseUrlState()): boolean {
  return Boolean(state.embedPostId || state.replayPostId);
}

export function setUrlState(partial: Partial<AppUrlState>): void {
  const params = new URLSearchParams(window.location.search);

  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };

  if ("view" in partial) setOrDelete(PARAM_VIEW, partial.view);
  if ("postId" in partial) setOrDelete(PARAM_POST, partial.postId);
  if ("profileHandle" in partial) setOrDelete(PARAM_PROFILE, partial.profileHandle);
  if ("embedPostId" in partial) setOrDelete(PARAM_EMBED, partial.embedPostId);
  if ("replayPostId" in partial) setOrDelete(PARAM_REPLAY, partial.replayPostId as string | undefined);

  if ("embedReplay" in partial) {
    if (partial.embedReplay) params.set(PARAM_REPLAY, "1");
    else if (params.get(PARAM_REPLAY) === "1") params.delete(PARAM_REPLAY);
  }

  if ("compareIds" in partial) {
    const ids = partial.compareIds;
    if (ids?.length) setOrDelete(PARAM_COMPARE, ids.join(","));
    else params.delete(PARAM_COMPARE);
  }

  if ("memoRunId" in partial) setOrDelete(PARAM_MEMO, partial.memoRunId);

  const search = params.toString();
  const next = search
    ? `${window.location.pathname}?${search}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;

  window.history.replaceState(window.history.state, "", next);
}

export function buildPostReplayUrl(postId: string): string {
  return `${appOrigin()}/?${PARAM_REPLAY}=${encodeURIComponent(postId)}`;
}

export function buildPostEmbedUrl(
  postId: string,
  opts?: { inlineReplay?: boolean },
): string {
  const params = new URLSearchParams({ [PARAM_EMBED]: postId });
  if (opts?.inlineReplay) params.set(PARAM_REPLAY, "1");
  return `${appOrigin()}/?${params.toString()}`;
}

export function buildPostFeedUrl(postId: string): string {
  const params = new URLSearchParams({
    [PARAM_VIEW]: "feed",
    [PARAM_POST]: postId,
  });
  return `${appOrigin()}/?${params.toString()}`;
}
