import { authHeaders, getApiBaseUrl } from "./api";

export type BillingTier = "free" | "pro" | "day_pass";

export interface UpgradeTierOption {
  id: "pro" | "day_pass";
  label: string;
  price: string;
  checkout_path: string;
}

export interface PaywallUpgrade {
  feature: string;
  tiers: UpgradeTierOption[];
}

export interface PaywallPayload {
  code: string;
  message: string;
  upgrade: PaywallUpgrade;
  entitlements?: BillingStatus;
}

export interface BillingStatus {
  tier?: BillingTier;
  plan_tier?: BillingTier;
  period?: string;
  shifts_used?: number;
  shifts_used_this_period?: number;
  shifts_limit: number | null;
  shifts_remaining?: number | null;
  max_roster_size?: number;
  can_run_shift?: boolean;
  can_use_paper?: boolean;
  can_publish_social?: boolean;
  can_use_scheduler?: boolean;
  shift_block_reason?: string | null;
  paper_block_reason?: string | null;
  publish_block_reason?: string | null;
  scheduler_block_reason?: string | null;
  day_pass_expires_at?: string | null;
  entitlement_expires_at?: string | null;
  has_subscription?: boolean;
  auth_required?: boolean;
}

export class PaywallError extends Error {
  readonly payload: PaywallPayload;

  constructor(payload: PaywallPayload) {
    super(payload.message);
    this.name = "PaywallError";
    this.payload = payload;
  }
}

export function parsePaywallDetail(raw: unknown): PaywallPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.code !== "string" || typeof obj.message !== "string") return null;
  const upgrade = obj.upgrade as PaywallUpgrade | undefined;
  if (!upgrade?.tiers?.length) return null;
  return {
    code: obj.code,
    message: obj.message,
    upgrade,
    entitlements: obj.entitlements as BillingStatus | undefined,
  };
}

export async function parsePaywallResponse(res: Response): Promise<PaywallPayload | null> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return parsePaywallDetail(parsed.detail ?? parsed);
  } catch {
    return null;
  }
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await fetch(`${getApiBaseUrl()}/billing/status`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `billing status failed (${res.status})`);
  }
  return res.json() as Promise<BillingStatus>;
}

export async function startCheckout(
  tier: "pro" | "day_pass",
): Promise<{ url: string; session_id: string }> {
  const path = tier === "pro" ? "/billing/checkout/pro" : "/billing/checkout/day-pass";
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `checkout failed (${res.status})`);
  }
  return res.json() as Promise<{ url: string; session_id: string }>;
}

export async function assertCanPublishSocial(): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/billing/gate/publish`, {
    headers: await authHeaders(),
  });
  if (res.status === 402) {
    const payload = await parsePaywallResponse(res);
    if (payload) throw new PaywallError(payload);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `publish gate failed (${res.status})`);
  }
}
