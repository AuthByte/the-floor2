import {
  fetchBillingStatus as fetchEntitlementsStatus,
  startCheckout,
  type BillingStatus as EntitlementsStatus,
  type BillingTier,
} from "./entitlements";
import { authHeaders, getApiBaseUrl } from "./api";

export type PlanTier = BillingTier;

export type CheckoutPlan = "pro_monthly" | "pro_yearly" | "day_pass";

/** Normalized billing view for account UI. */
export interface BillingStatus {
  plan_tier: PlanTier;
  shifts_used_this_period: number;
  shifts_limit: number | null;
  entitlement_expires_at: string | null;
  has_subscription: boolean;
  can_use_scheduler?: boolean;
  can_use_paper?: boolean;
  can_publish_social?: boolean;
  scheduler_block_reason?: string | null;
}

export interface CheckoutResponse {
  url: string;
  session_id?: string;
}

export interface PortalResponse {
  url: string;
}

export function planBadgeLabel(tier: PlanTier): "FREE" | "PRO" {
  return tier === "free" ? "FREE" : "PRO";
}

export function planDisplayName(tier: PlanTier): string {
  switch (tier) {
    case "pro":
      return "Pro";
    case "day_pass":
      return "Day pass";
    default:
      return "Free";
  }
}

function adaptStatus(status: EntitlementsStatus): BillingStatus {
  const tier = (status.plan_tier ?? status.tier ?? "free") as PlanTier;
  return {
    plan_tier: tier,
    shifts_used_this_period: Number(
      status.shifts_used_this_period ?? status.shifts_used ?? 0,
    ),
    shifts_limit: status.shifts_limit ?? null,
    entitlement_expires_at:
      (status.entitlement_expires_at as string | null) ??
      status.day_pass_expires_at ??
      null,
    has_subscription: Boolean(status.has_subscription ?? tier === "pro"),
    can_use_scheduler: status.can_use_scheduler ?? true,
    can_use_paper: status.can_use_paper ?? true,
    can_publish_social: status.can_publish_social ?? true,
    scheduler_block_reason: status.scheduler_block_reason,
  };
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const status = await fetchEntitlementsStatus();
  return adaptStatus(status);
}

/** Routes paid tiers through existing Stripe checkout stubs. */
export async function createCheckout(
  plan: CheckoutPlan,
  _opts?: { successUrl?: string; cancelUrl?: string },
): Promise<CheckoutResponse> {
  if (plan === "day_pass") {
    return startCheckout("day_pass");
  }
  return startCheckout("pro");
}

export async function createBillingPortal(
  returnUrl?: string,
): Promise<PortalResponse> {
  const res = await fetch(`${getApiBaseUrl()}/billing/portal`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(returnUrl ? { return_url: returnUrl } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
