import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { DATA_ANALYSTS, NAMED_ANALYSTS, SPECIALIST_ANALYSTS } from "../lib/agents";
import {
  LandingProductDemo,
  LandingSocialProof,
  LandingStickyCta,
} from "./LandingProductDemo";
import { LandingFeatureDemos } from "./LandingFeatureDemos";

interface Props {
  onEnter: () => void;
}

/**
 * Marketing landing for THE FLOOR — "paper dossier" edition.
 *
 * Eight sections recreated from art-directed comps: a warm paper-bone canvas,
 * ink typography, one brass accent, and emerald/red reserved strictly for
 * market signal. Space Grotesk display + JetBrains Mono data. All motion is
 * CSS/rAF (no animation libs) and reduced-motion safe via the global guard.
 */

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const PAPER = "#F2EFE7";
const PAPER_DEEP = "#EAE6DA";
const INK = "#12110E";
const INK_SOFT = "#4A463C";
const HAIR = "rgba(18,17,14,0.16)";
const BRASS = "#A57E22";
const EMERALD = "#0E9F6E";
const RED = "#C8442C";

/* ------------------------------------------------------------------ */
/* Motion primitives                                                   */
/* ------------------------------------------------------------------ */

function useInView<T extends HTMLElement>(threshold = 0.18) {
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

/** rAF count-up that starts when `run` flips true. */
function useCountUp(target: number, run: boolean, duration = 1600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, duration]);
  return value;
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`font-mono text-[11px] font-medium uppercase tracking-[0.32em] ${className}`}
      style={{ color: BRASS }}
    >
      {children}
    </p>
  );
}

