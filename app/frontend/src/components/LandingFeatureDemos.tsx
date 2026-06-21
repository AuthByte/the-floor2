import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AgentAnalysisView } from "./analysis/AgentAnalysisView";
import { ArtifactGallery } from "./analysis/ArtifactGallery";
import { RiskPipelinePanel } from "./RiskPipelinePanel";
import { RoomVerdictPlaque } from "./RoomVerdictPlaque";
import { collectCommitteeOpinions } from "../lib/opinions";
import { outlookPlaqueLine } from "../lib/outlookFormat";
import {
  DEMO_BUFFETT_ANALYSIS,
  DEMO_BURRY_VERDICT,
  DEMO_NVDA_DOSSIER,
  DEMO_NVDA_VERDICT,
  DEMO_RISK_FORGE_STATE,
  DEMO_RISK_HUB_STATE,
  DEMO_SCENARIO_STATE,
  DEMO_SUPPLY_CHAIN_ARTIFACT,
  DEMO_WATCHTOWER_STATE,
  DEMO_ANALYST_SIGNALS,
} from "../lib/landingDemoData";
import {
  RISK_FORGE_ID,
  RISK_RESEARCH_HUB_ID,
  RISK_WATCHTOWER_ID,
  SCENARIO_LAB_ID,
} from "../lib/layout";

type FeatureTab = "outlook" | "risk" | "research" | "dossier";

const FEATURE_TABS: Array<{ id: FeatureTab; label: string; blurb: string }> = [
  {
    id: "outlook",
    label: "Outlook",
    blurb: "Every investor thesis ships a price target, horizon, and implied upside.",
  },
  {
    id: "risk",
    label: "Risk pipeline",
    blurb: "Four rooms forge inventory, research risks, stress scenarios, and watch triggers.",
  },
  {
    id: "research",
    label: "Artifacts",
    blurb: "Interactive supply-chain graphs and matplotlib charts publish to each room.",
  },
  {
    id: "dossier",
    label: "Dossier",
    blurb: "Per-ticker facts, agent claims, and auto-detected disputes feed the boss memo.",
  },
];

const INK = "#12110E";
const INK_SOFT = "#4A463C";
const HAIR = "rgba(18,17,14,0.16)";
const BRASS = "#A57E22";
const PAPER = "#F2EFE7";

function useInView<T extends HTMLElement>(threshold = 0.15) {
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

function AppDemoChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[8px] border border-wire-800/90 bg-ink-950 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.75)]">
      <div className="flex items-center gap-2 border-b border-wire-800/80 bg-ink-900/95 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-siren/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-phos/80" />
        <span className="mx-auto font-mono text-[10px] tracking-[0.2em] text-wire-600">
          {title}
        </span>
      </div>
      <div className="relative min-h-[360px]">{children}</div>
      <div className="pointer-events-none absolute inset-0 lp-demo-scanlines opacity-[0.035]" aria-hidden />
    </div>
  );
}

