/** Headshots: drop PNGs in `public/avatars/{agent_key}.png` (e.g. ben_graham.png). */

export function investorAvatarUrl(agentKey: string): string {
  return `/avatars/${agentKey}.png`;
}

export function investorInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