function InkPill({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 font-mono text-[13px] font-medium tracking-wide transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 ${className}`}
      style={{ background: INK, color: PAPER }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function Landing({ onEnter }: Props) {
  const scrollTo = useCallback((id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div
      id="lp-scroll"
      className="relative h-[100dvh] overflow-y-auto overflow-x-hidden font-sans"
      style={{ background: PAPER, color: INK, colorScheme: "light" }}
    >
      {/* paper grain atmosphere */}
      <div
        className="pointer-events-none fixed inset-0 z-0 lp-grain"
        aria-hidden
      />

      <Nav onEnter={onEnter} scrollTo={scrollTo} />

      <LandingStickyCta onEnter={onEnter} />

      <main className="relative z-10">
        <Hero onEnter={onEnter} scrollTo={scrollTo} />
        <LandingSocialProof />
        <TapeBar />
        <Committee onEnter={onEnter} />
        <DataFeeds />
        <Pipeline onEnter={onEnter} />
        <ProductShowcase onEnter={onEnter} />
        <LandingFeatureDemos onEnter={onEnter} />
        <DebateShowcase onEnter={onEnter} />
        <BossMemo onEnter={onEnter} />
        <PaperDesk onEnter={onEnter} />
        <TheWire onEnter={onEnter} />
        <FloorKit onEnter={onEnter} />
        <HowItWorks onEnter={onEnter} />
        <Faq />
        <FinalCta onEnter={onEnter} />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */

function Nav({
  onEnter,
  scrollTo,
}: {
  onEnter: () => void;
  scrollTo: (id: string) => void;
}) {
  const links: Array<[string, string]> = [
    ["Demo", "lp-demo"],
    ["Features", "lp-features"],
    ["Committee", "lp-committee"],
    ["Pipeline", "lp-pipeline"],
    ["Wire", "lp-wire"],
  ];
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{
        background: "rgba(242,239,231,0.86)",
        borderBottom: `1px solid ${HAIR}`,
      }}
    >
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4 lg:px-10">
        <button
          type="button"
          onClick={() => scrollTo("lp-scroll")}
          className="font-mono text-[13px] font-bold tracking-[0.34em]"
          style={{ color: INK }}
        >
          THE&nbsp;FLOOR
        </button>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([label, id], i) => (
            <span key={id} className="flex items-center gap-8">
              {i > 0 && (
                <span
                  className="inline-block h-1 w-1 rotate-45"
                  style={{ background: BRASS }}
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => scrollTo(id)}
                className="font-mono text-[12px] tracking-[0.14em] transition-opacity hover:opacity-60"
                style={{ color: INK_SOFT }}
              >
                {label}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={onEnter}
          className="rounded-full px-5 py-2 font-mono text-[12px] font-medium tracking-wide transition-transform duration-300 hover:-translate-y-0.5"
          style={{ background: INK, color: PAPER }}
        >
          Enter the Floor
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Section 1 — Hero                                                    */
/* ------------------------------------------------------------------ */

const HERO_QUOTES: Array<[string, string, number]> = [
  ["AAPL", "192.74", 1.2],
  ["NVDA", "1186.24", -0.8],
  ["MSFT", "412.11", 0.4],
  ["AMZN", "184.23", -0.3],
  ["GOOG", "167.89", 0.6],
  ["BRK.B", "433.21", 0.1],
  ["SPY", "528.16", 0.2],
  ["TSLA", "236.40", -1.4],
];

function Hero({
  onEnter,
  scrollTo,
}: {
  onEnter: () => void;
  scrollTo: (id: string) => void;
}) {
  return (
    <section className="relative flex min-h-[calc(100dvh-65px)] flex-col">
      <div className="mx-auto grid w-full max-w-[1320px] flex-1 gap-12 px-6 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(340px,1.05fr)] lg:items-center lg:gap-10 lg:px-10 lg:pt-16">
        <div className="text-center lg:text-left">
          <Reveal>
            <p
              className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[10px] tracking-[0.2em]"
              style={{ border: `1px solid ${HAIR}`, color: INK_SOFT }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: EMERALD, animation: "pulseDot 1.8s ease-in-out infinite" }}
              />
              LIVE PAPER TRADING FLOOR
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h1
              className="text-balance font-display text-[clamp(2.4rem,6vw,4.4rem)] font-semibold leading-[1.03] tracking-tight lg:text-[clamp(2.6rem,4.2vw,4.8rem)]"
              style={{ color: INK }}
            >
              Twenty-two legendary investors.
              <br />
              One after-hours{" "}
              <span style={{ color: BRASS }}>trading floor.</span>
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p
              className="mx-auto mt-6 max-w-xl font-mono text-[13px] leading-relaxed tracking-wide lg:mx-0"
              style={{ color: INK_SOFT }}
            >
              Watch Buffett debate Burry on NVDA. Every thesis ships price
              targets, horizons, and interactive research artifacts.
            </p>
          </Reveal>
          <Reveal delay={260}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-6 lg:justify-start">
              <InkPill onClick={onEnter}>
                Start a shift — free
                <span
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </InkPill>
              <button
                type="button"
                onClick={() => scrollTo("lp-demo")}
                className="font-mono text-[13px] underline underline-offset-[6px] transition-opacity hover:opacity-60"
                style={{ color: INK }}
              >
                See the live demo
              </button>
            </div>
          </Reveal>
          <Reveal delay={340}>
            <p className="mt-6 font-mono text-[10px] tracking-[0.12em]" style={{ color: INK_SOFT }}>
              No credit card · OpenRouter key only · paper execution
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} className="w-full max-lg:mx-auto max-lg:max-w-[520px]">
          <div className="lp-hero-float">
            <LandingProductDemo onEnter={onEnter} variant="hero" />
          </div>
        </Reveal>
      </div>

      {/* quote tape */}
      <Reveal delay={380}>
        <div
          className="overflow-hidden whitespace-nowrap py-2.5"
          style={{ borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}
        >
          <div
            className="inline-flex w-max gap-0"
            style={{ animation: "lp-marquee 36s linear infinite" }}
          >
            {[0, 1].map((dup) => (
              <div key={dup} className="inline-flex" aria-hidden={dup === 1}>
                {HERO_QUOTES.map(([sym, px, pct]) => (
                  <span
                    key={`${dup}-${sym}`}
                    className="inline-flex items-baseline gap-2 px-7 font-mono text-[11px] tracking-[0.12em]"
                    style={{ color: INK_SOFT }}
                  >
                    <span className="font-semibold" style={{ color: INK }}>
                      {sym}
                    </span>
                    {px}
                    <span style={{ color: pct >= 0 ? EMERALD : RED }}>
                      {pct >= 0 ? "+" : ""}
                      {pct.toFixed(1)}%
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* pixel diorama */}
      <Reveal delay={460}>
        <div className="mx-auto w-full max-w-[1180px] px-6">
          <img
            src="/landing/floor-diorama.png"
            alt="Pixel-art trading floor diorama: investor agents at desks around a debate table"
            className="lp-pixel mx-auto -mb-1 block w-full max-w-[980px] select-none"
            draggable={false}
          />
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 2 — The Tape (trust marquee)                                */
/* ------------------------------------------------------------------ */

const TAPE_ITEMS = [
  "22 INVESTOR AGENTS",
  "4-STAGE RISK PIPELINE",
  "PRICE TARGETS + HORIZONS",
  "SUPPLY CHAIN GRAPHS",
  "TICKER DOSSIERS",
  "LIVE COMMITTEE DEBATES",
  "ALPACA PAPER EXECUTION",
  "100% TRANSPARENT REASONING",
];

function TapeBar() {
  return (
    <section className="relative py-28 lg:py-36">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <Reveal>
          <p
            className="mb-10 font-mono text-[11px] uppercase tracking-[0.32em]"
            style={{ color: INK_SOFT }}
          >
            Built on&nbsp;&nbsp;/&nbsp;&nbsp;
            <span style={{ color: BRASS }}>01 — The Tape</span>
          </p>
        </Reveal>
      </div>
      <Reveal delay={120}>
        <div
          className="overflow-hidden whitespace-nowrap py-5"
          style={{
            borderTop: `1px solid ${BRASS}55`,
            borderBottom: `1px solid ${BRASS}55`,
          }}
        >
          <div
            className="inline-flex w-max items-center"
            style={{ animation: "lp-marquee 30s linear infinite" }}
          >
            {[0, 1].map((dup) => (
              <div
                key={dup}
                className="inline-flex items-center"
                aria-hidden={dup === 1}
              >
                {TAPE_ITEMS.map((item) => (
                  <span key={`${dup}-${item}`} className="inline-flex items-center">
                    <span
                      className="px-10 font-mono text-[12px] font-medium tracking-[0.22em]"
                      style={{ color: INK }}
                    >
                      {item}
                    </span>
                    <span
                      className="inline-block h-1.5 w-1.5 rotate-45"
                      style={{ background: BRASS }}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Reveal>
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <Reveal delay={220}>
          <p
            className="mt-10 text-right text-[14px]"
            style={{ color: INK_SOFT }}
          >
            Every signal, argument, and order is logged. Nothing is a black box.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — The Committee                                           */
/* ------------------------------------------------------------------ */

interface DossierCard {
  img: string | null;
  name: string;
  tag: string;
  offset: string;
}

const DOSSIERS: DossierCard[] = [
  { img: "/landing/portrait-buffett.png", name: "W. BUFFETT", tag: "MOATS", offset: "lg:mt-0" },
  { img: "/landing/portrait-burry.png", name: "M. BURRY", tag: "SHORT BOOK", offset: "lg:mt-12" },
  { img: "/landing/portrait-wood.png", name: "C. WOOD", tag: "DISRUPTION", offset: "lg:mt-4" },
  { img: "/landing/portrait-dalio.png", name: "R. DALIO", tag: "MACRO", offset: "lg:mt-16" },
  { img: "/landing/portrait-taleb.png", name: "N. TALEB", tag: "TAIL RISK", offset: "lg:mt-2" },
  { img: null, name: "THE FLOOR", tag: "COMMITTEE DOSSIER", offset: "lg:mt-10" },
  { img: "/landing/portrait-lynch.png", name: "P. LYNCH", tag: "GARP", offset: "lg:mt-20" },
];

function Committee({ onEnter }: { onEnter: () => void }) {
  const [rosterOpen, setRosterOpen] = useState(false);
  return (
    <section id="lp-committee" className="relative py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1320px] gap-14 px-6 lg:grid-cols-[minmax(300px,0.9fr)_2fr] lg:px-10">
        <div className="max-w-sm">
          <Reveal>
            <Kicker>02 — The Committee</Kicker>
          </Reveal>
          <Reveal delay={120}>
            <h2
              className="mt-5 font-display text-[clamp(2.1rem,4vw,3.4rem)] font-semibold leading-[1.04] tracking-tight"
              style={{ color: INK }}
            >
              Hire the whole hall of fame.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p
              className="mt-6 font-mono text-[12.5px] leading-relaxed"
              style={{ color: INK_SOFT }}
            >
              Each agent runs its hero&apos;s real framework — moats, tail
              risk, reflexivity, forensic shorts.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <button
              type="button"
              onClick={() => setRosterOpen((v) => !v)}
              className="mt-10 font-mono text-[13px] font-medium underline underline-offset-[6px] transition-opacity hover:opacity-60"
              style={{ color: INK }}
            >
              {rosterOpen ? "Hide the roster" : `Meet all ${NAMED_ANALYSTS.length + SPECIALIST_ANALYSTS.length} →`}
            </button>
          </Reveal>
        </div>

        {/* staggered dossier masonry */}
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {DOSSIERS.map((card, i) => (
            <Reveal key={card.name} delay={i * 90} className={card.offset}>
              <article
                className="group rounded-[4px] p-2.5 pb-3 transition-transform duration-500 hover:-translate-y-2 hover:rotate-[0.6deg]"
                style={{
                  background: "#FBF9F3",
                  border: `1px solid ${HAIR}`,
                  boxShadow: "0 18px 40px -28px rgba(18,17,14,0.45)",
                }}
              >
                {card.img ? (
                  <img
                    src={card.img}
                    alt={`Pixel-art dossier portrait of ${card.name}`}
                    className="lp-pixel aspect-square w-full rounded-[2px] object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="flex aspect-square w-full items-center justify-center rounded-[2px]"
                    style={{ background: PAPER_DEEP }}
                  >
                    <img
                      src="/landing/wax-seal.png"
                      alt="Brass wax seal of THE FLOOR committee dossier"
                      className="w-3/5 select-none transition-transform duration-700 group-hover:rotate-6"
                      draggable={false}
                    />
                  </div>
                )}
                <p
                  className="mt-3 font-mono text-[11.5px] font-semibold tracking-[0.08em]"
                  style={{ color: INK }}
                >
                  {card.name}
                </p>
                <p
                  className="mt-0.5 font-mono text-[10px] tracking-[0.14em]"
                  style={{ color: card.img ? EMERALD : BRASS }}
                >
                  / {card.tag}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>

      {/* expandable full roster */}
      <div
        className="mx-auto max-w-[1320px] overflow-hidden px-6 transition-[max-height,opacity] duration-700 ease-out lg:px-10"
        style={{ maxHeight: rosterOpen ? 600 : 0, opacity: rosterOpen ? 1 : 0 }}
      >
        <div
          className="mt-12 flex flex-wrap gap-x-8 gap-y-3 rounded-[4px] p-7"
          style={{ border: `1px solid ${HAIR}`, background: "#FBF9F3" }}
        >
          {NAMED_ANALYSTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={onEnter}
              className="font-mono text-[11.5px] tracking-[0.1em] transition-colors"
              style={{ color: INK_SOFT }}
              onMouseEnter={(e) => (e.currentTarget.style.color = BRASS)}
              onMouseLeave={(e) => (e.currentTarget.style.color = INK_SOFT)}
            >
              {a.name.toUpperCase()}{" "}
              <span style={{ color: BRASS }}>/ {a.callsign}</span>
            </button>
          ))}
          <p
            className="mt-4 w-full font-mono text-[10px] uppercase tracking-[0.28em]"
            style={{ color: INK_SOFT }}
          >
            Further analysis
          </p>
          {SPECIALIST_ANALYSTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={onEnter}
              className="font-mono text-[11.5px] tracking-[0.1em] transition-colors"
              style={{ color: INK_SOFT }}
              onMouseEnter={(e) => (e.currentTarget.style.color = BRASS)}
              onMouseLeave={(e) => (e.currentTarget.style.color = INK_SOFT)}
            >
              {a.name.toUpperCase()}{" "}
              <span style={{ color: BRASS }}>/ {a.callsign}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 4 — The Pipeline                                            */
/* ------------------------------------------------------------------ */

const PIPELINE_STEPS: Array<{
  label: string;
  sub: string;
  caption: string;
  icon: ReactNode;
}> = [
  {
    label: "TIER 0",
    sub: "/ DATA DESKS",
    caption: "Capture. Verify. Normalize.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="12" r="5" />
        <circle cx="10" cy="12" r="1.6" fill="currentColor" />
        <rect x="19" y="6" width="9" height="12" rx="1" />
        <path d="M21 10h5M21 13h5M5 22h22M5 26h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "RISK ROW",
    sub: "/ FORGE → WATCH",
    caption: "Inventory. Research. Stress. Watch.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 26V10l10-6 10 6v16" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 26V14h10v12M6 14h20" strokeLinecap="round" />
        <circle cx="22" cy="20" r="3" />
      </svg>
    ),
  },
  {
    label: "THE GATE",
    sub: "/ BRIEFINGS",
    caption: "Screen. Prioritize. Brief.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 28V12c0-5 4.5-8 11-8s11 3 11 8v16" strokeLinecap="round" />
        <path d="M11 28V12M16 28V10M21 28V12M5 16h22" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "TIER 1",
    sub: "/ 22 INVESTORS",
    caption: "Read. Challenge. Score.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="9" cy="10" r="3" />
        <circle cx="23" cy="10" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M4 26c0-4 2.5-6.5 5-6.5S14 22 14 26M18 26c0-4 2.5-6.5 5-6.5S28 22 28 26M11 24c1-3.5 2.8-5 5-5s4 1.5 5 5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "THE DEBATE",
    sub: "/ CROSSFIRE",
    caption: "Pressure. Disagree. Refine.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="14" width="8" height="6" rx="1" />
        <rect x="20" y="14" width="8" height="6" rx="1" />
        <path d="M8 14V9M24 14V9M6 9h4M22 9h4M8 20v8M24 20v8M5 28h6M21 28h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "RISK + BOSS",
    sub: "/ ORDERS",
    caption: "Size. Approve. Execute.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="4" width="20" height="24" rx="1" />
        <path d="M10 10h12M10 14h12M10 18h7" strokeLinecap="round" />
        <circle cx="21" cy="22" r="4" />
      </svg>
    ),
  },
];

function Pipeline({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="lp-pipeline" className="relative overflow-hidden py-24 lg:py-32">
      {/* oversized ghost numeral */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-display text-[34rem] font-semibold leading-none"
        style={{ color: "rgba(18,17,14,0.035)" }}
      >
        6
      </span>

      <div className="relative mx-auto max-w-[1320px] px-6 text-center lg:px-10">
        <Reveal>
            <Kicker>04 — The Pipeline</Kicker>
        </Reveal>
        <Reveal delay={120}>
          <h2
            className="mx-auto mt-5 max-w-3xl font-display text-[clamp(2.1rem,4.4vw,3.6rem)] font-semibold leading-[1.05] tracking-tight"
            style={{ color: INK }}
          >
            Data first. Risks mapped. Opinions last.
          </h2>
        </Reveal>

        <div className="mt-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-6 lg:gap-0">
          {PIPELINE_STEPS.map((step, i) => (
            <Reveal key={step.label} delay={i * 130} className="relative">
              <div className="flex flex-col items-center gap-4 px-3">
                <div
                  className="relative flex h-28 w-28 items-center justify-center rounded-[4px]"
                  style={{ border: `1px solid ${HAIR}`, background: "#FBF9F3", color: INK }}
                >
                  <span
                    aria-hidden
                    className="absolute right-1.5 top-1.5 font-mono text-[9px]"
                    style={{ color: RED }}
                  >
                    +
                  </span>
                  {step.icon}
                </div>
                <div>
                  <p className="font-mono text-[12px] font-semibold tracking-[0.16em]" style={{ color: INK }}>
                    {step.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tracking-[0.12em]" style={{ color: INK_SOFT }}>
                    {step.sub}
                  </p>
                </div>
                <p className="font-mono text-[10px] tracking-[0.1em]" style={{ color: INK_SOFT }}>
                  {step.caption}
                </p>
              </div>
              {/* brass connector */}
              {i < PIPELINE_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute right-[-14px] top-14 hidden items-center lg:flex"
                  style={{ color: BRASS }}
                >
                  <span className="block h-px w-6" style={{ background: BRASS }} />
                  <span className="-ml-1 text-[10px]">›</span>
                </span>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal delay={700}>
          <button
            type="button"
            onClick={onEnter}
            className="mt-20 inline-flex items-center gap-3 px-8 py-3.5 font-mono text-[13px] tracking-wide transition-all duration-300 hover:-translate-y-0.5"
            style={{ border: `1px solid ${INK}`, color: INK, background: "transparent" }}
          >
            See a full shift <span aria-hidden>→</span>
          </button>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 5 — The Debate (interactive demo, dark)                     */
/* ------------------------------------------------------------------ */

interface DebateLine {
  speaker: "BUFFETT" | "BURRY";
  stance: string;
  text: string;
  conf: { buffett: number; burry: number };
}

const DEBATE_SCRIPT: DebateLine[] = [
  {
    speaker: "BUFFETT",
    stance: "BULL CASE",
    text: "NVDA's moat is compounding. CUDA, developer lock-in, and the full-stack advantage create durable pricing power. This is a decade compounder, not a trade.",
    conf: { buffett: 68, burry: 62 },
  },
  {
    speaker: "BURRY",
    stance: "BEAR CASE",
    text: "Valuation discounts perfection. Capex is front-loaded, competition is real, and margins will mean revert. One hiccup in demand and the multiple compresses fast.",
    conf: { buffett: 64, burry: 69 },
  },
  {
    speaker: "BUFFETT",
    stance: "REBUTTAL",
    text: "Mean reversion assumes substitutes exist. They don't yet. Hyperscaler capex is contracted years out — the 'hiccup' is priced like a certainty that hasn't appeared.",
    conf: { buffett: 74, burry: 65 },
  },
  {
    speaker: "BURRY",
    stance: "REBUTTAL",
    text: "Contracts get renegotiated in downturns. I'll concede the moat — not the multiple. At 40x forward, the risk/reward favors patience over chasing.",
    conf: { buffett: 74, burry: 62 },
  },
];

function ConfMeter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-[#8d8a80]">
          {label}
        </span>
        <span className="font-mono text-[18px] font-bold" style={{ color }}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#2a2822]">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

function DebateShowcase({ onEnter }: { onEnter: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [step, setStep] = useState(-1);
  const playing = inView && step < DEBATE_SCRIPT.length;

  useEffect(() => {
    if (!inView) return;
    if (step >= DEBATE_SCRIPT.length) return;
    const t = setTimeout(
      () => setStep((s) => s + 1),
      step === -1 ? 500 : 2600,
    );
    return () => clearTimeout(t);
  }, [inView, step]);

  const conf =
    step >= 0
      ? DEBATE_SCRIPT[Math.min(step, DEBATE_SCRIPT.length - 1)].conf
      : { buffett: 50, burry: 50 };
  const done = step >= DEBATE_SCRIPT.length;
  const visibleLines = DEBATE_SCRIPT.slice(0, Math.max(0, Math.min(step + 1, DEBATE_SCRIPT.length)));

  return (
    <section
      id="lp-debate"
      ref={ref}
      className="relative overflow-hidden py-24 lg:py-32"
      style={{ background: "#121009", color: PAPER }}
    >
      {/* brass vignette atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(70% 60% at 18% 20%, rgba(165,126,34,0.14), transparent 65%), radial-gradient(60% 50% at 90% 90%, rgba(165,126,34,0.07), transparent 60%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.05] mix-blend-soft-light" aria-hidden />

      <div className="relative mx-auto grid max-w-[1320px] items-end gap-14 px-6 lg:grid-cols-[1fr_1.25fr] lg:px-10">
        {/* caption — bottom-left */}
        <div className="order-2 lg:order-1">
          <Reveal>
            <Kicker>05 — The Debate</Kicker>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-5 font-mono text-[clamp(1.7rem,3.4vw,2.7rem)] font-semibold leading-[1.18] tracking-tight">
              They argue.
              <br />
              You watch the tape change.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 max-w-sm font-mono text-[12px] leading-relaxed text-[#9b988d]">
              Live crossfire transcripts. Confidence moves only when arguments
              land.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <button
              type="button"
              onClick={onEnter}
              className="mt-9 font-mono text-[13px] underline underline-offset-[6px] transition-opacity hover:opacity-60"
              style={{ color: PAPER }}
            >
              Open the theater →
            </button>
          </Reveal>
        </div>

        {/* live demo panel */}
        <Reveal delay={180} className="order-1 lg:order-2">
          <div
            className="rounded-[6px] backdrop-blur-sm"
            style={{
              background: "rgba(20,18,12,0.88)",
              border: "1px solid rgba(242,239,231,0.14)",
              boxShadow: "0 60px 120px -60px rgba(0,0,0,0.9)",
            }}
          >
            {/* panel header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid rgba(242,239,231,0.1)" }}
            >
              <p className="font-mono text-[12px] font-semibold tracking-[0.18em]">
                ARGUMENT ROOM · NVDA · ROUND 2
              </p>
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-[#8d8a80]">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: playing ? EMERALD : "#8d8a80",
                    animation: playing ? "pulseDot 1.8s ease-in-out infinite" : undefined,
                  }}
                />
                {done ? "ROUND OVER" : "LIVE"}
              </p>
            </div>

            {/* transcript */}
            <div className="flex min-h-[280px] flex-col gap-5 px-6 py-6">
              {visibleLines.length === 0 && (
                <p className="m-auto font-mono text-[11px] tracking-[0.2em] text-[#6f6c62]">
                  CALLING THE ROOM TO ORDER<span style={{ animation: "lp-blink 1.1s steps(1) infinite" }}>_</span>
                </p>
              )}
              {visibleLines.map((line, i) => {
                const isBuffett = line.speaker === "BUFFETT";
                return (
                  <div
                    key={i}
                    className="flex gap-4 animate-rise-in"
                    style={{ animationDuration: "0.6s" }}
                  >
                    <img
                      src={
                        isBuffett
                          ? "/landing/portrait-buffett.png"
                          : "/landing/portrait-burry.png"
                      }
                      alt={`${line.speaker} pixel avatar`}
                      className="lp-pixel h-12 w-12 shrink-0 rounded-[3px] object-cover"
                      style={{ border: "1px solid rgba(242,239,231,0.18)" }}
                      draggable={false}
                    />
                    <div>
                      <p className="font-mono text-[11px] font-semibold tracking-[0.14em]">
                        {line.speaker}{" "}
                        <span
                          className="ml-2 text-[9.5px] font-medium tracking-[0.18em]"
                          style={{ color: isBuffett ? EMERALD : "#ff7a5c" }}
                        >
                          ● {line.stance}
                        </span>
                      </p>
                      <p className="mt-1.5 max-w-md font-mono text-[11.5px] leading-relaxed text-[#cfccc2]">
                        {line.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* confidence + verdict */}
            <div
              className="flex flex-col gap-5 px-6 py-5"
              style={{ borderTop: "1px solid rgba(242,239,231,0.1)" }}
            >
              <div className="flex gap-8">
                <ConfMeter label="BUFFETT CONFIDENCE" value={conf.buffett} color={EMERALD} />
                <ConfMeter label="BURRY CONFIDENCE" value={conf.burry} color="#ff7a5c" />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(-1)}
                  className="font-mono text-[10.5px] tracking-[0.18em] text-[#8d8a80] transition-colors hover:text-[#f2efe7]"
                >
                  ↺ REPLAY ROUND
                </button>
                <span
                  className="inline-flex items-center gap-2 rounded-[3px] px-4 py-2 font-mono text-[11px] tracking-[0.18em] transition-all duration-700"
                  style={{
                    border: `1px solid ${BRASS}`,
                    color: "#e3b24b",
                    opacity: done ? 1 : 0.25,
                    transform: done ? "translateY(0)" : "translateY(4px)",
                  }}
                >
                  ⚖ JUDGE VERDICT {done ? "· EDGE: BULL" : "· PENDING"}
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 6 — The Boss Memo                                           */
/* ------------------------------------------------------------------ */

interface MemoRow {
  ticker: string;
  action: string;
  qty: number;
  conviction: number;
  reason: string;
  color: string;
}

const MEMO_ROWS: MemoRow[] = [
  {
    ticker: "NVDA",
    action: "BUY",
    qty: 24,
    conviction: 78,
    reason: "Earnings inflection + Blackwell ramp; supply improving.",
    color: EMERALD,
  },
  {
    ticker: "WMT",
    action: "HOLD",
    qty: 0,
    conviction: 64,
    reason: "Defensive anchor; margins stable, growth muted.",
    color: "#B07A1E",
  },
  {
    ticker: "TSLA",
    action: "SHORT",
    qty: 12,
    conviction: 71,
    reason: "Demand softening; valuation stretched vs. fundamentals.",
    color: RED,
  },
];

function BossMemo({ onEnter }: { onEnter: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative py-24 lg:py-36" style={{ background: PAPER_DEEP }}>
      <div className="mx-auto grid max-w-[1320px] items-center gap-16 px-6 lg:grid-cols-[1.5fr_1fr] lg:px-10">
        {/* memo artifact */}
        <Reveal>
          <article
            className="relative mx-auto w-full max-w-xl -rotate-1 rounded-[3px] p-8 transition-transform duration-700 hover:rotate-0 sm:p-10"
            style={{
              background: "#F8F5EC",
              border: `1px solid ${HAIR}`,
              boxShadow: "0 50px 90px -50px rgba(18,17,14,0.55)",
            }}
          >
            <h3 className="font-mono text-[24px] font-bold tracking-tight" style={{ color: INK }}>
              BOSS MEMO
            </h3>
            <p className="mt-1 font-mono text-[10.5px] tracking-[0.22em]" style={{ color: INK_SOFT }}>
              PORTFOLIO MANAGER → TRADING DESK
            </p>
            <div className="my-5 h-px w-full" style={{ background: HAIR }} />
            <p className="font-mono text-[10.5px] tracking-[0.14em]" style={{ color: INK_SOFT }}>
              DATE: MAY 12, 2026 09:32:17 ET
            </p>

            <div className="mt-6 flex flex-col">
              {MEMO_ROWS.map((row, i) => (
                <div
                  key={row.ticker}
                  className="grid grid-cols-[68px_1fr_auto] items-start gap-4 py-4"
                  style={{ borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}
                >
                  <p className="font-mono text-[17px] font-bold" style={{ color: INK }}>
                    {row.ticker}
                  </p>
                  <div>
                    <p className="font-mono text-[13px] font-bold tracking-wide" style={{ color: row.color }}>
                      {row.action}
                      {row.qty > 0 ? ` ${row.qty}` : " 0"}
                    </p>
                    <p
                      className="mt-1 overflow-hidden font-mono text-[10.5px] leading-relaxed transition-[max-height,opacity] duration-500"
                      style={{
                        color: INK_SOFT,
                        maxHeight: open ? 60 : 0,
                        opacity: open ? 1 : 0,
                      }}
                    >
                      {row.reason}
                    </p>
                  </div>
                  <span
                    className="rounded-[2px] px-2.5 py-1 font-mono text-[9.5px] tracking-[0.12em]"
                    style={{ border: `1px solid ${row.color}66`, color: row.color }}
                  >
                    CONVICTION {row.conviction}%
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-end justify-between">
              <div>
                <p
                  className="font-display text-[22px] italic"
                  style={{ color: INK, transform: "rotate(-3deg)" }}
                >
                  The Boss
                </p>
                <p className="mt-1 font-mono text-[9.5px] tracking-[0.2em]" style={{ color: INK_SOFT }}>
                  SIGNED: ____________________
                </p>
              </div>
              <img
                src="/landing/wax-seal.png"
                alt="Executed — paper desk wax seal"
                className="w-24 select-none opacity-90"
                draggable={false}
              />
            </div>
          </article>
        </Reveal>

        {/* caption — right third */}
        <div>
          <Reveal delay={120}>
            <Kicker>06 — The Verdict</Kicker>
          </Reveal>
          <Reveal delay={220}>
            <h2
              className="mt-5 font-display text-[clamp(2.2rem,4vw,3.6rem)] font-semibold leading-[1.04] tracking-tight"
              style={{ color: INK }}
            >
              One memo.
              <br />
              Real sizing.
            </h2>
          </Reveal>
          <Reveal delay={320}>
            <p className="mt-6 max-w-xs font-mono text-[12.5px] leading-relaxed" style={{ color: INK_SOFT }}>
              Risk caps every position. The boss picks quantities inside the
              box — then signs.
            </p>
          </Reveal>
          <Reveal delay={420}>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <InkPill onClick={() => setOpen((v) => !v)} className="!px-6 !py-3 text-[12px]">
                {open ? "Fold the memo" : "Read a sample memo"} <span aria-hidden>→</span>
              </InkPill>
              <button
                type="button"
                onClick={onEnter}
                className="font-mono text-[12px] underline underline-offset-[6px] transition-opacity hover:opacity-60"
                style={{ color: INK }}
              >
                Run your own
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 7 — The Paper Desk                                          */
/* ------------------------------------------------------------------ */

const EQUITY_POINTS = [
  82, 83.2, 82.6, 84.1, 85.3, 84.8, 86.2, 87.5, 88.1, 87.4, 89.0, 90.6, 91.2,
  92.8, 91.9, 88.4, 90.2, 92.5, 94.1, 95.0, 96.4, 97.2, 98.8, 100.1, 101.4,
  100.6, 102.3, 103.1, 104.2,
];

function equityPath(width: number, height: number) {
  const min = 80;
  const max = 110;
  const step = width / (EQUITY_POINTS.length - 1);
  return EQUITY_POINTS.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / (max - min)) * height;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function PaperDesk({ onEnter }: { onEnter: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const equity = useCountUp(104212, inView, 1800);
  const pnl = useCountUp(1184, inView, 1800);
  const winRate = useCountUp(58, inView, 1800);
  const path = useMemo(() => equityPath(640, 200), []);

  return (
    <section id="lp-paper" ref={ref} className="relative py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1320px] gap-14 px-6 lg:grid-cols-[minmax(280px,0.85fr)_2fr] lg:px-10">
        {/* caption — left third */}
        <div className="max-w-xs">
          <Reveal>
            <Kicker>07 — The Paper Desk</Kicker>
          </Reveal>
          <Reveal delay={120}>
            <h2
              className="mt-5 font-display text-[clamp(2.1rem,4vw,3.4rem)] font-semibold leading-[1.05] tracking-tight"
              style={{ color: INK }}
            >
              Decisions meet the market.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 font-mono text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
              Every memo can fire real orders into an Alpaca paper account.
              Track equity, fills, and P&amp;L shift after shift.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <button
              type="button"
              onClick={onEnter}
              className="mt-10 font-mono text-[13px] font-medium underline underline-offset-[6px] transition-opacity hover:opacity-60"
              style={{ color: INK }}
            >
              Connect paper keys →
            </button>
          </Reveal>
        </div>

        {/* analytics panel */}
        <Reveal delay={180}>
          <div
            className="rounded-[5px]"
            style={{
              background: "#FBF9F3",
              border: `1px solid ${HAIR}`,
              boxShadow: "0 40px 80px -50px rgba(18,17,14,0.4)",
            }}
          >
            {/* metric strip */}
            <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
              {(
                [
                  ["EQUITY", `$${Math.round(equity).toLocaleString()}`, INK],
                  ["DAY P&L", `+$${Math.round(pnl).toLocaleString()}`, EMERALD],
                  ["WIN RATE", `${Math.round(winRate)}%`, INK],
                ] as Array<[string, string, string]>
              ).map(([label, value, color], i) => (
                <div
                  key={label}
                  className="px-6 py-6 text-center sm:text-left"
                  style={{ borderLeft: i > 0 ? `1px solid ${HAIR}` : undefined }}
                >
                  <p className="font-mono text-[10px] tracking-[0.22em]" style={{ color: INK_SOFT }}>
                    {label}
                  </p>
                  <p
                    className="mt-2 font-mono text-[clamp(1.3rem,2.4vw,2rem)] font-bold tabular-nums tracking-tight"
                    style={{ color }}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* equity curve */}
            <div className="px-6 pt-8">
              <svg
                viewBox="0 0 640 200"
                className="w-full"
                role="img"
                aria-label="Paper account equity curve rising from $82k to $104k with one drawdown"
              >
                <defs>
                  <linearGradient id="lp-eq-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={EMERALD} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={EMERALD} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* dotted grid */}
                {[0.25, 0.5, 0.75].map((f) => (
                  <line
                    key={f}
                    x1="0"
                    x2="640"
                    y1={200 * f}
                    y2={200 * f}
                    stroke={HAIR}
                    strokeDasharray="2 6"
                  />
                ))}
                <path
                  d={`${path} L640,200 L0,200 Z`}
                  fill="url(#lp-eq-fill)"
                  style={{
                    opacity: inView ? 1 : 0,
                    transition: "opacity 1.6s ease 0.8s",
                  }}
                />
                <path
                  d={path}
                  fill="none"
                  stroke={EMERALD}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: inView ? 0 : 1,
                    transition: "stroke-dashoffset 2.4s cubic-bezier(0.4,0,0.2,1) 0.3s",
                  }}
                />
                <circle
                  cx="640"
                  cy={200 - ((104.2 - 80) / 30) * 200}
                  r="4"
                  fill={EMERALD}
                  style={{
                    opacity: inView ? 1 : 0,
                    transition: "opacity 0.5s ease 2.6s",
                  }}
                />
              </svg>
              <div className="mt-2 flex justify-between font-mono text-[9.5px] tracking-[0.14em]" style={{ color: INK_SOFT }}>
                {["MAY 01", "MAY 08", "MAY 15", "MAY 22", "MAY 29", "JUN 05", "JUN 12"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>

            {/* positions + disclaimer */}
            <div className="flex flex-wrap items-center gap-4 px-6 py-6">
              <span
                className="rounded-[3px] px-4 py-2 font-mono text-[11px] tracking-[0.1em]"
                style={{ border: `1px solid ${EMERALD}77`, color: INK }}
              >
                NVDA <span style={{ color: EMERALD }}>+24 · +3.1%</span>
              </span>
              <span
                className="rounded-[3px] px-4 py-2 font-mono text-[11px] tracking-[0.1em]"
                style={{ border: `1px solid ${RED}77`, color: INK }}
              >
                TSLA <span style={{ color: RED }}>−12 · +1.2%</span>
              </span>
            </div>
            <p
              className="px-6 py-3 font-mono text-[9.5px] tracking-[0.22em]"
              style={{ color: BRASS, borderTop: `1px solid ${HAIR}` }}
            >
              PAPER TRADING — NOT ADVICE
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — The Data Desk                                           */
/* ------------------------------------------------------------------ */

const DATA_FEEDS: Array<{ name: string; role: string }> = [
  { name: "THE VAULT", role: "official filings" },
  { name: "THE LEDGER", role: "quarterly books" },
  { name: "THE DEEP STACK", role: "fundamentals" },
  { name: "THE TAPE", role: "price history" },
  { name: "CLOSING BELL", role: "live quotes" },
  { name: "THE RATIO DESK", role: "valuation metrics" },
  { name: "SCUTTLEBUTT", role: "headlines & mood" },
  { name: "MOOD BOARD", role: "sentiment scores" },
  { name: "MACRO BUREAU", role: "rates & labor" },
  { name: "STAT SHEET", role: "cross-market stats" },
  { name: "AFTER-HOURS", role: "extended tape" },
  { name: "REDUNDANCY LANE", role: "fills the gaps" },
];

function DataFeeds() {
  return (
    <section id="lp-data" className="relative py-24 lg:py-32" style={{ background: PAPER_DEEP }}>
      <div className="mx-auto grid max-w-[1320px] gap-16 px-6 lg:grid-cols-[minmax(280px,0.9fr)_1.6fr] lg:px-10">
        <div className="max-w-sm">
          <Reveal>
            <Kicker>03 — The Data Desk</Kicker>
          </Reveal>
          <Reveal delay={120}>
            <h2
              className="mt-5 font-display text-[clamp(2rem,3.8vw,3.2rem)] font-semibold leading-[1.05] tracking-tight"
              style={{ color: INK }}
            >
              Twelve desks.
              <br />
              One merged truth.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 font-mono text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
              Each desk has a job on the floor — filings, tape, macro, mood.
              When one source goes quiet, the redundancy lane picks up the
              slack. Analysts see numbers, not vendor names.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <div
              className="mt-8 rounded-[4px] px-5 py-4 font-mono text-[10.5px] leading-relaxed tracking-[0.08em]"
              style={{ border: `1px solid ${HAIR}`, background: "#FBF9F3", color: INK_SOFT }}
            >
              <span style={{ color: BRASS }}>EXAMPLE MERGE</span>
              <br />
              Vault + Ledger + Ratio Desk + Redundancy Lane
              <br />
              <span style={{ color: EMERALD }}>→ 6/6 line items populated</span>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {DATA_FEEDS.map((feed, i) => (
            <Reveal key={feed.name} delay={i * 55}>
              <div
                className="group rounded-[4px] px-4 py-4 transition-transform duration-300 hover:-translate-y-1"
                style={{
                  background: "#FBF9F3",
                  border: `1px solid ${HAIR}`,
                  boxShadow: "0 12px 28px -22px rgba(18,17,14,0.35)",
                }}
              >
                <p
                  className="font-mono text-[11px] font-semibold tracking-[0.12em]"
                  style={{ color: INK }}
                >
                  {feed.name}
                </p>
                <p
                  className="mt-1.5 font-mono text-[9.5px] tracking-[0.18em]"
                  style={{ color: BRASS }}
                >
                  / {feed.role}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 8 — The Wire                                                */
/* ------------------------------------------------------------------ */

interface WireLine {
  ts: string;
  callsign: string;
  status: string;
  level: "ok" | "warn" | "err";
}

const WIRE_SCRIPT: WireLine[] = [
  { ts: "21:04:12", callsign: "EPS", status: "AAPL 10-Q digest — revenue +2.1% QoQ", level: "ok" },
  { ts: "21:04:38", callsign: "SHORT", status: "NVDA FCF yield 1.8% — below threshold", level: "warn" },
  { ts: "21:05:01", callsign: "OMHA", status: "moat score 8.4 — initiating thesis", level: "ok" },
  { ts: "21:05:44", callsign: "MACRO", status: "FRED: 10Y yield easing — risk-on tilt", level: "ok" },
  { ts: "21:06:19", callsign: "DEBATE", status: "BUFFETT vs BURRY — round 2 open", level: "ok" },
  { ts: "21:07:02", callsign: "RISK", status: "position cap 12% — TSLA short sized", level: "warn" },
  { ts: "21:07:41", callsign: "BOSS", status: "memo signed — 3 orders queued", level: "ok" },
  { ts: "21:08:05", callsign: "SYS", status: "alpaca paper fill NVDA +24 @ 1186.24", level: "ok" },
];

function WireLevel({ level }: { level: WireLine["level"] }) {
  const color = level === "ok" ? EMERALD : level === "warn" ? BRASS : RED;
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function TheWire({ onEnter }: { onEnter: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (visible >= WIRE_SCRIPT.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? 400 : 900);
    return () => clearTimeout(t);
  }, [inView, visible]);

  const lines = WIRE_SCRIPT.slice(0, visible);

  return (
    <section
      id="lp-wire"
      ref={ref}
      className="relative py-24 lg:py-32"
      style={{ background: INK, color: PAPER }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(55% 45% at 80% 15%, rgba(165,126,34,0.12), transparent 60%)",
        }}
      />

      <div className="relative mx-auto grid max-w-[1320px] gap-14 px-6 lg:grid-cols-[1fr_1.35fr] lg:px-10">
        <div>
          <Reveal>
            <p
              className="font-mono text-[11px] font-medium uppercase tracking-[0.32em]"
              style={{ color: BRASS }}
            >
              08 — The Wire
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-5 font-display text-[clamp(2rem,3.8vw,3.2rem)] font-semibold leading-[1.05] tracking-tight">
              Every call signed.
              <br />
              Nothing off-record.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-6 max-w-sm font-mono text-[12px] leading-relaxed text-[#9b988d]">
              The live terminal logs every agent dispatch, data pull, debate
              round, and fill. Click a callsign to zoom the floor to their room.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <button
              type="button"
              onClick={onEnter}
              className="mt-10 font-mono text-[13px] underline underline-offset-[6px] transition-opacity hover:opacity-60"
              style={{ color: PAPER }}
            >
              Open the wire →
            </button>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <div
            className="overflow-hidden rounded-[5px] font-mono text-[11px]"
            style={{
              border: "1px solid rgba(242,239,231,0.14)",
              background: "rgba(10,9,7,0.92)",
              boxShadow: "0 40px 80px -40px rgba(0,0,0,0.8)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5 text-[10px] tracking-[0.2em] text-[#8d8a80]"
              style={{ borderBottom: "1px solid rgba(242,239,231,0.1)" }}
            >
              <span>LIVE WIRE · SHIFT #047</span>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: EMERALD,
                    animation: inView ? "pulseDot 1.8s ease-in-out infinite" : undefined,
                  }}
                />
                STREAMING
              </span>
            </div>
            <div className="flex max-h-[340px] min-h-[280px] flex-col gap-0 overflow-y-auto px-5 py-4">
              {lines.length === 0 && (
                <p className="m-auto tracking-[0.2em] text-[#6f6c62]">
                  AWAITING DISPATCH
                  <span style={{ animation: "lp-blink 1.1s steps(1) infinite" }}>_</span>
                </p>
              )}
              {lines.map((line, i) => (
                <div
                  key={`${line.ts}-${line.callsign}`}
                  className="grid grid-cols-[72px_56px_1fr_12px] items-start gap-3 border-b py-3 animate-rise-in"
                  style={{
                    borderColor: "rgba(242,239,231,0.06)",
                    animationDuration: "0.45s",
                    animationDelay: `${i * 40}ms`,
                  }}
                >
                  <span className="tabular-nums text-[#6f6c62]">{line.ts}</span>
                  <span className="font-semibold tracking-[0.1em]" style={{ color: BRASS }}>
                    [{line.callsign}]
                  </span>
                  <span className="leading-relaxed text-[#cfccc2]">{line.status}</span>
                  <WireLevel level={line.level} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 9 — Floor Kit                                             */
/* ------------------------------------------------------------------ */

const FLOOR_TOOLS: Array<{
  tag: string;
  title: string;
  body: string;
}> = [
  {
    tag: "TARGET",
    title: "Price targets",
    body: "Every investor thesis publishes a horizon, USD target, and implied upside on the verdict plaque and boss memo.",
  },
  {
    tag: "RISK",
    title: "Risk pipeline",
    body: "Four dedicated rooms forge risk inventory, dispatch specialists, model scenarios, and run the watchtower.",
  },
  {
    tag: "GRAPH",
    title: "Supply chain maps",
    body: "Interactive tiered supplier graphs publish as room artifacts — click nodes, trace concentration risk.",
  },
  {
    tag: "DOSSIER",
    title: "Ticker dossiers",
    body: "Facts, agent claims, and auto-detected disputes accumulate per ticker across the shift.",
  },
  {
    tag: "CHART",
    title: "Artifact gallery",
    body: "Matplotlib charts and custom graphs pulse in each room until you open them.",
  },
  {
    tag: "RED",
    title: "Unknown unknowns",
    body: "Red-team agent attacks desk consensus before the portfolio manager signs.",
  },
];

function FloorKit({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Kicker>09 — The Floor Kit</Kicker>
          </Reveal>
          <Reveal delay={120}>
            <h2
              className="mt-5 font-display text-[clamp(2.1rem,4vw,3.4rem)] font-semibold leading-[1.05] tracking-tight"
              style={{ color: INK }}
            >
              More than a dashboard.
              <br />
              A trading floor you can walk.
            </h2>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FLOOR_TOOLS.map((tool, i) => (
            <Reveal key={tool.tag} delay={i * 80}>
              <article
                className="group flex h-full flex-col rounded-[4px] p-6 transition-transform duration-300 hover:-translate-y-1"
                style={{
                  background: "#FBF9F3",
                  border: `1px solid ${HAIR}`,
                  boxShadow: "0 16px 36px -28px rgba(18,17,14,0.4)",
                }}
              >
                <p
                  className="font-mono text-[10px] font-medium tracking-[0.24em]"
                  style={{ color: BRASS }}
                >
                  / {tool.tag}
                </p>
                <h3
                  className="mt-3 font-display text-[1.35rem] font-semibold tracking-tight"
                  style={{ color: INK }}
                >
                  {tool.title}
                </h3>
                <p
                  className="mt-3 flex-1 font-mono text-[11.5px] leading-relaxed"
                  style={{ color: INK_SOFT }}
                >
                  {tool.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={520}>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-6">
            <InkPill onClick={onEnter}>
              Tour the floor
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </InkPill>
            <p className="font-mono text-[11px] tracking-[0.12em]" style={{ color: INK_SOFT }}>
              Press <kbd className="rounded px-1.5 py-0.5" style={{ border: `1px solid ${HAIR}` }}>?</kbd> for shortcuts
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section — Product showcase (full demo)                              */
/* ------------------------------------------------------------------ */

function ProductShowcase({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="lp-demo" className="relative py-24 lg:py-32" style={{ background: PAPER }}>
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Kicker>See it live</Kicker>
          </Reveal>
          <Reveal delay={100}>
            <h2
              className="mt-5 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-semibold leading-[1.05] tracking-tight"
              style={{ color: INK }}
            >
              Not a pitch deck.
              <br />
              The actual floor.
            </h2>
          </Reveal>
          <Reveal delay={180}>
            <p className="mx-auto mt-5 max-w-lg font-mono text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
              Tab through Floor, Wire, Thesis, Debate, and Memo — same UI you get after
              you enter. Auto-tour runs until you click a tab.
            </p>
          </Reveal>
        </div>
        <Reveal delay={260} className="mt-14">
          <LandingProductDemo onEnter={onEnter} variant="showcase" />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section — How it works (conversion funnel)                          */
/* ------------------------------------------------------------------ */

const HOW_STEPS = [
  {
    n: "01",
    title: "Seat your committee",
    body: "Pick tickers and toggle which legends run. Risk pipeline wakes before investors when enabled.",
    cta: "Takes 30 seconds",
  },
  {
    n: "02",
    title: "Watch the shift",
    body: "The wire streams every dispatch. Rooms light up as theses land. Open debate theater when crossfire starts.",
    cta: "Fully transparent",
  },
  {
    n: "03",
    title: "Sign the memo",
    body: "Risk sizes positions. The boss signs. Optional Alpaca paper fills and a Resend email digest to your inbox.",
    cta: "Paper only",
  },
] as const;

function HowItWorks({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32" style={{ background: INK, color: PAPER }}>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(165,126,34,0.12), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="text-center">
          <Reveal>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em]" style={{ color: BRASS }}>
              11 — Three steps
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-tight">
              From ticker to trade
              <br />
              in one sitting.
            </h2>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {HOW_STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 120}>
              <article
                className="relative flex h-full flex-col rounded-[5px] p-7"
                style={{
                  border: "1px solid rgba(242,239,231,0.12)",
                  background: "rgba(20,18,12,0.55)",
                }}
              >
                <span
                  className="font-display text-[3.5rem] font-semibold leading-none"
                  style={{ color: "rgba(242,239,231,0.08)" }}
                  aria-hidden
                >
                  {step.n}
                </span>
                <h3 className="mt-2 font-mono text-[15px] font-semibold tracking-[0.06em]">{step.title}</h3>
                <p className="mt-3 flex-1 font-mono text-[11.5px] leading-relaxed text-[#9b988d]">{step.body}</p>
                <p className="mt-5 font-mono text-[10px] tracking-[0.2em]" style={{ color: BRASS }}>
                  {step.cta}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={450}>
          <div className="mt-14 text-center">
            <button
              type="button"
              onClick={onEnter}
              className="inline-flex items-center gap-2 rounded-full px-10 py-4 font-mono text-[13px] font-medium tracking-wide transition-transform hover:-translate-y-0.5"
              style={{ background: PAPER, color: INK }}
            >
              Start step 01 now
              <span aria-hidden>→</span>
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section — FAQ                                                       */
/* ------------------------------------------------------------------ */

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Do I need a paid data subscription?",
    a: "No paid bundle required. The floor runs a mesh of filing vaults, price tapes, and macro bureaus out of the box. Bring your own keys for higher limits — the redundancy lane fills whatever is left.",
  },
  {
    q: "What runs the agents?",
    a: "OpenRouter. Pick a model in the console (owl-alpha by default), paste your key, and every investor thesis routes through it.",
  },
  {
    q: "Is this real money?",
    a: "Paper only. Connect Alpaca paper keys to simulate fills after the boss signs the memo. Nothing here is investment advice.",
  },
  {
    q: "How long does a shift take?",
    a: "Depends on ticker count and how many analysts you seat. A single-name run with a handful of legends is usually a few minutes; full committee on multiple tickers can run longer.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="relative py-20 lg:py-28" style={{ background: PAPER_DEEP }}>
      <div className="mx-auto max-w-[720px] px-6 lg:px-10">
        <Reveal>
          <Kicker className="text-center">Questions</Kicker>
        </Reveal>
        <Reveal delay={100}>
          <h2
            className="mt-4 text-center font-display text-[clamp(1.8rem,3vw,2.6rem)] font-semibold tracking-tight"
            style={{ color: INK }}
          >
            Before you enter
          </h2>
        </Reveal>
        <div className="mt-12 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 70}>
                <div
                  className="overflow-hidden rounded-[4px]"
                  style={{ border: `1px solid ${HAIR}`, background: "#FBF9F3" }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="font-mono text-[12.5px] font-medium tracking-[0.06em]" style={{ color: INK }}>
                      {item.q}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[14px] transition-transform duration-300"
                      style={{
                        color: BRASS,
                        transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                      }}
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                  <div
                    className="overflow-hidden transition-[max-height,opacity] duration-500 ease-out"
                    style={{
                      maxHeight: isOpen ? 160 : 0,
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <p
                      className="px-5 pb-5 font-mono text-[11.5px] leading-relaxed"
                      style={{ color: INK_SOFT }}
                    >
                      {item.a}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 10 — Final CTA + footer                                     */
/* ------------------------------------------------------------------ */

function FinalCta({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative pt-28 lg:pt-40">
      <div className="mx-auto max-w-[1320px] px-6 text-center lg:px-10">
        <Reveal>
          <Kicker>10 — After Hours</Kicker>
        </Reveal>
        <Reveal delay={140}>
          <h2
            className="mx-auto mt-6 font-display text-[clamp(2.8rem,7vw,5.8rem)] font-semibold leading-[1.02] tracking-tight"
            style={{ color: INK }}
          >
            The market closed.
            <br />
            The floor <span style={{ color: BRASS }}>didn&apos;t.</span>
          </h2>
        </Reveal>
        <Reveal delay={280}>
          <div className="mt-12 flex flex-col items-center gap-4">
            <InkPill onClick={onEnter} className="!px-12 !py-4 text-[14px]">
              Enter the Floor
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "#2fd08a", animation: "pulseDot 1.8s ease-in-out infinite" }}
                aria-hidden
              />
            </InkPill>
            <p className="font-mono text-[11px] tracking-[0.12em]" style={{ color: INK_SOFT }}>
              Free · bring your own OpenRouter key · paper trading only
            </p>
          </div>
        </Reveal>
      </div>

      {/* pixel office strip echo */}
      <Reveal delay={380}>
        <div className="mx-auto mt-20 w-full max-w-[1180px] px-6">
          <img
            src="/landing/footer-strip.png"
            alt="Pixel-art after-hours office row: desk, bookshelf, office door, water cooler, whiteboard, night window"
            className="lp-pixel mx-auto block w-full max-w-[960px] select-none"
            draggable={false}
          />
        </div>
      </Reveal>

      {/* footer */}
      <footer style={{ borderTop: `1px solid ${HAIR}` }}>
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-10">
          <p className="font-mono text-[10.5px] tracking-[0.2em]" style={{ color: INK_SOFT }}>
            THE FLOOR © 2026
          </p>
          <svg
            viewBox="0 0 24 16"
            className="h-4 w-6"
            style={{ color: INK }}
            aria-hidden
          >
            <rect x="4" y="2" width="16" height="3" fill="currentColor" />
            <rect x="6" y="6" width="12" height="2" fill="currentColor" />
            <rect x="10" y="8" width="4" height="6" fill="currentColor" />
            <rect x="7" y="13" width="10" height="2" fill="currentColor" />
          </svg>
          <nav className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em]" style={{ color: INK_SOFT }}>
            <a
              href="https://github.com/AuthByte/the-floor2"
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-60"
            >
              GitHub
            </a>
            <span aria-hidden>/</span>
            <a
              href="https://github.com/AuthByte/the-floor2#readme"
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-60"
            >
              Docs
            </a>
            <span aria-hidden>/</span>
            <span title={`Data desks: ${DATA_ANALYSTS.length} · research and paper trading only`}>
              Disclaimers
            </span>
          </nav>
        </div>
      </footer>
    </section>
  );
}
