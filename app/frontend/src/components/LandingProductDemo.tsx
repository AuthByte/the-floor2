import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgentAnalysisView } from "./analysis/AgentAnalysisView";
import { RoomVerdictPlaque } from "./RoomVerdictPlaque";
import { DEMO_BUFFETT_ANALYSIS, DEMO_NVDA_VERDICT } from "../lib/landingDemoData";

interface Props {
  onEnter: () => void;
  /** Compact chrome for hero embed; full size for showcase section */
  variant?: "hero" | "showcase";
}

type DemoTab = "floor" | "wire" | "thesis" | "debate" | "memo";

const TABS: Array<{ id: DemoTab; label: string }> = [
  { id: "floor", label: "Floor" },
  { id: "wire", label: "Wire" },
  { id: "thesis", label: "Thesis" },
  { id: "debate", label: "Debate" },
  { id: "memo", label: "Memo" },
];

const DEMO_ROOMS = [
  { img: "/rooms/risk_forge.png", callsign: "FORGE", name: "Risk Forge" },
  { img: "/rooms/warren_buffett.png", callsign: "OMHA", name: "Buffett" },
  { img: "/rooms/supply_chain_cartographer.png", callsign: "LINK", name: "Supply" },
  { img: "/rooms/unknown_unknowns.png", callsign: "RED", name: "Red Team" },
  { img: "/rooms/argument_room.png", callsign: "DEBATE", name: "Argument" },
  { img: "/rooms/michael_burry.png", callsign: "SHORT", name: "Burry" },
] as const;

interface WireLine {
  id: number;
  ts: string;
  callsign: string;
  ticker: string | null;
  status: string;
  level: "ok" | "warn" | "sys";
}

const WIRE_BATCH: Omit<WireLine, "id">[] = [
  { ts: "21:03:40", callsign: "FORGE", ticker: "NVDA", status: "risk inventory — 4 items catalogued", level: "ok" },
  { ts: "21:04:02", callsign: "HUB", ticker: "NVDA", status: "specialists dispatched — supply + geo desks", level: "ok" },
  { ts: "21:04:12", callsign: "SYS", ticker: null, status: "dispatching tier-1 investors on NVDA", level: "sys" },
  { ts: "21:04:28", callsign: "EPS", ticker: "NVDA", status: "10-Q digest — revenue +2.1% QoQ", level: "ok" },
  { ts: "21:04:51", callsign: "OMHA", ticker: "NVDA", status: "PT $1450 · 24mo · +22.4% upside", level: "ok" },
  { ts: "21:05:14", callsign: "SHORT", ticker: "NVDA", status: "PT $820 · 12mo · bear case filed", level: "warn" },
  { ts: "21:05:38", callsign: "DEBATE", ticker: "NVDA", status: "BUFFETT vs BURRY — round 2 open", level: "ok" },
  { ts: "21:06:02", callsign: "BOSS", ticker: null, status: "memo signed — 2 orders queued", level: "ok" },
];

const DEBATE_LINES = [
  { speaker: "OMHA", stance: "BULL", text: "CUDA lock-in is a decade moat — this is a compounder.", color: "#2fd08a" },
  { speaker: "SHORT", stance: "BEAR", text: "Multiple assumes perfection. Mean reversion is the trade.", color: "#ff7a5c" },
  { speaker: "OMHA", stance: "REBUTTAL", text: "Substitutes aren't shipping. Hyperscaler capex is contracted.", color: "#2fd08a" },
] as const;

