/**
 * Patterns adapted from ui-layouts.com via ui-layouts-mcp:
 * - sparkles → PaperSparkleField (canvas, no tsparticles)
 * - spotlight-cards → SpotlightCard
 * - animated-beam → FlowBeam
 * - stacking-card → StackingStepDeck
 * - horizontal-scroll → HorizontalScrollStrip
 * - blur-vignette → BlurVignetteFrame
 */

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const BRASS = "165, 126, 34";
const INK = "18, 17, 14";

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  alpha: number;
  brass: boolean;
}

/** Sparkles-style particle field tuned for the paper hero. */
export function PaperSparkleField({
  className = "",
  density = 52,
}: {
  className?: string;
  density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      particles = Array.from({ length: density }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.4,
        vy: -(0.15 + Math.random() * 0.45),
        vx: (Math.random() - 0.5) * 0.2,
        alpha: 0.15 + Math.random() * 0.45,
        brass: Math.random() > 0.35,
      }));
    };

    const tick = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;

        const rgb = p.brass ? BRASS : INK;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${p.alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      aria-hidden
    />
  );
}

/** Spotlight-cards cursor glow on paper surfaces. */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [glow, setGlow] = useState<CSSProperties>({ opacity: 0 });

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setGlow({
      opacity: 1,
      background: `radial-gradient(320px circle at ${x}px ${y}px, rgba(${BRASS}, 0.16), transparent 68%)`,
    });
  }, []);

  const onLeave = useCallback(() => {
    setGlow((g) => ({ ...g, opacity: 0 }));
  }, []);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={glow}
        aria-hidden
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}

/** Animated-beam style connector between pipeline steps. */
export function FlowBeam({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ color: "#A57E22" }} aria-hidden>
      <svg width="28" height="8" viewBox="0 0 28 8" fill="none" className="overflow-visible">
        <line
          x1="0"
          y1="4"
          x2="22"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="lp-flow-beam-line"
        />
        <path d="M22 1 L27 4 L22 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Stacking-card style sticky step deck (CSS-only, no Lenis/motion). */
export function StackingStepDeck({
  children,
  className = "",
  stepVh = 48,
}: {
  children: ReactNode;
  className?: string;
  stepVh?: number;
}) {
  const items = Children.toArray(children);
  const count = items.length;

  return (
    <div
      className={className}
      style={{ minHeight: count > 1 ? `${count * stepVh}vh` : undefined }}
    >
      {items.map((child, i) => {
        const depth = count - 1 - i;
        return (
          <div
            key={i}
            className="sticky flex justify-center px-2 py-3"
            style={{
              top: `calc(5.25rem + ${i * 14}px)`,
              zIndex: i + 1,
            }}
          >
            <div
              className="w-full max-w-md transition-transform duration-500"
              style={{
                transform: `scale(${1 - depth * 0.038})`,
                transformOrigin: "top center",
              }}
            >
              {child}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal-scroll snap strip for roster / galleries. */
export function HorizontalScrollStrip({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    refresh();
    el.addEventListener("scroll", refresh, { passive: true });
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", refresh);
      ro.disconnect();
    };
  }, [refresh, children]);

  const nudge = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <div className={`relative ${className}`}>
      {label ? (
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#4A463C]">
          {label}
        </p>
      ) : null}
      <div
        ref={ref}
        className="lp-hscroll flex gap-3 overflow-x-auto pb-2 pt-1"
        role="region"
        aria-label={label ?? "Horizontal scroll"}
      >
        {children}
      </div>
      {canLeft ? (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="lp-hscroll-fade lp-hscroll-fade-left absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r px-2 py-6 font-mono text-[14px]"
        >
          ‹
        </button>
      ) : null}
      {canRight ? (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => nudge(1)}
          className="lp-hscroll-fade lp-hscroll-fade-right absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l px-2 py-6 font-mono text-[14px]"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}

export function HorizontalScrollCard({
  children,
  className = "",
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`lp-hscroll-card shrink-0 snap-start text-left ${className}`}
      style={style}
    >
      {children}
    </Tag>
  );
}

/** Blur-vignette edge fade on scrollable or focal panels. */
export function BlurVignetteFrame({
  children,
  className = "",
  radius = "6px",
}: {
  children: ReactNode;
  className?: string;
  radius?: string;
}) {
  return (
    <div
      className={`lp-blur-vignette relative overflow-hidden ${className}`}
      style={{ borderRadius: radius, "--lp-vignette-radius": radius } as CSSProperties}
    >
      {children}
      <div className="lp-blur-vignette-scrim pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
