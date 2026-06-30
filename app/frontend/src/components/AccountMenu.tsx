import { useEffect, useRef, useState } from "react";
import type { RunState } from "../lib/types";

const STATUS_COPY: Record<
  RunState,
  { label: string; tone: string; ring: string; dot: string; pulse: boolean }
> = {
  idle: {
    label: "Standby",
    tone: "text-wire-500",
    ring: "ring-wire-700/80",
    dot: "bg-wire-600",
    pulse: false,
  },
  running: {
    label: "On shift",
    tone: "text-phos",
    ring: "ring-phos/50",
    dot: "bg-phos",
    pulse: true,
  },
  complete: {
    label: "Clocked out",
    tone: "text-brass",
    ring: "ring-brass/45",
    dot: "bg-brass",
    pulse: false,
  },
  error: {
    label: "Fault",
    tone: "text-siren",
    ring: "ring-siren/45",
    dot: "bg-siren",
    pulse: true,
  },
};

function emailInitials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "??";
}

function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ");
}

interface Props {
  runState: RunState;
  userEmail?: string | null;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  planBadge?: "FREE" | "PRO" | null;
}

/** Account chip + menu — occupies the right rail of the system bar. */
export function AccountMenu({ runState, userEmail, onSignOut, onOpenSettings, planBadge }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const s = STATUS_COPY[runState];
  const signedIn = Boolean(userEmail && onSignOut);
  const label = signedIn ? displayName(userEmail!) : "Local desk";
  const sub = signedIn ? userEmail! : "No cloud account";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex items-stretch border-l border-wire-800/80"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex min-w-[148px] max-w-[220px] items-center gap-3 px-4 py-2.5 text-left transition hover:bg-ink-900/60"
      >
        <span
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-ink-800 to-ink-950 font-mono text-[11px] font-bold uppercase text-brass ring-2 ring-offset-2 ring-offset-ink-950 ${s.ring}`}
        >
          {signedIn ? emailInitials(userEmail!) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-wire-400" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="12" rx="1.5" />
              <path d="M8 20h8" strokeLinecap="round" />
            </svg>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 ${s.dot} ${s.pulse ? "animate-pulse" : ""}`}
            aria-hidden
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block truncate font-display text-[12px] font-semibold tracking-[0.06em] text-wire-100 capitalize">
              {label}
            </span>
            {planBadge ? (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${
                  planBadge === "PRO"
                    ? "border-brass/45 bg-brass/15 text-brass"
                    : "border-wire-700 bg-ink-900 text-wire-500"
                }`}
              >
                {planBadge}
              </span>
            ) : null}
          </span>
          <span className={`mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.22em] ${s.tone}`}>
            {s.label}
          </span>
        </span>

        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-wire-600 transition group-hover:text-wire-400 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-3 top-[calc(100%+6px)] z-50 min-w-[220px] overflow-hidden rounded-md border border-wire-800 bg-ink-950 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-wire-800/80 px-4 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-wire-600">
              {signedIn ? "Clearance" : "Session"}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-wire-300">{sub}</p>
            <p className={`mt-2 font-mono text-[10px] uppercase tracking-[0.24em] ${s.tone}`}>
              Floor · {s.label}
            </p>
          </div>

          {onOpenSettings ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2 border-b border-wire-800/80 px-4 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-wire-300 transition hover:bg-ink-900/80 hover:text-brass"
            >
              Account settings
            </button>
          ) : null}

          {signedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onSignOut?.();
              }}
              className="flex w-full items-center gap-2 px-4 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-wire-400 transition hover:bg-siren/10 hover:text-siren"
            >
              Sign out
            </button>
          ) : (
            <p className="px-4 py-3 font-mono text-[10px] leading-relaxed text-wire-600">
              Running on this machine. Add Supabase env vars to sync shifts across devices.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