function useInView<T extends HTMLElement>(threshold = 0.2) {
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

function DemoChrome({
  children,
  variant,
  runState,
}: {
  children: ReactNode;
  variant: "hero" | "showcase";
  runState: "idle" | "running" | "complete";
}) {
  const h = variant === "hero" ? "min-h-[320px] sm:min-h-[380px]" : "min-h-[440px] sm:min-h-[520px]";
  const status =
    runState === "running" ? "On Shift" : runState === "complete" ? "Clocked Out" : "Standby";
  const dot =
    runState === "running" ? "bg-phos animate-pulse-dot" : runState === "complete" ? "bg-brass" : "bg-wire-600";

  return (
    <div
      className={`lp-demo-frame relative overflow-hidden rounded-[8px] border border-wire-800/90 bg-ink-950 shadow-[0_48px_100px_-48px_rgba(0,0,0,0.85)] ${h}`}
    >
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-wire-800/80 bg-ink-900/95 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-siren/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-phos/80" />
        <span className="mx-auto font-mono text-[10px] tracking-[0.2em] text-wire-600">
          thefloor.local / after-hours
        </span>
      </div>

      {/* system bar */}
      <header className="relative flex items-center justify-between border-b border-wire-800/80 bg-ink-950/95 px-4 py-2.5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/40 to-transparent" />
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-brass/35 text-brass">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M4 20V11M9 20V5M14 20V9M19 20V3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-[0.38em] text-brass/70">after-hours</p>
            <p className="font-mono text-[11px] font-bold tracking-[0.22em] text-wire-100">THE FLOOR</p>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.12em] text-wire-500">
          <span className="hidden sm:inline">NVDA</span>
          <span className={`flex items-center gap-1.5 ${runState === "running" ? "text-phos" : "text-wire-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {status}
          </span>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

      {/* scanlines */}
      <div className="pointer-events-none absolute inset-0 lp-demo-scanlines opacity-[0.04]" aria-hidden />
    </div>
  );
}

function DemoFloor({ activeIdx, variant }: { activeIdx: number; variant: "hero" | "showcase" }) {
  const cols = variant === "hero" ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6";
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className={`grid flex-1 gap-2 p-3 ${cols}`}>
        {DEMO_ROOMS.map((room, i) => {
          const active = i === activeIdx;
          return (
            <div
              key={room.callsign}
              className={`relative overflow-hidden rounded-[4px] border transition-all duration-500 ${
                active
                  ? "border-phos/60 lp-room-active scale-[1.02]"
                  : "border-wire-800/60 opacity-75"
              }`}
            >
              <img
                src={room.img}
                alt=""
                className="lp-pixel aspect-square w-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent px-1.5 py-1.5">
                <p className="font-mono text-[8px] font-semibold tracking-[0.1em] text-wire-200">
                  [{room.callsign}]
                </p>
              </div>
              {active && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-phos animate-pulse-dot" />
              )}
            </div>
          );
        })}
      </div>
      <aside className="hidden w-[38%] border-l border-wire-800/80 bg-ink-950/80 p-3 lg:block">
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">room detail</p>
        <p className="mt-2 font-mono text-[12px] font-semibold text-wire-100">
          {DEMO_ROOMS[activeIdx]?.name}
        </p>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-wire-500">
          {activeIdx === 0
            ? "Cataloguing geopolitical and demand risks before investors run."
            : activeIdx === 2
              ? "Publishing interactive supply-chain graph artifact."
              : activeIdx === 3
                ? "Red-team attacking desk consensus thesis."
                : activeIdx === 4
                  ? "Crossfire in progress — confidence updating live."
                  : "Publishing thesis with price target and horizon."}
        </p>
        <div className="mt-4 h-16 rounded border border-wire-800/60 bg-ink-900/50 p-2">
          <div className="h-full w-[72%] rounded-sm bg-gradient-to-r from-phos/30 to-phos/5" />
        </div>
      </aside>
    </div>
  );
}

function DemoWire({ lines }: { lines: WireLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  const levelColor = (l: WireLine["level"]) =>
    l === "warn" ? "text-amber" : l === "sys" ? "text-wire-500" : "text-wire-300";

  return (
    <div className="flex flex-1">
      <div className="hidden flex-1 items-center justify-center border-r border-wire-800/50 bg-ink-900/30 p-6 lg:flex">
        <img
          src="/landing/floor-diorama.png"
          alt=""
          className="lp-pixel max-h-[200px] w-full max-w-md object-contain opacity-40"
          draggable={false}
        />
      </div>
      <aside className="flex min-h-[240px] flex-1 flex-col bg-ink-950/95">
        <header className="flex shrink-0 items-center justify-between border-b border-wire-800/80 px-3 py-2">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-wire-300">
            <span className="h-1.5 w-1.5 rounded-full bg-phos animate-pulse-dot" />
            live wire
          </span>
          <span className="font-mono text-[9px] text-wire-700">tail -f /floor</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 font-mono text-[10px] leading-snug sm:text-[11px]">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-[10px] uppercase tracking-[0.28em] text-wire-700">
              awaiting dispatch
            </p>
          ) : (
            <ul className="space-y-px">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="grid grid-cols-[52px_48px_1fr] gap-2 py-1.5 animate-rise-in"
                  style={{ animationDuration: "0.35s" }}
                >
                  <span className="text-wire-700">{line.ts}</span>
                  <button type="button" className="text-left font-semibold text-brass hover:underline">
                    [{line.callsign}]
                  </button>
                  <span className={levelColor(line.level)}>
                    {line.ticker ? `${line.ticker} · ` : ""}
                    {line.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </aside>
    </div>
  );
}

function DemoDebate({ step }: { step: number }) {
  const visible = DEBATE_LINES.slice(0, Math.min(step + 1, DEBATE_LINES.length));
  const conf = step >= 2 ? { bull: 74, bear: 62 } : step >= 1 ? { bull: 68, bear: 69 } : { bull: 62, bear: 58 };

  return (
    <div className="flex flex-1 flex-col p-3 sm:p-4">
      <div
        className="flex flex-1 flex-col rounded-[5px] border border-wire-800/80 bg-ink-900/60"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 0%, rgba(165,126,34,0.08), transparent 70%)",
        }}
      >
        <div className="flex items-center justify-between border-b border-wire-800/60 px-4 py-2.5">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-wire-200">
            ARGUMENT ROOM · NVDA
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-wire-600">
            <span className="h-1.5 w-1.5 rounded-full bg-phos animate-pulse-dot" />
            LIVE
          </p>
        </div>
        <div className="flex min-h-[160px] flex-1 flex-col gap-3 overflow-hidden p-4">
          {visible.map((line, i) => (
            <div key={i} className="flex gap-3 animate-rise-in" style={{ animationDuration: "0.5s" }}>
              <img
                src={line.speaker === "OMHA" ? "/landing/portrait-buffett.png" : "/landing/portrait-burry.png"}
                alt=""
                className="lp-pixel h-10 w-10 shrink-0 rounded-[3px] border border-wire-700 object-cover"
                draggable={false}
              />
              <div>
                <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-wire-200">
                  {line.speaker}{" "}
                  <span style={{ color: line.color }} className="text-[9px]">
                    {line.stance}
                  </span>
                </p>
                <p className="mt-1 max-w-md font-mono text-[10.5px] leading-relaxed text-wire-400">
                  {line.text}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-wire-800/60 px-4 py-3">
          {(
            [
              ["BUFFETT", conf.bull, "#2fd08a"],
              ["BURRY", conf.bear, "#ff7a5c"],
            ] as const
          ).map(([label, val, color]) => (
            <div key={label}>
              <div className="flex justify-between font-mono text-[9px] tracking-[0.16em] text-wire-600">
                <span>{label}</span>
                <span style={{ color }}>{val}%</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${val}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoThesis() {
  return (
    <div className="flex flex-1 flex-col gap-0 lg:flex-row">
      <div className="relative flex flex-1 items-end justify-center border-b border-wire-800/60 bg-ink-900/30 p-5 lg:border-b-0 lg:border-r">
        <div className="relative w-full max-w-[200px]">
          <img
            src="/rooms/warren_buffett.png"
            alt=""
            className="lp-pixel aspect-square w-full rounded-[4px] border border-wire-800/80 object-cover"
            draggable={false}
          />
          <RoomVerdictPlaque verdict={DEMO_NVDA_VERDICT} compact />
        </div>
      </div>
      <div className="max-h-[320px] flex-1 overflow-y-auto p-4">
        <AgentAnalysisView
          agentKey="warren_buffett"
          analysis={DEMO_BUFFETT_ANALYSIS}
          ticker="NVDA"
        />
      </div>
    </div>
  );
}

function DemoMemo({ show }: { show: boolean }) {
  return (
    <div className="relative flex flex-1 items-center justify-center p-4">
      <img
        src="/landing/floor-diorama.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-20 lp-pixel"
        draggable={false}
      />
      <article
        className={`relative z-10 w-full max-w-sm rounded-[4px] border border-wire-700/80 bg-[#F8F5EC] p-5 text-ink-950 shadow-2xl transition-all duration-700 ${
          show ? "lp-memo-land opacity-100" : "translate-y-8 opacity-0"
        }`}
        style={{ color: "#12110E" }}
      >
        <p className="font-mono text-[18px] font-bold">BOSS MEMO</p>
        <p className="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-[#4A463C]">
          PORTFOLIO MANAGER → DESK
        </p>
        <div className="my-3 h-px bg-[rgba(18,17,14,0.16)]" />
        <div className="space-y-3 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="font-bold">NVDA</span>
            <span className="font-bold text-[#0E9F6E]">BUY 24</span>
          </div>
          <div className="flex justify-between opacity-80">
            <span className="font-bold">TSLA</span>
            <span className="font-bold text-[#C8442C]">SHORT 12</span>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <p className="font-display text-[16px] italic">The Boss</p>
          <img src="/landing/wax-seal.png" alt="" className="w-14 opacity-90" draggable={false} />
        </div>
      </article>
    </div>
  );
}

function MiniConsole({ variant }: { variant: "hero" | "showcase" }) {
  if (variant === "hero") return null;
  return (
    <div
      className="grid grid-cols-2 gap-3 border-t border-wire-800/80 bg-ink-900/90 px-3 py-2.5 font-mono text-[9px] tracking-[0.08em] text-wire-500 sm:grid-cols-4"
    >
      <span>
        <span className="text-wire-700">ticker</span> NVDA
      </span>
      <span>
        <span className="text-wire-700">model</span> owl-alpha
      </span>
      <span className="hidden sm:block">
        <span className="text-wire-700">cash</span> $100,000
      </span>
      <span className="text-phos">shift running</span>
    </div>
  );
}

export function LandingProductDemo({ onEnter, variant = "showcase" }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [tab, setTab] = useState<DemoTab>("floor");
  const [auto, setAuto] = useState(true);
  const [activeRoom, setActiveRoom] = useState(0);
  const [wireLines, setWireLines] = useState<WireLine[]>([]);
  const [debateStep, setDebateStep] = useState(-1);
  const [memoShow, setMemoShow] = useState(false);
  const [runState, setRunState] = useState<"idle" | "running" | "complete">("idle");

  const pickTab = useCallback((t: DemoTab) => {
    setAuto(false);
    setTab(t);
    setActiveRoom(0);
    setWireLines([]);
    setDebateStep(-1);
    setMemoShow(false);
    setRunState("idle");
  }, []);

  // auto-cycle tabs
  useEffect(() => {
    if (!inView || !auto) return;
    const order: DemoTab[] = ["floor", "wire", "thesis", "debate", "memo"];
    const t = setInterval(() => {
      setTab((prev) => {
        const i = order.indexOf(prev);
        const next = order[(i + 1) % order.length];
        setActiveRoom(0);
        setWireLines([]);
        setDebateStep(-1);
        setMemoShow(false);
        setRunState("idle");
        return next;
      });
    }, 9000);
    return () => clearInterval(t);
  }, [inView, auto]);

  // per-tab simulations
  useEffect(() => {
    if (!inView) return;

    if (tab === "floor") {
      setRunState("running");
      const t = setInterval(() => {
        setActiveRoom((i) => (i + 1) % DEMO_ROOMS.length);
      }, 1400);
      return () => clearInterval(t);
    }

    if (tab === "wire") {
      setRunState("running");
      let i = 0;
      const push = () => {
        if (i >= WIRE_BATCH.length) {
          setRunState("complete");
          return false;
        }
        const row = WIRE_BATCH[i];
        setWireLines((prev) => [...prev, { ...row, id: i }]);
        i += 1;
        return true;
      };
      push();
      const t = setInterval(() => {
        if (!push()) clearInterval(t);
      }, 1100);
      return () => clearInterval(t);
    }

    if (tab === "thesis") {
      setRunState("complete");
      return;
    }

    if (tab === "debate") {
      setRunState("running");
      setDebateStep(-1);
      let step = -1;
      const t0 = setTimeout(() => {
        step = 0;
        setDebateStep(0);
      }, 400);
      const t1 = setInterval(() => {
        step += 1;
        if (step >= DEBATE_LINES.length - 1) {
          setDebateStep(DEBATE_LINES.length - 1);
          setRunState("complete");
          clearInterval(t1);
          return;
        }
        setDebateStep(step);
      }, 2200);
      return () => {
        clearTimeout(t0);
        clearInterval(t1);
      };
    }

    if (tab === "memo") {
      setRunState("running");
      const t = setTimeout(() => {
        setMemoShow(true);
        setRunState("complete");
      }, 600);
      return () => clearTimeout(t);
    }
  }, [tab, inView]);

  return (
    <div ref={ref} className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-wire-800/40 bg-ink-950/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTab(t.id)}
              className={`rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] transition-all duration-300 sm:px-4 sm:text-[11px] ${
                tab === t.id
                  ? "bg-ink-950 text-wire-100 shadow-md"
                  : "text-[#4A463C] hover:text-[#12110E]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {auto && (
          <p className="font-mono text-[10px] tracking-[0.14em] text-[#4A463C]">
            auto-touring
            <span className="lp-demo-blink ml-1">_</span>
          </p>
        )}
      </div>

      <DemoChrome variant={variant} runState={runState}>
        <div key={tab} className="lp-tab-enter flex min-h-0 flex-1 flex-col">
          {tab === "floor" && <DemoFloor activeIdx={activeRoom} variant={variant} />}
          {tab === "wire" && <DemoWire lines={wireLines} />}
          {tab === "thesis" && <DemoThesis />}
          {tab === "debate" && <DemoDebate step={debateStep} />}
          {tab === "memo" && <DemoMemo show={memoShow} />}
        </div>
        <MiniConsole variant={variant} />
      </DemoChrome>

      {variant === "showcase" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md font-mono text-[11px] leading-relaxed text-[#4A463C]">
            This is the real interface — pixel floor, live wire, debate theater,
            and signed boss memos. No mockups pasted on stock photos.
          </p>
          <button
            type="button"
            onClick={onEnter}
            className="shrink-0 rounded-full bg-[#12110E] px-6 py-3 font-mono text-[12px] font-medium tracking-wide text-[#F2EFE7] transition-transform hover:-translate-y-0.5"
          >
            Run your first shift →
          </button>
        </div>
      )}
    </div>
  );
}

