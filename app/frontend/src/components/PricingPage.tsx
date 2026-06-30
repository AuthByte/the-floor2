import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFloorThemeSync } from "../hooks/useFloorThemeSync";
import {
  createCheckout,
  type CheckoutPlan,
} from "../lib/billing";
import { LegalFooterLinks } from "./legal/LegalFooterLinks";
import { ClearancePass, type PassVariant } from "./pricing/ClearancePass";
import { Scanlines } from "./Scanlines";

const TIERS = [
  {
    id: "free" as const,
    pass: "tier0" as PassVariant,
    kicker: "Visitor badge",
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    features: [
      "2 shifts per month",
      "3 legends per committee",
      "Read-only wire and feed",
      "Bring your own OpenRouter key",
    ],
    cta: "Enter with Tier 0",
    checkout: null,
  },
  {
    id: "pro_monthly" as const,
    pass: "pro" as PassVariant,
    kicker: "Floor operator",
    name: "Pro",
    price: "$29",
    period: "/ month",
    highlight: true,
    badge: "Most popular",
    features: [
      "Unlimited shifts",
      "Schedule shifts with AI desk agent",
      "Full 22-legend roster",
      "Alpaca paper execution",
      "Publish shifts to the feed",
      "Priority shift archive sync",
    ],
    cta: "Issue Pro clearance",
    checkout: "pro_monthly" as CheckoutPlan,
  },
  {
    id: "pro_yearly" as const,
    pass: "annual" as PassVariant,
    kicker: "Annual desk lease",
    name: "Pro Annual",
    price: "$249",
    period: "/ year",
    highlight: false,
    badge: "Save $99",
    features: [
      "Everything in Pro monthly",
      "Billed once annually",
      "Same unlimited entitlements",
      "Best for daily operators",
    ],
    cta: "Go Pro yearly",
    checkout: "pro_yearly" as CheckoutPlan,
  },
  {
    id: "day_pass" as const,
    pass: "day" as PassVariant,
    kicker: "After-hours guest",
    name: "Day pass",
    price: "$9",
    period: "24 hours",
    highlight: false,
    features: [
      "Full Pro for one sitting",
      "Unlimited shifts for 24h",
      "No subscription commitment",
      "Great for demos and deep dives",
    ],
    cta: "Buy day pass",
    checkout: "day_pass" as CheckoutPlan,
  },
] as const;

