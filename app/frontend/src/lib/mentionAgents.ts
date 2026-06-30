import { NAMED_ANALYSTS, SPECIALIST_ANALYSTS, ANALYSTS } from "./agents";

const MENTIONABLE = [...NAMED_ANALYSTS, ...SPECIALIST_ANALYSTS, ...ANALYSTS.filter((a) => a.key.includes("analyst"))];

export interface MentionMatch {
  agentKey: string;
  name: string;
  callsign: string;
}

export function listMentionableAgents(): MentionMatch[] {
  const seen = new Set<string>();
  const out: MentionMatch[] = [];
  for (const a of MENTIONABLE) {
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    out.push({ agentKey: a.key, name: a.name, callsign: a.callsign });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Parse leading @mention from chair message. */
export function parseMention(text: string): { agentKey: string | null; body: string } {
  const raw = text.trim();
  const m = raw.match(/^@([A-Za-z][\w\s.'-]{0,48})\s*[,:]?\s*(.*)$/s);
  if (!m) return { agentKey: null, body: raw };

  const handle = m[1].trim().toLowerCase();
  const body = (m[2] || "").trim() || raw;

  for (const a of MENTIONABLE) {
    const name = a.name.toLowerCase();
    const key = a.key.toLowerCase();
    const callsign = a.callsign.toLowerCase();
    if (
      handle === key ||
      handle === name.replace(/\s+/g, "_") ||
      name.includes(handle) ||
      handle.includes(name) ||
      handle === callsign
    ) {
      return { agentKey: a.key, body };
    }
  }
  return { agentKey: null, body: raw };
}

export function formatMention(agentKey: string): string {
  const a = MENTIONABLE.find((x) => x.key === agentKey);
  return a ? `@${a.name.split(" ")[0]}` : `@${agentKey}`;
}
