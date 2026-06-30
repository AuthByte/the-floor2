import type { SupabaseClient } from "@supabase/supabase-js";

import { debateRoundsFromSnapshot, hasDebateContent } from "../debateReplay";
import { buildReplayFromSnapshot } from "../shiftReplay";
import type { ReplayEvent } from "../shiftReplay";
import type { DebateRound, LogLine } from "../types";
import type { ShiftReplayArchive } from "../userData/types";
import type { FloorPost } from "./types";
import { fetchPublicReplay } from "./apiPublic";

export interface PostReplayData {
  timeline: ReplayEvent[];
  roomIds: string[];
  shiftStartedAt: number;
  log: LogLine[];
  synthesized: boolean;
  debateRounds: DebateRound[];
  hasDebate: boolean;
}

function debateFromArchive(replay: ShiftReplayArchive, post: FloorPost): DebateRound[] {
  if (replay.debate?.rounds?.length) return replay.debate.rounds;
  return debateRoundsFromSnapshot(post);
}

export async function loadPostReplay(
  supabase: SupabaseClient | null,
  post: FloorPost,
): Promise<PostReplayData | null> {
  if (supabase && post.shiftId && /^[0-9a-f-]{36}$/i.test(post.shiftId)) {
    const { data, error } = await supabase
      .from("shifts")
      .select("replay")
      .eq("id", post.shiftId)
      .maybeSingle();
    if (error) throw error;

    const replay = data?.replay as ShiftReplayArchive | null | undefined;
    if (replay?.timeline?.length) {
      const debateRounds = debateFromArchive(replay, post);
      return {
        timeline: replay.timeline,
        roomIds: replay.roomIds ?? [],
        shiftStartedAt: replay.shiftStartedAt,
        log: replay.log ?? [],
        synthesized: false,
        debateRounds,
        hasDebate: hasDebateContent(debateRounds),
      };
    }
  }

  const fallback = buildReplayFromSnapshot(post.snapshot, post.tsMs);
  if (!fallback.timeline.length) return null;

  const debateRounds = debateRoundsFromSnapshot(post);
  return {
    timeline: fallback.timeline,
    roomIds: fallback.roomIds,
    shiftStartedAt: fallback.shiftStartedAt,
    log: fallback.log ?? [],
    synthesized: true,
    debateRounds,
    hasDebate: hasDebateContent(debateRounds),
  };
}

/** Anonymous replay via public API (with snapshot synthesis fallback). */
export async function loadPublicPostReplay(post: FloorPost): Promise<PostReplayData | null> {
  const data = await fetchPublicReplay(post.id);
  if (!data) return null;
  const debateRounds = debateRoundsFromSnapshot(post);
  return {
    ...data,
    debateRounds,
    hasDebate: hasDebateContent(debateRounds),
  };
}
