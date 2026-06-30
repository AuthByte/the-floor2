import { fetchLeaderboard, type LeaderboardEntry } from "./agentScorecards";

export type LeaderboardTier = "all" | "legend" | "specialist" | "quant" | "tier0";
export type LeaderboardSort =
  | "direction_hit_rate"
  | "target_hit_rate"
  | "predictions_scored"
  | "avg_confidence";

export const LEADERBOARD_TIERS: { id: LeaderboardTier; label: string }[] = [
  { id: "legend", label: "Legends" },
  { id: "specialist", label: "Specialists" },
  { id: "quant", label: "Quant" },
  { id: "tier0", label: "Data feeds" },
  { id: "all", label: "All desks" },
];

export const LEADERBOARD_SORTS: { id: LeaderboardSort; label: string }[] = [
  { id: "direction_hit_rate", label: "Direction %" },
  { id: "target_hit_rate", label: "Target %" },
  { id: "predictions_scored", label: "Sample size" },
  { id: "avg_confidence", label: "Avg confidence" },
];

export { fetchLeaderboard, type LeaderboardEntry };
