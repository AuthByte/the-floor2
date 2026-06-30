/** LLM token usage stats (OpenRouter-compatible). */

export interface TokenUsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number | null;
  calls?: number;
}

export interface ShiftTokenUsage {
  total: TokenUsageStats;
  agents: Record<string, TokenUsageStats>;
}

export function formatTokenCount(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
}

export function formatTokenCost(cost: number | null | undefined): string | null {
  const v = Number(cost ?? 0);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function tokenUsageLine(stats: TokenUsageStats | null | undefined): string {
  if (!stats || !stats.total_tokens) return "0 tokens";
  const cost = formatTokenCost(stats.cost);
  const calls =
    stats.calls && stats.calls > 1 ? ` · ${stats.calls} calls` : "";
  return `${formatTokenCount(stats.total_tokens)} tokens (${formatTokenCount(stats.prompt_tokens)} in / ${formatTokenCount(stats.completion_tokens)} out)${cost ? ` · ${cost}` : ""}${calls}`;
}
