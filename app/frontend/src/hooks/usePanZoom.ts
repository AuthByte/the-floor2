import { useCallback, useEffect, useRef, useState } from "react";
import { roomBounds, ROOM_W, T0_Y, T_ANALYSIS_Y, ROOM_H } from "../lib/layout";

const MIN_SCALE = 0.08;
const MAX_SCALE = 2.4;
const ARROW_PAN_SPEED = 720; // px/second while key is held
/** Target analyst-room width on screen after fit (px). */
const TARGET_ROOM_SCREEN_PX = 180;

function clamp(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export interface PanZoomApi {
  x: number;
  y: number;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: (cW: number, cH: number, canvasW: number, canvasH: number) => void;
  focusOnRoom: (roomId: string, cW: number, cH: number) => boolean;
}

function snapPan(x: number, y: number): [number, number] {
  return [Math.round(x), Math.round(y)];
}

export function usePanZoom(): PanZoomApi {
  const containerRef = useRef<HTMLDivElement>(null);

  // Live refs (sync with native event handlers)
  const xRef     = useRef(0);
  const yRef     = useRef(0);
  const scaleRef = useRef(0.6);

  // State purely to trigger re-renders
  const [tick, setTick] = useState(0);
  const flush = () => setTick(t => t + 1);

  const setTransform = (x: number, y: number, scale: number, snap = false) => {
    const [nx, ny] = snap ? snapPan(x, y) : [x, y];
    xRef.current     = nx;
    yRef.current     = ny;
    scaleRef.current = scale;
    flush();
  };

  // Drag bookkeeping
  const drag = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Wheel: non-passive, scoped to container, zooms around cursor ──────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = el.getBoundingClientRect();
      const cx     = e.clientX - rect.left;
      const cy     = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const ns     = clamp(scaleRef.current * factor);
      const ratio  = ns / scaleRef.current;
      setTransform(cx - (cx - xRef.current) * ratio, cy - (cy - yRef.current) * ratio, ns);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Window-scoped drag handlers so release outside container still works ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setTransform(
        drag.current.px + (e.clientX - drag.current.mx),
        drag.current.py + (e.clientY - drag.current.my),
        scaleRef.current,
      );
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      setIsDragging(false);
      setTransform(xRef.current, yRef.current, scaleRef.current, true);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  // ── Keyboard panning with arrow keys (smooth hold-to-pan) ────────────────
  useEffect(() => {
    const pressed = {
      left: false,
      right: false,
      up: false,
      down: false,
    };
    let rafId: number | null = null;
    let lastTs = 0;

    const hasInputFocus = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!(
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      );
    };

    const stopLoop = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTs = 0;
    };

    const tickPan = (ts: number) => {
      if (lastTs === 0) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp for tab wakeups
      lastTs = ts;

      const xAxis = (pressed.left ? 1 : 0) + (pressed.right ? -1 : 0);
      const yAxis = (pressed.up ? 1 : 0) + (pressed.down ? -1 : 0);
      if (xAxis === 0 && yAxis === 0) {
        stopLoop();
        return;
      }

      setTransform(
        xRef.current + xAxis * ARROW_PAN_SPEED * dt,
        yRef.current + yAxis * ARROW_PAN_SPEED * dt,
        scaleRef.current,
      );
      rafId = requestAnimationFrame(tickPan);
    };

    const ensureLoop = () => {
      if (rafId == null) rafId = requestAnimationFrame(tickPan);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (hasInputFocus(e.target)) return;

      if (e.key === "ArrowLeft") pressed.left = true;
      else if (e.key === "ArrowRight") pressed.right = true;
      else if (e.key === "ArrowUp") pressed.up = true;
      else if (e.key === "ArrowDown") pressed.down = true;
      else return;

      e.preventDefault();
      ensureLoop();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") pressed.left = false;
      else if (e.key === "ArrowRight") pressed.right = false;
      else if (e.key === "ArrowUp") pressed.up = false;
      else if (e.key === "ArrowDown") pressed.down = false;
      else return;
      e.preventDefault();
    };

    const onBlur = () => {
      pressed.left = false;
      pressed.right = false;
      pressed.up = false;
      pressed.down = false;
      stopLoop();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopLoop();
    };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, [role='button'], input, textarea, select, [data-no-pan]")) {
      return;
    }
    drag.current = {
      mx: e.clientX,
      my: e.clientY,
      px: xRef.current,
      py: yRef.current,
    };
    setIsDragging(true);
  }, []);

  const zoomIn  = useCallback(() => setTransform(xRef.current, yRef.current, clamp(scaleRef.current * 1.2)), []);
  const zoomOut = useCallback(() => setTransform(xRef.current, yRef.current, clamp(scaleRef.current / 1.2)), []);

  const fitView = useCallback(
    (cW: number, cH: number, canvasW: number, canvasH: number) => {
      const pad = 36;
      // Zoom out enough to see the whole floor…
      const fitAll = Math.min(
        (cW - pad * 2) / canvasW,
        (cH - pad * 2) / canvasH,
      );
      // …but never smaller than readable room tiles (bigger canvas + fit-all
      // was canceling larger ROOM_W — rooms looked the same size on screen).
      const fitRooms = TARGET_ROOM_SCREEN_PX / ROOM_W;
      const s = clamp(Math.max(fitAll, fitRooms));
      const focusY = (T0_Y + T_ANALYSIS_Y + ROOM_H) / 2;
      setTransform((cW - canvasW * s) / 2, cH * 0.42 - focusY * s, s, true);
    },
    [],
  );

  const focusOnRoom = useCallback((roomId: string, cW: number, cH: number) => {
    const bounds = roomBounds(roomId);
    if (!bounds) return false;
    const pad = 56;
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const s = clamp(
      Math.min((cW - pad * 2) / bounds.w, (cH - pad * 2) / bounds.h, 1.35),
    );
    setTransform(cW / 2 - cx * s, cH / 2 - cy * s, s, true);
    return true;
  }, []);

  // tick is read only to make the linter happy that we depend on it
  void tick;

  return {
    x:     xRef.current,
    y:     yRef.current,
    scale: scaleRef.current,
    containerRef,
    onMouseDown,
    isDragging,
    zoomIn,
    zoomOut,
    fitView,
    focusOnRoom,
  };
}
