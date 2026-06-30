/** Format investor time horizon and price targets for UI. */

export function formatHorizonMonths(months: number | null | undefined): string {
  if (months == null || months <= 0) return "—";
  if (months < 12) return `${months}mo`;
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "1yr" : `${years}yr`;
  }
  return `${months}mo`;
}

export function formatPriceTarget(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function formatUpsidePct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export interface ThesisOutlookFields {
  time_horizon_months?: number;
  price_target?: number;
  upside_pct?: number;
  reference_price?: number;
}

export function parseOutlookFromAnalysis(
  analysis: string | null | undefined,
): ThesisOutlookFields {
  if (!analysis?.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(analysis) as Record<string, unknown>;
    const out: ThesisOutlookFields = {};
    if (typeof parsed.time_horizon_months === "number") {
      out.time_horizon_months = parsed.time_horizon_months;
    }
    if (typeof parsed.price_target === "number") {
      out.price_target = parsed.price_target;
    }
    if (typeof parsed.upside_pct === "number") {
      out.upside_pct = parsed.upside_pct;
    }
    if (typeof parsed.reference_price === "number") {
      out.reference_price = parsed.reference_price;
    }
    return out;
  } catch {
    return {};
  }
}

export function outlookPlaqueLine(outlook: {
  timeHorizonMonths?: number;
  priceTarget?: number;
  upsidePct?: number;
  referencePrice?: number;
}): string | null {
  const horizon = formatHorizonMonths(outlook.timeHorizonMonths);
  const target = formatPriceTarget(outlook.priceTarget);
  if (horizon === "—" && target === "—") return null;
  const upside = formatUpsidePct(outlook.upsidePct);
  const parts: string[] = [];
  if (target !== "—") parts.push(`PT ${target}`);
  if (horizon !== "—") parts.push(horizon);
  if (upside) parts.push(upside);
  return parts.join(" · ");
}
