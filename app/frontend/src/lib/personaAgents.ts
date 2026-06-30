import type { AgentDef } from "./agents";

/** Summary of a minted persona pack from GET /personas */
export interface PersonaPackSummary {
  id: string;
  slug: string;
  agent_key: string;
  display_name: string;
  callsign: string;
  desk_label: string;
  investing_style: string;
  room_image_url?: string | null;
  accent_color?: string | null;
  visibility?: string;
  moderation_status?: string;
  pack_version?: number;
  source?: Record<string, unknown>;
  created_at?: string | null;
}

export interface PersonaIngestJob {
  id: string;
  status: string;
  progress: Record<string, unknown>;
  persona_pack_id?: string | null;
  preview?: Record<string, unknown> | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function personaToAgentDef(pack: PersonaPackSummary): AgentDef {
  return {
    key: pack.agent_key,
    name: pack.display_name,
    callsign: pack.callsign,
    desk: pack.desk_label,
    role: "analyst",
  };
}

export function isPersonaAgentKey(key: string): boolean {
  return key.startsWith("persona_");
}