function DemoOutlook() {
  const opinions = collectCommitteeOpinions("NVDA", DEMO_ANALYST_SIGNALS).slice(0, 4);

  return (
    <div className="flex flex-col gap-0 lg:flex-row">
      <div className="relative flex flex-1 flex-col items-center justify-end border-b border-wire-800/60 bg-ink-900/40 p-6 lg:border-b-0 lg:border-r">
        <div className="relative w-full max-w-[220px]">
          <img
            src="/rooms/warren_buffett.png"
            alt=""
            className="lp-pixel mx-auto aspect-square w-full rounded-[4px] border border-wire-800/80 object-cover"
            draggable={false}
          />
          <RoomVerdictPlaque verdict={DEMO_NVDA_VERDICT} compact />
        </div>
        <p className="mt-14 font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
          live verdict plaque · NVDA
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="max-h-[200px] overflow-y-auto rounded border border-wire-800/70 bg-ink-900/50 p-3">
          <AgentAnalysisView
            agentKey="warren_buffett"
            analysis={DEMO_BUFFETT_ANALYSIS}
            ticker="NVDA"
          />
        </div>
        <div className="rounded border border-wire-800/70 bg-ink-900/40 p-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-brass/80">
            committee outlook
          </p>
          <ul className="space-y-2">
            {opinions.map((op) => (
              <li
                key={op.agentKey}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-wire-800/40 pb-2 last:border-0"
              >
                <span className="font-mono text-[10px] text-wire-200">{op.agentName}</span>
                <span
                  className={`font-mono text-[10px] font-semibold ${
                    op.signal === "bullish"
                      ? "text-phos"
                      : op.signal === "bearish"
                        ? "text-siren"
                        : "text-wire-500"
                  }`}
                >
                  {op.signal.toUpperCase()}
                </span>
                {outlookPlaqueLine(op) ? (
                  <span className="w-full font-mono text-[9px] tabular-nums text-wire-500">
                    {outlookPlaqueLine(op)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DemoRisk() {
  const [stage, setStage] = useState(0);
  const stages = [
    { id: RISK_FORGE_ID, label: "Risk Forge", state: DEMO_RISK_FORGE_STATE },
    { id: RISK_RESEARCH_HUB_ID, label: "Research Hub", state: DEMO_RISK_HUB_STATE },
    { id: SCENARIO_LAB_ID, label: "Scenario Lab", state: DEMO_SCENARIO_STATE },
    { id: RISK_WATCHTOWER_ID, label: "Watchtower", state: DEMO_WATCHTOWER_STATE },
  ] as const;
  const current = stages[stage];

  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s + 1) % stages.length), 4500);
    return () => clearInterval(t);
  }, [stages.length]);

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="flex flex-wrap gap-1 border-b border-wire-800/70 bg-ink-900/60 p-2">
        {stages.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStage(i)}
            className={`rounded px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] transition-colors ${
              i === stage
                ? "bg-brass/20 text-brass"
                : "text-wire-600 hover:text-wire-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 gap-4 p-4">
        <img
          src={`/rooms/${current.id}.png`}
          alt=""
          className="lp-pixel hidden w-28 shrink-0 self-start rounded border border-wire-800/70 object-cover sm:block"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="mb-3 font-mono text-[10px] font-semibold tracking-[0.16em] text-wire-200">
            [{current.label.toUpperCase()}] · NVDA
          </p>
          <RiskPipelinePanel agentKey={current.id} state={current.state} />
        </div>
      </div>
    </div>
  );
}

function DemoResearch() {
  return (
    <div className="p-3">
      <ArtifactGallery artifacts={[DEMO_SUPPLY_CHAIN_ARTIFACT]} />
    </div>
  );
}

function DemoDossier() {
  const d = DEMO_NVDA_DOSSIER;
  return (
    <div className="p-5 font-mono text-[11px]">
      <p className="text-[9px] uppercase tracking-[0.28em] text-brass/80">ticker dossier · NVDA</p>
      <p className="mt-2 text-[10px] text-wire-500">
        {d.facts.length} facts · {d.claims.length} claims · {d.disputes.length} dispute
      </p>
      {d.disputes.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-siren">
          {d.disputes.map((item) => (
            <li key={item.id} className="text-[10.5px]">
              flag {item.summary}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-4 space-y-2 text-wire-300">
        {d.claims.map((c) => (
          <li key={c.id} className="rounded border border-wire-800/60 bg-ink-900/50 px-2.5 py-2">
            <span className="text-wire-100">{c.agent.replace(/_/g, " ")}</span>
            <span
              className={`ml-2 text-[10px] font-semibold ${
                c.signal === "bullish"
                  ? "text-phos"
                  : c.signal === "bearish"
                    ? "text-siren"
                    : "text-wire-500"
              }`}
            >
              {c.signal.toUpperCase()} {c.confidence}%
            </span>
            <p className="mt-1 text-[10px] leading-snug text-wire-400">{c.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded border border-siren/30 bg-siren/5 px-3 py-2">
        <p className="text-[9px] uppercase tracking-[0.2em] text-siren/80">unknown unknowns</p>
        <p className="mt-1 text-[10px] leading-snug text-wire-300">
          Red-team agent attacks desk consensus — verdict:{" "}
          <span className="text-siren">{DEMO_BURRY_VERDICT.summary}</span>
        </p>
      </div>
    </div>
  );
}

function renderDemo(tab: FeatureTab) {
  switch (tab) {
    case "outlook":
      return <DemoOutlook />;
    case "risk":
      return <DemoRisk />;
    case "research":
      return <DemoResearch />;
    case "dossier":
      return <DemoDossier />;
  }
}

export function LandingFeatureDemos({ onEnter }: { onEnter: () => void }) {
  const { ref, inView } = useInView<HTMLElement>();
  const [tab, setTab] = useState<FeatureTab>("outlook");
  const [auto, setAuto] = useState(true);
  const active = FEATURE_TABS.find((t) => t.id === tab)!;

  const pickTab = useCallback((id: FeatureTab) => {
    setAuto(false);
    setTab(id);
  }, []);

  useEffect(() => {
    if (!inView || !auto) return;
    const order: FeatureTab[] = ["outlook", "risk", "research", "dossier"];
    const t = setInterval(() => {
      setTab((prev) => order[(order.indexOf(prev) + 1) % order.length]);
    }, 8000);
    return () => clearInterval(t);
  }, [inView, auto]);

  return (
    <section
      id="lp-features"
      ref={ref}
      className="relative py-24 lg:py-32"
      style={{ background: PAPER }}
    >
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(280px,0.95fr)_1.5fr] lg:items-start">
          <div>
            <p
              className="font-mono text-[11px] font-medium uppercase tracking-[0.32em]"
              style={{ color: BRASS }}
            >
              New on the floor
            </p>
            <h2
              className="mt-5 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.05] tracking-tight"
              style={{ color: INK }}
            >
              Real components.
              <br />
              Not mockups.
            </h2>
            <p
              className="mt-6 font-mono text-[12px] leading-relaxed"
              style={{ color: INK_SOFT }}
            >
              Price targets, risk pipeline rooms, interactive supply graphs, and
              per-ticker dossiers — the same React modules you get after you
              enter.
            </p>
            <p className="mt-4 font-mono text-[11px] leading-relaxed" style={{ color: INK_SOFT }}>
              {active.blurb}
            </p>
            <div className="mt-8 flex flex-col gap-2">
              {FEATURE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTab(t.id)}
                  className="flex items-center gap-3 rounded-[4px] px-4 py-3 text-left transition-colors"
                  style={{
                    border: `1px solid ${tab === t.id ? BRASS : HAIR}`,
                    background: tab === t.id ? "#FBF9F3" : "transparent",
                  }}
                >
                  <span
                    className="font-mono text-[11px] font-semibold tracking-[0.14em]"
                    style={{ color: tab === t.id ? INK : INK_SOFT }}
                  >
                    {t.label}
                  </span>
                  {tab === t.id ? (
                    <span className="font-mono text-[9px] tracking-[0.16em]" style={{ color: BRASS }}>
                      live demo
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onEnter}
              className="mt-10 font-mono text-[13px] font-medium underline underline-offset-[6px] transition-opacity hover:opacity-60"
              style={{ color: INK }}
            >
              Run a shift with these features →
            </button>
          </div>

          <div>
            {auto && inView ? (
              <p className="mb-2 text-right font-mono text-[10px] tracking-[0.14em]" style={{ color: INK_SOFT }}>
                auto-cycling demos
              </p>
            ) : null}
            <AppDemoChrome title={`thefloor.local / ${active.label.toLowerCase()}`}>
              <div key={tab} className="lp-tab-enter">
                {renderDemo(tab)}
              </div>
            </AppDemoChrome>
          </div>
        </div>
      </div>
    </section>
  );
}
