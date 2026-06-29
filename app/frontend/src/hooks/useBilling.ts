import { useCallback, useEffect, useState } from "react";

import {
  fetchBillingStatus,
  type BillingStatus,
  type PlanTier,
} from "../lib/billing";

const FREE_DEFAULTS: BillingStatus = {
  plan_tier: "free",
  shifts_used_this_period: 0,
  shifts_limit: null,
  entitlement_expires_at: null,
  has_subscription: false,
  can_use_scheduler: true,
  can_use_paper: true,
  can_publish_social: true,
};

interface Options {
  enabled?: boolean;
}

export function useBilling({ enabled = true }: Options = {}) {
  const [status, setStatus] = useState<BillingStatus>(FREE_DEFAULTS);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(FREE_DEFAULTS);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchBillingStatus();
      setStatus(next);
    } catch (e) {
      setStatus(FREE_DEFAULTS);
      setError(e instanceof Error ? e.message : "Could not load billing.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const planTier: PlanTier = status.plan_tier;

  return {
    status,
    planTier,
    loading,
    error,
    refresh,
  };
}
