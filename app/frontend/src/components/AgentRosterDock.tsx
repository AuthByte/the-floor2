import { useEffect, useRef, useState, type ReactNode } from "react";
import { DATA_ANALYSTS, NAMED_ANALYSTS, SPECIALIST_ANALYSTS } from "../lib/agents";
import type { RunState } from "../lib/types";

interface Props {
  enabled: Set<string>;
  enabledCount: number;
  totalToggleable: number;
  onToggle: (key: string) => void;
  onEnableAll: () => void;
  onDisableAllExceptOne: () => void;
  onSetDataTier: (on: boolean) => void;
  onSetNamedTier: (on: boolean) => void;
  onSetSpecialistTier: (on: boolean) => void;
  runState: RunState;
}

export function AgentRosterDock(p: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isRunning = p.runState === "running";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  const dataOn = DATA_ANALYSTS.every((a) => p.enabled.has(a.key));
  const namedOn = NAMED_ANALYSTS.every((a) => p.enabled.has(a.key));
  const specialistOn = SPECIALIST_ANALYSTS.every((a) => p.enabled.has(a.key));
  const dataSome = DATA_ANALYSTS.some((a) => p.enabled.has(a.key)) && !dataOn;
  const namedSome = NAMED_ANALYSTS.some((a) => p.enabled.has(a.key)) && !namedOn;
  const specialistSome = SPECIALIST_ANALYSTS.some((a) => p.enabled.has(a.key)) && !specialistOn;

  const ratio = p.totalToggleable ? p.enabledCount / p.totalToggleable : 0;

  return (
    <div ref={rootRef} className="relative z-30 shrink-0">
      {open && (
        <RosterPanel
          dataOn={dataOn}
          namedOn={namedOn}
          specialistOn={specialistOn}
          dataSome={dataSome}
          namedSome={namedSome}
          specialistSome={specialistSome}
          enabled={p.enabled}
          onToggle={p.onToggle}
          onEnableAll={p.onEnableAll}
          onDisableAllExceptOne={p.onDisableAllExceptOne}
          onSetDataTier={p.onSetDataTier}
          onSetNamedTier={p.onSetNamedTier}
          onSetSpecialistTier={p.onSetSpecialistTier}
        />
      )}

      <div className="relative flex items-center justify-between gap-4 border-t border-wire-800/80 bg-ink-950/95 px-4 py-2.5 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-wire-700/60 to-transparent" />
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={isRunning}
            className={`flex shrink-0 items-center gap-2 rounded-md border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] transition active:translate-y-px ${
              isRunning
                ? "cursor-not-allowed border-wire-900 text-wire-700"
                : open
                  ? "border-brass/60 bg-brass/10 text-brass shadow-brass-soft"
                  : "border-wire-700 text-wire-200 hover:border-brass/60 hover:text-brass"
            }`}
          >
            <RosterGlyph className={open ? "text-brass" : "text-wire-400"} />
            manage roster
          </button>

          {/* enrollment meter */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-wire-900 sm:block">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-brass/70 to-brass transition-[width] duration-500"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.2em] text-wire-500">
              <span className="font-mono text-brass">{p.enabledCount}</span>
              <span className="text-wire-600">
                {" "}
                / {p.totalToggleable} analysts armed
              </span>
              <span className="hidden text-wire-700 md:inline">
                {" "}
                · risk + boss locked in
              </span>
            </span>
          </div>
        </div>
        {isRunning ? (
          <span className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-wire-600">
            <span className="h-1.5 w-1.5 rounded-full bg-phos animate-pulse-dot" />
            roster locked · shift live
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RosterPanel({
  dataOn,
  namedOn,
  specialistOn,
  dataSome,
  namedSome,
  specialistSome,
  enabled,
  onToggle,
  onEnableAll,
  onDisableAllExceptOne,
  onSetDataTier,
  onSetNamedTier,
  onSetSpecialistTier,
}: {
  dataOn: boolean;
  namedOn: boolean;
  specialistOn: boolean;
  dataSome: boolean;
  namedSome: boolean;
  specialistSome: boolean;
  enabled: Set<string>;
  onToggle: (key: string) => void;
  onEnableAll: () => void;
  onDisableAllExceptOne: () => void;
  onSetDataTier: (on: boolean) => void;
  onSetNamedTier: (on: boolean) => void;
  onSetSpecialistTier: (on: boolean) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 max-h-[min(56vh,460px)] animate-rise-in overflow-hidden border border-b-0 border-wire-800 bg-ink-950/98 shadow-float backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-wire-800 bg-ink-900/60 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-wire-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brass" />
          shift manifest
        </span>
        <div className="flex flex-wrap gap-2">
          <MiniBtn onClick={onEnableAll}>deploy all</MiniBtn>
          <MiniBtn onClick={onDisableAllExceptOne}>skeleton crew</MiniBtn>
        </div>
      </div>

      <div className="grid max-h-[min(46vh,380px)] grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-3">
        <TierSection
          title="tier 0 — data feeds"
          accent="emerald"
          agents={DATA_ANALYSTS}
          enabled={enabled}
          tierOn={dataOn}
          tierSome={dataSome}
          onTierToggle={() => onSetDataTier(!dataOn)}
          onToggle={onToggle}
        />
        <TierSection
          title="tier 1 — named investors"
          accent="brass"
          agents={NAMED_ANALYSTS}
          enabled={enabled}
          tierOn={namedOn}
          tierSome={namedSome}
          onTierToggle={() => onSetNamedTier(!namedOn)}
          onToggle={onToggle}
        />
        <TierSection
          title="further analysis"
          accent="sky"
          agents={SPECIALIST_ANALYSTS}
          enabled={enabled}
          tierOn={specialistOn}
          tierSome={specialistSome}
          onTierToggle={() => onSetSpecialistTier(!specialistOn)}
          onToggle={onToggle}
        />
      </div>

      <div className="border-t border-wire-900 bg-ink-900/40 px-4 py-2 text-[9px] uppercase tracking-[0.2em] text-wire-600">
        portfolio manager + risk gate always deploy · need ≥1 analyst to start
      </div>
    </div>
  );
}

function TierSection({
  title,
  accent,
  agents,
  enabled,
  tierOn,
  tierSome,
  onTierToggle,
  onToggle,
}: {
  title: string;
  accent: "brass" | "emerald" | "sky";
  agents: { key: string; name: string; callsign: string }[];
  enabled: Set<string>;
  tierOn: boolean;
  tierSome: boolean;
  onTierToggle: () => void;
  onToggle: (key: string) => void;
}) {
  const dotOn = accent === "brass" ? "bg-brass" : accent === "sky" ? "bg-sky-400" : "bg-phos";
  const accentHex = accent === "brass" ? "#e3b24b" : accent === "sky" ? "#5eb3f5" : "#2fd08a";
  return (
    <section className="border-b border-wire-900 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-wire-900 bg-ink-950/95 px-4 py-2 backdrop-blur">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-wire-400">
          <span className={`h-1 w-4 rounded-full ${dotOn}`} />
          {title}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-wire-500 hover:text-wire-300">
          <input
            type="checkbox"
            checked={tierOn}
            ref={(el) => {
              if (el) el.indeterminate = tierSome;
            }}
            onChange={onTierToggle}
            className="h-3.5 w-3.5 rounded-[3px]"
            style={{ accentColor: accentHex }}
          />
          all
        </label>
      </div>
      <ul className="divide-y divide-wire-900/70">
        {agents.map((a) => {
          const on = enabled.has(a.key);
          return (
            <li key={a.key}>
              <label
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 transition hover:bg-wire-900/40 ${
                  on ? "text-wire-100" : "text-wire-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(a.key)}
                  className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
                  style={{ accentColor: accentHex }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide">
                  {a.name}
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] ${
                    on ? "text-wire-400" : "text-wire-700"
                  }`}
                >
                  {a.callsign}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MiniBtn({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-wire-800 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/50 hover:text-brass active:translate-y-px"
    >
      {children}
    </button>
  );
}

function RosterGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="5" cy="5" r="2.2" />
      <circle cx="11" cy="5" r="2.2" />
      <path d="M1.5 13c0-2 1.6-3.2 3.5-3.2S8.5 11 8.5 13M7.5 13c0-2 1.6-3.2 3.5-3.2s3.5 1.2 3.5 3.2" />
    </svg>
  );
}