/** Sticky bottom CTA — appears after scroll */
export function LandingStickyCta({ onEnter }: { onEnter: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const root = document.getElementById("lp-scroll");
    if (!root) return;
    const onScroll = () => setShow(root.scrollTop > 520);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-500 ease-out ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ pointerEvents: show ? "auto" : "none" }}
    >
      <div
        className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 border-t px-5 py-3.5 backdrop-blur-md sm:px-8"
        style={{
          background: "rgba(242,239,231,0.94)",
          borderColor: "rgba(18,17,14,0.16)",
        }}
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-semibold tracking-[0.14em] text-[#12110E]">
            THE FLOOR is live
          </p>
          <p className="hidden truncate font-mono text-[10px] text-[#4A463C] sm:block">
            Free · paper trading · bring your OpenRouter key
          </p>
        </div>
        <button
          type="button"
          onClick={onEnter}
          className="shrink-0 rounded-full px-5 py-2.5 font-mono text-[12px] font-medium text-[#F2EFE7] transition-transform hover:-translate-y-0.5"
          style={{ background: "#12110E" }}
        >
          Enter now
        </button>
      </div>
    </div>
  );
}

/** Animated stat strip for social proof */
export function LandingSocialProof() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const agents = useCountUp(22, inView);
  const desks = useCountUp(12, inView);
  const feeds = useCountUp(6, inView);

  return (
    <section ref={ref} className="border-y py-10" style={{ borderColor: "rgba(18,17,14,0.16)" }}>
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 sm:grid-cols-4 lg:px-10">
        {(
          [
            { val: Math.round(agents), label: "investor agents", sub: "legendary frameworks" },
            { val: Math.round(desks), label: "data desks", sub: "merged sources" },
            { val: Math.round(feeds), label: "tier-0 feeds", sub: "before opinions" },
            { val: "100%", label: "transparent", sub: "every log line" },
          ] as const
        ).map((item, i) => (
          <div key={item.label} className={i === 3 ? "col-span-2 sm:col-span-1" : ""}>
            <p
              className="font-display text-[clamp(2rem,4vw,2.8rem)] font-semibold tabular-nums tracking-tight"
              style={{ color: "#12110E" }}
            >
              {item.val}
            </p>
            <p className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#12110E" }}>
              {item.label}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em]" style={{ color: "#4A463C" }}>
              {item.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function useCountUp(target: number, run: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, duration]);
  return value;
}
