import { useCallback, useEffect, useRef, useState } from "react";

interface Pos {
  x: number;
  y: number;
}

/**
 * Pointer-drag helper for floating panels / pins.
 * Returns absolute CSS left/top in pixels (viewport for fixed, parent for absolute).
 */
export function useDragPosition(initial: Pos, mode: "fixed" | "absolute" = "fixed") {
  const [pos, setPos] = useState<Pos>(initial);
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [data-no-drag]")) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    },
    [pos.x, pos.y],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { mx, my, px, py } = dragRef.current;
      setPos({ x: px + (e.clientX - mx), y: py + (e.clientY - my) });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return { pos, setPos, onPointerDown, mode: modeRef.current };
}
