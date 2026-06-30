import { INK_SOFT } from "./legalTokens";

type Variant = "paper" | "desk";

interface Props {
  variant?: Variant;
  className?: string;
}

const linkClass: Record<Variant, string> = {
  paper: "transition-opacity hover:opacity-60",
  desk: "text-wire-600 transition hover:text-brass/80",
};

export function LegalFooterLinks({ variant = "paper", className = "" }: Props) {
  const sep = variant === "paper" ? "/" : "·";
  const style = variant === "paper" ? { color: INK_SOFT } : undefined;

  return (
    <nav
      className={`inline-flex flex-wrap items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] ${className}`}
      style={style}
      aria-label="Legal"
    >
      <a href="/terms" className={linkClass[variant]}>
        Terms
      </a>
      <span aria-hidden>{sep}</span>
      <a href="/privacy" className={linkClass[variant]}>
        Privacy
      </a>
      {variant === "desk" ? (
        <>
          <span aria-hidden>{sep}</span>
          <a href="/pricing" className={linkClass[variant]}>
            Pricing
          </a>
          <span aria-hidden>{sep}</span>
          <span className="text-wire-700" title="Simulation only — not investment advice">
            Paper only
          </span>
        </>
      ) : null}
    </nav>
  );
}
