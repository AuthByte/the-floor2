import type { UserSettings } from "./userData/types";

export const ONBOARDING_STORAGE_KEY = "floor.onboarding.done";

/** Starter committee for new members — two legends plus the press wire. */
export const STARTER_LEGEND_KEYS = [
  "warren_buffett",
  "peter_lynch",
  "news_sentiment_analyst",
] as const;

export type StarterLegendKey = (typeof STARTER_LEGEND_KEYS)[number];

export function hasCompletedOnboarding(settings: UserSettings): boolean {
  if (settings.onboarding_completed === true) return true;
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingCompletedLocal(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
