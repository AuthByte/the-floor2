import { useState } from "react";
import type { PaywallPayload } from "../lib/entitlements";
import { startCheckout } from "../lib/entitlements";

interface Props {
  open: boolean;
  payload: PaywallPayload | null;
  onClose: () => void;
}

export function PaywallModal({ open, payload, onClose }: Props) {
  const [loading, setLoading] = useState<"pro" | "day_pass" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open || !payload) return null;

  const featureLabel =
    payload.upgrade.feature === "paper"
      ? "paper trading"
      : payload.upgrade.feature === "publish"
        ? "floor publishing"
        : payload.upgrade.feature === "scheduler"
          ? "schedule mode"
          : "shifts";

  async function handleCheckout(tier: "pro" | "day_pass") {
    setError(null);
    setLoading(tier);
    try {
      const session = await startCheckout(tier);
      window.location.href = session.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout unavailable");
      setLoading(null);
    }
  }

  const remaining = payload.entitlements?.shifts_remaining;
  const limit = payload.entitlements?.shifts_limit;

  return (
    <div
      className="fixed inset-0 z-[65] flex animate-fade-in items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative w-full max-w-lg animate-scale-in rounded-lg border border-brass/35 bg-ink-950 p-6 shadow-float"
        role="dialog"
        aria-labelledby="paywall-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/70 via-phos/40 to-transparent" />
        <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
          membership required
        </p>
        <h2
          id="paywall-title"
          className="mt-1 font-display text-xl font-bold tracking-wide text-wire-100"
        >
          Upgrade to keep running {featureLabel}
        </h2>
        <p className="mt-3 text-[12px] leading-relaxed text-wire-400">{payload.message}</p>

        {limit != null ? (
          <p className="mt-2 font-mono text-[10px] text-wire-600">
            Free plan: {payload.entitlements?.shifts_used ?? 0}/{limit} shifts this month
            {remaining != null ? ` · ${remaining} remaining` : ""}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {payload.upgrade.tiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              disabled={loading !== null}
              onClick={() => void handleCheckout(tier.id)}
              className="group rounded border border-wire-800 bg-ink-900/50 px-4 py-3 text-left transition hover:border-brass/50 hover:bg-brass/5 disabled:opacity-50"
            >
              <span className="block font-mono text-[9px] uppercase tracking-[0.28em] text-brass/90">
                {tier.label}
              </span>
              <span className="mt-1 block font-display text-lg font-semibold text-wire-100">
                {tier.price}
              </span>
              <span className="mt-1 block text-[10px] text-wire-600 group-hover:text-wire-500">
                {loading === tier.id ? "Opening checkout…" : "Continue to checkout"}
              </span>
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wire-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-wire-500 hover:text-wire-200"
          >
            not now
          </button>
        </div>
      </div>
    </div>
  );
}
