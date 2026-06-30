import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import {
  FLOOR_TOUR_STEPS,
  markFloorTourCompleted,
  type FloorTourPlacement,
  type FloorTourStep,
} from "../lib/floorTour";

const SPOTLIGHT_PAD = 10;
const SPOTLIGHT_RX = 12;
const TOOLTIP_GAP = 14;
const TOOLTIP_W = 320;

type SpotlightRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

function isCenterStep(step: FloorTourStep): boolean {
  return !step.target || step.placement === "center";
}

function measureTarget(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return null;

  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });

  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return null;

  return {
    x: rect.left - SPOTLIGHT_PAD,
    y: rect.top - SPOTLIGHT_PAD,
    w: rect.width + SPOTLIGHT_PAD * 2,
    h: rect.height + SPOTLIGHT_PAD * 2,
  };
}

function pickPlacement(
  preferred: FloorTourPlacement | undefined,
  rect: SpotlightRect,
): FloorTourPlacement {
  if (preferred && preferred !== "center") {
    const fits = placementFits(preferred, rect);
    if (fits) return preferred;
  }

  const order: FloorTourPlacement[] = ["bottom", "top", "right", "left"];
  for (const p of order) {
    if (placementFits(p, rect)) return p;
  }
  return "bottom";
}

function placementFits(placement: FloorTourPlacement, rect: SpotlightRect): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  switch (placement) {
    case "bottom":
      return rect.y + rect.h + TOOLTIP_GAP + 180 < vh - margin;
    case "top":
      return rect.y - TOOLTIP_GAP - 180 > margin;
    case "right":
      return rect.x + rect.w + TOOLTIP_GAP + TOOLTIP_W < vw - margin;
    case "left":
      return rect.x - TOOLTIP_GAP - TOOLTIP_W > margin;
    default:
      return true;
  }
}

function tooltipStyle(
  placement: FloorTourPlacement,
  rect: SpotlightRect | null,
): CSSProperties {
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `min(${TOOLTIP_W}px, calc(100vw - 2rem))`,
    };
  }

  const maxW = `min(${TOOLTIP_W}px, calc(100vw - 2rem))`;

  switch (placement) {
    case "top":
      return {
        position: "fixed",
        left: clamp(rect.x + rect.w / 2, 16 + TOOLTIP_W / 2, window.innerWidth - 16 - TOOLTIP_W / 2),
        top: rect.y - TOOLTIP_GAP,
        transform: "translate(-50%, -100%)",
        width: maxW,
      };
    case "left":
      return {
        position: "fixed",
        left: rect.x - TOOLTIP_GAP,
        top: clamp(rect.y + rect.h / 2, 100, window.innerHeight - 100),
        transform: "translate(-100%, -50%)",
        width: maxW,
      };
    case "right":
      return {
        position: "fixed",
        left: rect.x + rect.w + TOOLTIP_GAP,
        top: clamp(rect.y + rect.h / 2, 100, window.innerHeight - 100),
        transform: "translateY(-50%)",
        width: maxW,
      };
    case "bottom":
    default:
      return {
        position: "fixed",
        left: clamp(rect.x + rect.w / 2, 16 + TOOLTIP_W / 2, window.innerWidth - 16 - TOOLTIP_W / 2),
        top: rect.y + rect.h + TOOLTIP_GAP,
        transform: "translateX(-50%)",
        width: maxW,
      };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function FloorTour({ open, onClose }: Props) {
  const maskId = useId().replace(/:/g, "");
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [placement, setPlacement] = useState<FloorTourPlacement>("center");

  const step = FLOOR_TOUR_STEPS[stepIndex];
  const total = FLOOR_TOUR_STEPS.length;
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;
  const useSpotlight = Boolean(step && !isCenterStep(step) && spotlight);

  const remeasure = useCallback(() => {
    if (!open || !step) return;
    if (isCenterStep(step)) {
      setSpotlight(null);
      setPlacement("center");
      return;
    }
    const rect = step.target ? measureTarget(step.target) : null;
    setSpotlight(rect);
    setPlacement(rect ? pickPlacement(step.placement, rect) : "center");
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    remeasure();
    const t = window.setTimeout(remeasure, 280);
    return () => window.clearTimeout(t);
  }, [open, stepIndex, remeasure]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => remeasure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, remeasure]);

  const finish = useCallback(() => {
    markFloorTourCompleted();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (isLast) finish();
        else setStepIndex((i) => Math.min(i + 1, total - 1));
        return;
      }
      if (e.key === "ArrowLeft" && !isFirst) {
        e.preventDefault();
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isFirst, isLast, total, finish]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !step) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  return createPortal(
    <div
      className="floor-tour-root fixed inset-0 z-[260]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="floor-tour-title"
      aria-describedby="floor-tour-body"
    >
      {useSpotlight && spotlight ? (
        <>
          <svg
            className="pointer-events-auto absolute inset-0 h-full w-full"
            width={vw}
            height={vh}
            aria-hidden
          >
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={spotlight.x}
                  y={spotlight.y}
                  width={spotlight.w}
                  height={spotlight.h}
                  rx={SPOTLIGHT_RX}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(4, 7, 12, 0.82)"
              mask={`url(#${maskId})`}
            />
          </svg>
          <div
            className="floor-tour-spotlight pointer-events-none absolute rounded-xl border-2 border-brass/75 shadow-[0_0_0_4px_rgba(201,162,39,0.12),0_0_32px_rgba(201,162,39,0.18)]"
            style={{
              left: spotlight.x,
              top: spotlight.y,
              width: spotlight.w,
              height: spotlight.h,
            }}
          />
        </>
      ) : (
        <div
          className="pointer-events-auto absolute inset-0 bg-ink-950/82 backdrop-blur-[2px]"
          aria-hidden
        />
      )}

      <div
        className="floor-tour-card pointer-events-auto z-[261] animate-scale-in rounded-xl border border-wire-700/90 bg-ink-950/98 shadow-float backdrop-blur-md"
        style={tooltipStyle(useSpotlight ? placement : "center", spotlight)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/50 to-transparent" />
        <header className="border-b border-wire-900/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-brass/80">
              desk tour · {stepIndex + 1}/{total}
            </span>
            <button
              type="button"
              onClick={finish}
              className="text-[10px] uppercase tracking-[0.2em] text-wire-500 transition hover:text-brass"
            >
              skip
            </button>
          </div>
          <h2
            id="floor-tour-title"
            className="mt-2 font-display text-[17px] font-bold tracking-[0.06em] text-wire-100"
          >
            {step.title}
          </h2>
        </header>
        <p id="floor-tour-body" className="px-4 py-3 text-[13px] leading-relaxed text-wire-300">
          {step.body}
        </p>
        <footer className="flex items-center justify-between gap-3 border-t border-wire-900/80 px-4 py-3">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            className="rounded border border-wire-700 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-400 transition enabled:hover:border-brass/50 enabled:hover:text-brass disabled:opacity-30"
          >
            back
          </button>
          <div className="flex gap-1">
            {FLOOR_TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-4 bg-brass" : "w-1.5 bg-wire-800"
                }`}
                aria-hidden
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
            className="rounded border border-brass/50 bg-brass/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass transition hover:bg-brass/25"
          >
            {isLast ? "done" : "next"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
