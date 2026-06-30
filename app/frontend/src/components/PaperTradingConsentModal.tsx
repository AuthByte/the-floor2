import { useState } from "react";

const CONSENT_COPY =
  "I understand this submits simulated orders to my Alpaca paper account. Not investment advice. Past paper performance does not guarantee future results.";

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PaperTradingConsentModal({ open, onAccept, onDecline }: Props) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onDecline}
    >
      <div
        className="relative w-full max-w-md animate-scale-in rounded-lg border border-brass/30 bg-ink-950 p-6 shadow-float"
        role="dialog"
        aria-labelledby="paper-consent-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/60 via-phos/30 to-transparent" />
        <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
          paper execution
        </p>
        <h2
          id="paper-consent-title"
          className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100"
        >
          Alpaca paper consent
        </h2>
        <p className="mt-3 text-[12px] leading-relaxed text-wire-400">
          THE FLOOR can submit boss decisions as market orders to your Alpaca{" "}
          <span className="text-phos">paper</span> account after each shift. This is
          simulation only — not live trading and not investment advice.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded border border-wire-800 bg-ink-900/40 p-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 accent-brass"
          />
          <span className="text-[11px] leading-relaxed text-wire-300">{CONSENT_COPY}</span>
        </label>

        <p className="mt-3 text-[10px] text-wire-600">
          Use paper API keys only.{" "}
          <a
            href="https://alpaca.markets/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brass/80 underline decoration-brass/30 underline-offset-2 hover:text-brass"
          >
            Alpaca paper signup
          </a>
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-wire-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-wire-500 hover:text-wire-200"
          >
            cancel
          </button>
          <button
            type="button"
            disabled={!checked}
            onClick={onAccept}
            className="rounded border border-brass/60 bg-brass/15 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            accept &amp; enable
          </button>
        </div>
      </div>
    </div>
  );
}

export const ALPACA_CONSENT_STORAGE = "floor.alpaca.consent.v1";

export function hasAlpacaPaperConsent(): boolean {
  return localStorage.getItem(ALPACA_CONSENT_STORAGE) === "1";
}

export function setAlpacaPaperConsent(): void {
  localStorage.setItem(ALPACA_CONSENT_STORAGE, "1");
}
