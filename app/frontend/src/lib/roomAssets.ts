import type { WalkGrid } from "./walkGrid";
import { WARREN_BUFFETT_WALK_GRID } from "./walkGrids/warren_buffett";

export interface RoomAsset {
  roomImage: string;
  /** Omit until a sprite sheet exists for this agent. */
  spriteSheet?: string;
  accent: string;
  walkGrid?: WalkGrid;
  showWalkGridDebug?: boolean;
}

/** Room PNGs generated via scripts/generate-room-images.mjs + Bria bg removal. */
const BASE_ROOM_ASSETS: Record<string, RoomAsset> = {
  // ── Debate chamber (center of floor) ───────────────────────────────────────
  argument_room: {
    roomImage: "/rooms/argument_room.png",
    accent: "#ef4444",
  },

  risk_forge: {
    roomImage: "/rooms/risk_forge.png",
    accent: "#dc2626",
  },
  risk_research_hub: {
    roomImage: "/rooms/risk_research_hub.png",
    accent: "#b45309",
  },
  scenario_lab: {
    roomImage: "/rooms/scenario_lab.png",
    accent: "#7c3aed",
  },
  risk_watchtower: {
    roomImage: "/rooms/risk_watchtower.png",
    accent: "#0d9488",
  },

  // ── Tier 0: data feeds ──────────────────────────────────────────────────────
  fundamentals_analyst: {
    roomImage: "/rooms/fundamentals_analyst.png",
    spriteSheet: "/sprites/fundamentals_analyst.png",
    accent: "#f59e0b",
  },
  technical_analyst: {
    roomImage: "/rooms/technical_analyst.png",
    accent: "#22d3ee",
  },
  valuation_analyst: {
    roomImage: "/rooms/valuation_analyst.png",
    accent: "#a78bfa",
  },
  sentiment_analyst: {
    roomImage: "/rooms/sentiment_analyst.png",
    accent: "#f472b6",
  },
  news_sentiment_analyst: {
    roomImage: "/rooms/news_sentiment_analyst.png",
    accent: "#94a3b8",
  },
  growth_analyst: {
    roomImage: "/rooms/growth_analyst.png",
    accent: "#4ade80",
  },

  // ── Tier 1: named investors ─────────────────────────────────────────────────
  aswath_damodaran: {
    roomImage: "/rooms/aswath_damodaran.png",
    accent: "#6366f1",
  },
  ben_graham: {
    roomImage: "/rooms/ben_graham.png",
    accent: "#78716c",
  },
  bill_ackman: {
    roomImage: "/rooms/bill_ackman.png",
    accent: "#ef4444",
  },
  cathie_wood: {
    roomImage: "/rooms/cathie_wood.png",
    accent: "#ec4899",
  },
  charlie_munger: {
    roomImage: "/rooms/charlie_munger.png",
    accent: "#0ea5e9",
  },
  michael_burry: {
    roomImage: "/rooms/michael_burry.png",
    accent: "#64748b",
  },
  mohnish_pabrai: {
    roomImage: "/rooms/mohnish_pabrai.png",
    accent: "#eab308",
  },
  nassim_taleb: {
    roomImage: "/rooms/nassim_taleb.png",
    accent: "#1e293b",
  },
  peter_lynch: {
    roomImage: "/rooms/peter_lynch.png",
    accent: "#10b981",
  },
  phil_fisher: {
    roomImage: "/rooms/phil_fisher.png",
    accent: "#14b8a6",
  },
  rakesh_jhunjhunwala: {
    roomImage: "/rooms/rakesh_jhunjhunwala.png",
    accent: "#f97316",
  },
  stanley_druckenmiller: {
    roomImage: "/rooms/stanley_druckenmiller.png",
    accent: "#3b82f6",
  },
  george_soros: {
    roomImage: "/rooms/george_soros.png",
    accent: "#8b5cf6",
  },
  jim_simons: {
    roomImage: "/rooms/jim_simons.png",
    accent: "#06b6d4",
  },
  howard_marks: {
    roomImage: "/rooms/howard_marks.png",
    accent: "#92400e",
  },
  seth_klarman: {
    roomImage: "/rooms/seth_klarman.png",
    accent: "#475569",
  },
  john_templeton: {
    roomImage: "/rooms/john_templeton.png",
    accent: "#0f766e",
  },
  joel_greenblatt: {
    roomImage: "/rooms/joel_greenblatt.png",
    accent: "#65a30d",
  },
  ray_dalio: {
    roomImage: "/rooms/ray_dalio.png",
    accent: "#2563eb",
  },
  paul_tudor_jones: {
    roomImage: "/rooms/paul_tudor_jones.png",
    accent: "#dc2626",
  },
  carl_icahn: {
    roomImage: "/rooms/carl_icahn.png",
    accent: "#b91c1c",
  },
  li_lu: {
    roomImage: "/rooms/li_lu.png",
    accent: "#15803d",
  },
  masayoshi_son: {
    roomImage: "/rooms/masayoshi_son.png",
    accent: "#7c3aed",
  },
  supply_chain_cartographer: {
    roomImage: "/rooms/supply_chain_cartographer.png",
    accent: "#0891b2",
  },
  opportunity_cost: {
    roomImage: "/rooms/opportunity_cost.png",
    accent: "#ca8a04",
  },
  ripple_desk: {
    roomImage: "/rooms/ripple_desk.png",
    accent: "#8b5cf6",
  },
  bastion_moat: {
    roomImage: "/rooms/bastion_moat.png",
    accent: "#059669",
  },
  david_einhorn: {
    roomImage: "/rooms/michael_burry.png",
    spriteSheet: "/sprites/michael_burry.png",
    accent: "#14532d",
  },
  unknown_unknowns: {
    roomImage: "/rooms/unknown_unknowns.png",
    accent: "#991b1b",
  },
  warren_buffett: {
    roomImage: "/rooms/warren_buffett.png",
    accent: "#b45309",
    walkGrid: WARREN_BUFFETT_WALK_GRID,
  },
};

const NAMED_INVESTOR_SPRITES = [
  "aswath_damodaran",
  "ben_graham",
  "bill_ackman",
  "cathie_wood",
  "charlie_munger",
  "michael_burry",
  "mohnish_pabrai",
  "nassim_taleb",
  "peter_lynch",
  "phil_fisher",
  "rakesh_jhunjhunwala",
  "stanley_druckenmiller",
  "george_soros",
  "jim_simons",
  "howard_marks",
  "seth_klarman",
  "john_templeton",
  "joel_greenblatt",
  "ray_dalio",
  "paul_tudor_jones",
  "carl_icahn",
  "li_lu",
  "masayoshi_son",
  "warren_buffett",
] as const;

function withSpriteSheets(assets: Record<string, RoomAsset>): Record<string, RoomAsset> {
  const out = { ...assets };
  for (const key of NAMED_INVESTOR_SPRITES) {
    if (out[key]) {
      out[key] = { ...out[key], spriteSheet: `/sprites/${key}.png` };
    }
  }
  return out;
}

export const ROOM_ASSETS = withSpriteSheets(BASE_ROOM_ASSETS);
