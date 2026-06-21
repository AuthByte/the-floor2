import type { CompletePayload } from "./types";

export type WeatherCondition =
  | "stormy"
  | "overcast"
  | "clearing"
  | "hazy"
  | "variable";

export interface WeatherReport {
  ticker: string;
  condition: WeatherCondition;
  headline: string;
  fragility: number;
  fragility_label: string;
  tally: { bullish: number; bearish: number; neutral: number };
  carried_by: Array<{ name: string; signal: string; confidence: number }>;
  top_disputes: Array<{ summary: string; agents?: unknown[] }>;
  dominant_claim: string;
  boss_action?: string | null;
  boss_confidence?: number | null;
  key_risk?: string | null;
  voice_count: number;
}

export function weatherPayloadTickers(payload: CompletePayload | null): string[] {
  if (!payload) return [];
  const fromReports = Object.keys(payload.weather_reports ?? {});
  if (fromReports.length) return fromReports;
  return Object.keys(payload.decisions ?? {});
}

export function weatherForTicker(
  payload: CompletePayload | null,
  ticker: string,
): WeatherReport | null {
  if (!payload?.weather_reports) return null;
  return payload.weather_reports[ticker.toUpperCase()] ?? null;
}

export const CONDITION_COPY: Record<
  WeatherCondition,
  { label: string; emoji: string; tone: string }
> = {
  stormy: { label: "Storm front", emoji: "⛈", tone: "text-siren" },
  overcast: { label: "Bear overcast", emoji: "☁", tone: "text-siren/90" },
  clearing: { label: "Bull clearing", emoji: "🌤", tone: "text-phos" },
  hazy: { label: "Hazy neutral", emoji: "🌫", tone: "text-amber" },
  variable: { label: "Variable winds", emoji: "🌬", tone: "text-brass" },
};
