import type { ReactNode } from "react";

import { useFloorThemeSync } from "../../hooks/useFloorThemeSync";
import { Scanlines } from "../Scanlines";
import { LegalFooterLinks } from "./LegalFooterLinks";
import { LEGAL_LAST_UPDATED } from "./legalTokens";

interface Props {
  kicker: string;
  title: string;
  children: ReactNode;
}

export function LegalPageShell({ kicker, title, children }: Props) {
  useFloorThemeSync();

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-ink-950 text-wire-200">
      <div className="pointer-events-none fixed inset-0 z-0 floor-grid opacity-50" aria-hidden />
      <Scanlines lite />

      <header className="sticky top-0 z-20 border-b border-wire-900/80 bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
          <a
            href="/"
            className="font-mono text-[13px] font-bold tracking-[0.34em] text-wire-100 transition hover:text-brass"
          >
            THE&nbsp;FLOOR
          </a>
          <LegalFooterLinks variant="desk" />
        </div>
      </header>

      <main className="relative z-10 mx-auto min-h-0 max-w-3xl px-6 py-12 pb-20 lg:px-8 lg:py-16 lg:pb-24">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
          {kicker}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-tight tracking-tight text-wire-50">
          {title}
        </h1>
        <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-wire-500">
          Last updated {LEGAL_LAST_UPDATED}
        </p>

        <article className="mt-10 space-y-8 rounded-sm border border-wire-900/80 bg-ink-900/60 px-6 py-8 shadow-[0_20px_50px_-36px_rgb(0_0_0/0.8)] lg:px-8">
          {children}
        </article>
      </main>

      <footer className="relative z-10 border-t border-wire-900/80">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-8">
          <p className="font-mono text-[10.5px] tracking-[0.2em] text-wire-600">
            THE FLOOR © 2026
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/pricing"
              className="font-mono text-[10.5px] tracking-[0.14em] text-wire-600 transition hover:text-brass"
            >
              Pricing
            </a>
            <a
              href="/"
              className="font-mono text-[10.5px] tracking-[0.14em] text-wire-600 transition hover:text-brass"
            >
              ← Back home
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold tracking-tight text-wire-100">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-wire-400">
        {children}
      </div>
    </section>
  );
}