function useInView<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`lp-reveal ${inView ? "lp-in" : ""} ${className}`}
      style={{ "--lp-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

interface Props {
  onEnter?: () => void;
}

export function PricingPage({ onEnter }: Props) {
  useFloorThemeSync();
  const { configured, session } = useAuth();
  const signedIn = Boolean(configured && session);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

  const proTier = TIERS.find((t) => t.id === "pro_monthly")!;
  const secondaryTiers = TIERS.filter((t) => t.id !== "pro_monthly");

  const handleCheckout = useCallback(
    async (plan: CheckoutPlan, tierId: string) => {
      if (!signedIn) {
        window.location.href = `/?auth=signin&next=${encodeURIComponent("/pricing")}`;
        return;
      }
      setBusyId(tierId);
      setError(null);
      try {
        const { url } = await createCheckout(plan, {
          successUrl: `${origin}/?checkout=success`,
          cancelUrl: `${origin}/pricing`,
        });
        window.location.href = url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed.");
        setBusyId(null);
      }
    },
    [origin, signedIn],
  );

  const handleFree = useCallback(() => {
    setBusyId("free");
    if (onEnter) {
      onEnter();
      return;
    }
    window.location.href = "/";
  }, [onEnter]);

  const renderTierCard = (
    tier: (typeof TIERS)[number],
    opts: { featured?: boolean; delay?: number } = {},
  ) => {
    const { featured = false, delay = 0 } = opts;
    const isBusy = busyId === tier.id || (tier.id === "free" && busyId === "free");

    return (
      <Reveal key={tier.id} delay={delay}>
        <article
          className={`relative flex h-full flex-col rounded-sm border bg-ink-900/70 p-5 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 lg:p-6 ${
            tier.highlight || featured
              ? "border-brass/45 shadow-[0_0_0_1px_rgb(var(--brass)/0.15),0_28px_60px_-32px_rgb(0_0_0/0.85)]"
              : "border-wire-900/80 shadow-[0_20px_50px_-36px_rgb(0_0_0/0.8)]"
          }`}
        >
          {"badge" in tier && tier.badge ? (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-brass/40 bg-ink-800 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-brass">
              {tier.badge}
            </span>
          ) : null}

          <div
            className={`flex gap-5 ${featured ? "flex-col sm:flex-row sm:items-start" : "flex-col"}`}
          >
            <ClearancePass variant={tier.pass} featured={featured} className="mx-auto sm:mx-0" />

            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-brass/80">
                {tier.kicker}
              </p>
              <h2 className="mt-2 font-display text-[1.45rem] font-semibold tracking-tight text-wire-100">
                {tier.name}
              </h2>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-display text-[2.1rem] font-semibold leading-none text-wire-50">
                  {tier.price}
                </span>
                <span className="font-mono text-[11px] tracking-[0.1em] text-wire-500">
                  {tier.period}
                </span>
              </div>

              <ul className={`mt-5 space-y-2 ${featured ? "sm:columns-2 sm:gap-x-6" : ""}`}>
                {tier.features.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2 font-mono text-[11px] leading-relaxed text-wire-400"
                  >
                    <span
                      className="mt-1.5 h-1 w-1 shrink-0 rotate-45 bg-phos"
                      aria-hidden
                    />
                    {feat}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  if (tier.checkout) void handleCheckout(tier.checkout, tier.id);
                  else handleFree();
                }}
                className={`mt-6 w-full rounded-sm px-5 py-3.5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] transition active:translate-y-px disabled:opacity-50 ${
                  tier.highlight || featured
                    ? "bg-brass text-ink-950 hover:bg-brass-glow"
                    : "border border-wire-800 bg-ink-800 text-wire-100 hover:border-brass/40 hover:text-brass"
                }`}
              >
                {isBusy ? "Redirecting…" : tier.cta}
              </button>
            </div>
          </div>
        </article>
      </Reveal>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-ink-950 text-wire-200">
      <div className="pointer-events-none fixed inset-0 z-0 floor-grid opacity-60" aria-hidden />
      <Scanlines lite />

      <header className="sticky top-0 z-30 border-b border-wire-900/80 bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <a
            href="/"
            className="font-mono text-[13px] font-bold tracking-[0.34em] text-wire-100 transition hover:text-brass"
          >
            THE&nbsp;FLOOR
          </a>
          <nav className="flex flex-wrap items-center gap-4 md:gap-6">
            <a
              href="/#lp-demo"
              className="font-mono text-[11px] tracking-[0.14em] text-wire-500 transition hover:text-wire-200"
            >
              Demo
            </a>
            <LegalFooterLinks variant="desk" />
          </nav>
          <button
            type="button"
            onClick={handleFree}
            className="desk-toolbar-btn rounded-sm border border-brass/35 bg-brass/10 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-brass"
          >
            Enter floor
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-12 lg:px-8 lg:pb-32 lg:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
              Clearance desk · After hours
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 font-display text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.06] tracking-tight text-wire-50">
              Pick your badge.
              <br />
              <span className="text-brass brass-glow-soft">Walk onto the floor.</span>
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-xl font-mono text-[12px] leading-relaxed text-wire-500">
              Paper trading only — simulation, not investment advice. Start on Tier 0, upgrade
              when you need the full committee, or grab a 24-hour pass for one deep session.
            </p>
          </Reveal>
        </div>

        <Reveal delay={180}>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-3">
            {[
              "Paper execution only",
              "Keys stay in your browser",
              "Cancel anytime",
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-sm border border-wire-900 bg-ink-900/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wire-500"
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>

        {error ? (
          <Reveal delay={200} className="mx-auto mt-8 max-w-xl">
            <p className="rounded-sm border border-siren/30 bg-siren/10 px-4 py-3 text-center font-mono text-[11px] text-siren">
              {error}
            </p>
          </Reveal>
        ) : null}

        <div className="mt-12">
          {renderTierCard(proTier, { featured: true, delay: 220 })}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-3 desk-stagger">
          {secondaryTiers.map((tier, i) => renderTierCard(tier, { delay: 280 + i * 70 }))}
        </div>

        <Reveal delay={500}>
          <section className="mt-14 rounded-sm border border-wire-900/80 bg-ink-900/60 p-6 lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-phos">
                  API keys · How we handle them
                </p>
                <h2 className="mt-3 font-display text-xl font-semibold text-wire-100">
                  We never store your OpenRouter or Alpaca keys on our servers.
                </h2>
                <div className="mt-4 space-y-3 font-mono text-[12px] leading-relaxed text-wire-400">
                  <p>
                    Your OpenRouter key is saved only in this browser&apos;s local storage on your
                    device. When you run a shift, it is sent directly to OpenRouter from your
                    session to power agent calls — we do not persist it in our database or logs.
                  </p>
                  <p>
                    Alpaca paper keys (optional) follow the same rule: kept locally, used only when
                    you explicitly execute paper trades. You can clear them anytime in Account
                    settings.
                  </p>
                  <p className="text-wire-500">
                    Paid checkout is handled by Stripe. We never see your card details.{" "}
                    <a href="/privacy" className="text-brass underline-offset-4 hover:underline">
                      Privacy policy
                    </a>
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-sm border border-wire-900 bg-ink-950/80 p-4 font-mono text-[10px] leading-relaxed text-wire-600">
                <p className="uppercase tracking-[0.2em] text-wire-500">Security posture</p>
                <ul className="mt-3 space-y-2">
                  <li className="flex gap-2">
                    <span className="text-phos">+</span> Keys: browser local only
                  </li>
                  <li className="flex gap-2">
                    <span className="text-phos">+</span> Shift data: your account
                  </li>
                  <li className="flex gap-2">
                    <span className="text-phos">+</span> Billing: Stripe-hosted
                  </li>
                  <li className="flex gap-2">
                    <span className="text-phos">+</span> Revoke keys anytime
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={560}>
          <div className="mx-auto mt-10 max-w-3xl rounded-sm border border-wire-900/70 bg-ink-900/40 p-5 text-center">
            <p className="font-mono text-[11px] leading-relaxed text-wire-500">
              {!signedIn && configured ? (
                <>
                  Sign in to upgrade — checkout routes through Stripe.{" "}
                  <a
                    href="/?auth=signin&next=%2Fpricing"
                    className="text-brass underline-offset-4 hover:underline"
                  >
                    Sign in
                  </a>
                </>
              ) : (
                <>
                  Manage subscriptions in{" "}
                  <span className="font-semibold text-wire-300">Account settings → Billing</span>.
                  Day passes expire 24 hours after purchase.
                </>
              )}
            </p>
          </div>
        </Reveal>
      </main>

      <footer className="relative z-10 border-t border-wire-900/80 bg-ink-950/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 lg:px-8">
          <p className="font-mono text-[10.5px] tracking-[0.2em] text-wire-600">
            THE FLOOR © 2026 · Paper trading only
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <LegalFooterLinks variant="desk" />
            <a
              href="/"
              className="font-mono text-[10.5px] tracking-[0.14em] text-wire-600 transition hover:text-brass"
            >
              ← Back to floor
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
