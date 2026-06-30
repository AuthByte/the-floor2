import { useCallback, useEffect, useRef, useState } from "react";
import { roomBounds, ROOM_W } from "../lib/layout";

const MIN_SCALE = 0.08;
const MAX_SCALE = 2.4;
const ARROW_PAN_SPEED = 720; // px/second while key is held
/** Target analyst-room width on screen after fit (px). */
const TARGET_ROOM_SCREEN_PX = 180;
const WHEEL_COMMIT_MS = 140;

function clamp(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export interface PanZoomApi {
  x: number;
  y: number;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: (
    cW: number,
    cH: number,
    canvasW: number,
    canvasH: number,
    focusY?: number,
  ) => void;
  focusOnRoom: (roomId: string, cW: number, cH: number) => boolean;
}

function snapPan(x: number, y: number): [number, number] {
  return [Math.round(x), Math.round(y)];
}

function transformCss(x: number, y: number, scale: number) {
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

export function usePanZoom(): PanZoomApi {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const xRef = useRef(0);
  const yRef = useRef(0);
  const scaleRef = useRef(0.6);

  // Committed transform — drives zoom label and re-sync after room updates.
  const [tick, setTick] = useState(0);
  const flush = () => setTick((t) => t + 1);

  const wheelCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paintCanvas = useCallback((x: number, y: number, scale: number) => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.transform = transformCss(x, y, scale);
  }, []);

  const setTransform = useCallback(
    (
      x: number,
      y: number,
      scale: number,
      opts: { snap?: boolean; commit?: boolean; paint?: boolean } = {},
    ) => {
      const { snap = false, commit = true, paint = true } = opts;
      const [nx, ny] = snap ? snapPan(x, y) : [x, y];
      xRef.current = nx;
      yRef.current = ny;
      scaleRef.current = scale;
      if (paint) paintCanvas(nx, ny, scale);
      if (commit) flush();
    },
    [paintCanvas],
  );

  const scheduleWheelCommit = useCallback(() => {
    if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
    wheelCommitTimer.current = setTimeout(() => {
      wheelCommitTimer.current = null;
      flush();
    }, WHEEL_COMMIT_MS);
  }, []);

  const drag = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    paintCanvas(xRef.current, yRef.current, scaleRef.current);
  }, [paintCanvas, tick]);

  useEffect(() => {
    return () => {
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const ns = clamp(scaleRef.current * factor);
      const ratio = ns / scaleRef.current;
      setTransform(
        cx - (cx - xRef.current) * ratio,
        cy - (cy - yRef.current) * ratio,
        ns,
        { commit: false },
      );
      scheduleWheelCommit();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setTransform, scheduleWheelCommit]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setTransform(
        drag.current.px + (e.clientX - drag.current.mx),
        drag.current.py + (e.clientY - drag.current.my),
        scaleRef.current,
        { commit: false },
      );
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      setIsDragging(false);
      setTransform(xRef.current, yRef.current, scaleRef.current, { snap: true, commit: true });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setTransform]);

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
      flush();
    };

    const tickPan = (ts: number) => {
      if (lastTs === 0) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
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
        { commit: false },
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
  }, [setTransform]);

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

  const zoomIn = useCallback(
    () => setTransform(xRef.current, yRef.current, clamp(scaleRef.current * 1.2)),
    [setTransform],
  );
  const zoomOut = useCallback(
    () => setTransform(xRef.current, yRef.current, clamp(scaleRef.current / 1.2)),
    [setTransform],
  );

  const fitView = useCallback(
    (cW: number, cH: number, canvasW: number, canvasH: number, focusY?: number) => {
      const pad = 36;
      const fitAll = Math.min((cW - pad * 2) / canvasW, (cH - pad * 2) / canvasH);
      const fitRooms = TARGET_ROOM_SCREEN_PX / ROOM_W;
      const s = clamp(Math.max(fitAll, fitRooms));
      const fy = focusY ?? canvasH * 0.38;
      setTransform((cW - canvasW * s) / 2, cH * 0.42 - fy * s, s, { snap: true });
    },
    [setTransform],
  );

  const focusOnRoom = useCallback(
    (roomId: string, cW: number, cH: number) => {
      const bounds = roomBounds(roomId);
      if (!bounds) return false;
      const pad = 56;
      const cx = bounds.x + bounds.w / 2;
      const cy = bounds.y + bounds.h / 2;
      const s = clamp(
        Math.min((cW - pad * 2) / bounds.w, (cH - pad * 2) / bounds.h, 1.35),
      );
      setTransform(cW / 2 - cx * s, cH / 2 - cy * s, s, { snap: true });
      return true;
    },
    [setTransform],
  );

  void tick;

  return {
    x: xRef.current,
    y: yRef.current,
    scale: scaleRef.current,
    containerRef,
    canvasRef,
    onMouseDown,
    isDragging,
    zoomIn,
    zoomOut,
    fitView,
    focusOnRoom,
  };
}
