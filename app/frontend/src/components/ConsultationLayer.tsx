import { useEffect, useMemo, useRef, useState } from "react";
import { useDragPosition } from "../hooks/useDragPosition";
import { roomIdFor } from "../lib/agents";
import { getRoomPos, ROOM_H, ROOM_W } from "../lib/layout";
import type { ConsultationMessage } from "../lib/types";

interface Props {
  messages: ConsultationMessage[];
}

interface Flight {
  key: string;
  msg: ConsultationMessage;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LandedPin {
  key: string;
  msg: ConsultationMessage;
  x: number;
  y: number;
}

const FLIGHT_MS = 1850;

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function roomCenter(roomId: string, fallbackKey: string) {
  const pos = getRoomPos(roomId) ?? getRoomPos(roomIdFor(fallbackKey));
  if (!pos) return null;
  return { x: pos.x + ROOM_W / 2, y: pos.y + ROOM_H / 2 };
}

/**
 * Animated mail layer. Envelopes fly between rooms, then land as clickable pins.
 * Click a pin to read the full consultation message.
 */
export function ConsultationLayer({ messages }: Props) {
  const seenRef = useRef<Set<string>>(new Set());
  const [flights, setFlights] = useState<Flight[]>([]);
  const [landed, setLanded] = useState<LandedPin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  // Reset when a fresh shift clears the message log.
  useEffect(() => {
    if (messages.length === 0) {
      seenRef.current = new Set();
      setFlights([]);
      setLanded([]);
      setSelectedId(null);
    }
  }, [messages.length]);

  useEffect(() => {
    const fresh: Flight[] = [];
    for (const msg of messages) {
      if (seenRef.current.has(msg.id)) continue;
      seenRef.current.add(msg.id);
      const a = roomCenter(msg.from, msg.fromKey);
      const b = roomCenter(msg.to, msg.toKey);
      if (!a || !b) continue;
      fresh.push({ key: msg.id, msg, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    if (fresh.length) setFlights((prev) => [...prev, ...fresh]);
  }, [messages]);

  const land = (flight: Flight) => {
    setFlights((prev) => prev.filter((f) => f.key !== flight.key));
    setLanded((prev) => {
      if (prev.some((p) => p.key === flight.key)) return prev;
      return [...prev, { key: flight.key, msg: flight.msg, x: flight.x2, y: flight.y2 }];
    });
  };

  if (flights.length === 0 && landed.length === 0 && !selected) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[28]">
      {/* trails + in-flight envelopes (non-interactive except envelope hit target) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {flights.map((f) => (
          <FlyingEnvelope key={f.key} flight={f} onLand={() => land(f)} />
        ))}
      </div>

      {/* landed pins — clickable */}
      {landed.map((pin) => (
        <LandedEnvelope
          key={pin.key}
          pin={pin}
          selected={selectedId === pin.key}
          onSelect={() => setSelectedId(pin.key)}
          onMove={(x, y) => {
            setLanded((prev) =>
              prev.map((p) => (p.key === pin.key ? { ...p, x, y } : p)),
            );
          }}
        />
      ))}

      {selected ? (
        <EnvelopeDetail
          msg={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function FlyingEnvelope({
  flight,
  onLand,
}: {
  flight: Flight;
  onLand: () => void;
}) {
  const { x1, y1, x2, y2, msg } = flight;
  const ref = useRef<HTMLDivElement | null>(null);
  const wireRef = useRef<SVGPathElement | null>(null);
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;

  const reply = msg.phase === "reply";
  const tint = reply ? "rgba(34,255,102,1)" : "rgba(255,184,77,1)";

  const { cx, cy, d, len } = useMemo(() => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const lift = Math.min(160, Math.max(60, dist * 0.22));
    let nx = -dy / dist;
    let ny = dx / dist;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const ccx = mx + nx * lift;
    const ccy = my + ny * lift;
    return {
      cx: ccx,
      cy: ccy,
      d: `M ${x1} ${y1} Q ${ccx} ${ccy} ${x2} ${y2}`,
      len: dist + lift,
    };
  }, [x1, y1, x2, y2]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.style.left = `${x2}px`;
      node.style.top = `${y2}px`;
      const t = window.setTimeout(() => onLandRef.current(), 360);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const wire = wireRef.current;
    if (wire) {
      wire.style.strokeDasharray = `${len}`;
      wire.style.strokeDashoffset = `${len}`;
    }

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / FLIGHT_MS);
      const t = ease(raw);
      const it = 1 - t;
      const px = it * it * x1 + 2 * it * t * cx + t * t * x2;
      const py = it * it * y1 + 2 * it * t * cy + t * t * y2;
      const tx = 2 * it * (cx - x1) + 2 * t * (x2 - cx);
      const ty = 2 * it * (cy - y1) + 2 * t * (y2 - cy);
      const angle = (Math.atan2(ty, tx) * 180) / Math.PI;
      const pop = raw < 0.12 ? raw / 0.12 : raw > 0.88 ? (1 - raw) / 0.12 : 1;
      node.style.left = `${px}px`;
      node.style.top = `${py}px`;
      node.style.transform = `translate(-50%,-50%) rotate(${angle * 0.18}deg) scale(${0.7 + pop * 0.5})`;
      node.style.opacity = `${Math.max(0.15, pop)}`;
      if (wire) wire.style.strokeDashoffset = `${len * (1 - raw)}`;
      if (raw < 1) raf = requestAnimationFrame(tick);
      else onLandRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [x1, y1, x2, y2, cx, cy, len]);

  return (
    <>
      {!prefersReducedMotion ? (
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width="1"
          height="1"
        >
          <path
            ref={wireRef}
            d={d}
            fill="none"
            stroke={tint}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.5}
          />
        </svg>
      ) : null}
      <span
        className="absolute block rounded-full"
        style={{
          left: x2,
          top: y2,
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
          background: tint,
          boxShadow: `0 0 10px ${tint}`,
          animation: `consult-pulse ${FLIGHT_MS}ms ease-out both`,
        }}
      />
      <div
        ref={ref}
        className="pointer-events-none absolute will-change-transform"
        style={{ left: x1, top: y1, transform: "translate(-50%,-50%)" }}
      >
        <EnvelopeGlyph msg={msg} tint={tint} />
      </div>
    </>
  );
}

function LandedEnvelope({
  pin,
  selected,
  onSelect,
  onMove,
}: {
  pin: LandedPin;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const reply = pin.msg.phase === "reply";
  const tint = reply ? "rgba(34,255,102,1)" : "rgba(255,184,77,1)";
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const didMoveRef = useRef(false);

  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.mx;
      const dy = e.clientY - dragRef.current.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMoveRef.current = true;
      onMove(dragRef.current.px + dx, dragRef.current.py + dy);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMoveEvt);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onMove]);

  return (
    <button
      type="button"
      title="Drag to move · click to read"
      onPointerDown={(e) => {
        e.stopPropagation();
        didMoveRef.current = false;
        dragRef.current = {
          mx: e.clientX,
          my: e.clientY,
          px: pin.x,
          py: pin.y,
        };
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (didMoveRef.current) {
          didMoveRef.current = false;
          return;
        }
        onSelect();
      }}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[3px] transition hover:scale-105 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-phos/70 ${
        selected ? "z-[32] scale-105" : "z-[30]"
      }`}
      style={{ left: pin.x, top: pin.y, touchAction: "none" }}
    >
      <EnvelopeGlyph msg={pin.msg} tint={tint} landed />
    </button>
  );
}

function EnvelopeGlyph({
  msg,
  tint,
  landed,
}: {
  msg: ConsultationMessage;
  tint: string;
  landed?: boolean;
}) {
  const reply = msg.phase === "reply";
  return (
    <div
      className={`flex items-center gap-1 rounded-[3px] border px-1.5 py-1 ${
        landed ? "shadow-[0_0_14px_rgba(34,255,102,0.35)]" : ""
      }`}
      style={{
        borderColor: tint,
        background: "rgba(7,10,9,0.94)",
        boxShadow: landed
          ? `0 0 10px ${tint}`
          : `0 0 12px ${tint}, 0 2px 8px rgba(0,0,0,0.6)`,
      }}
    >
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden>
        <rect
          x="0.5"
          y="0.5"
          width="13"
          height="10"
          rx="1"
          stroke={tint}
          strokeWidth="1"
          fill="rgba(0,0,0,0.4)"
        />
        <path d="M1 1.5 L7 6 L13 1.5" stroke={tint} strokeWidth="1" fill="none" />
      </svg>
      <span
        className="font-mono text-[8px] uppercase leading-none tracking-[0.14em]"
        style={{ color: tint }}
      >
        {reply ? msg.fromName.split(" ").slice(-1)[0] : "ask"}
      </span>
    </div>
  );
}

function EnvelopeDetail({
  msg,
  onClose,
}: {
  msg: ConsultationMessage;
  onClose: () => void;
}) {
  const reply = msg.phase === "reply";
  const tint = reply ? "rgb(34,255,102)" : "rgb(255,184,77)";
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const { pos, onPointerDown } = useDragPosition(
    {
      x: Math.max(24, (typeof window !== "undefined" ? window.innerWidth : 800) / 2 - 200),
      y: Math.max(48, (typeof window !== "undefined" ? window.innerHeight : 600) / 2 - 120),
    },
    "fixed",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`pointer-events-auto fixed inset-0 z-[50] ${
        isDark ? "bg-black/55 backdrop-blur-md" : "bg-wire-300/45 backdrop-blur-md"
      }`}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`animate-rise-in w-[min(360px,92vw)] rounded-md border p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl ${
          isDark
            ? "border-wire-700/90 bg-ink-950/97 text-wire-100"
            : "border-wire-400/80 bg-[#faf8f4]/97 text-ink-900"
        }`}
        style={{ position: "fixed", left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header
          className={`mb-3 flex cursor-grab items-start justify-between gap-3 active:cursor-grabbing ${
            isDark ? "border-wire-800" : "border-wire-300"
          }`}
          onPointerDown={onPointerDown}
        >
          <div>
            <p
              className={`text-[9px] uppercase tracking-[0.32em] ${
                isDark ? "text-wire-500" : "text-wire-600"
              }`}
            >
              {reply ? "mentor reply" : "thesis consult"} · drag header
            </p>
            {msg.ticker ? (
              <p
                className={`mt-1 font-mono text-sm font-semibold ${
                  isDark ? "text-wire-100" : "text-ink-900"
                }`}
              >
                {msg.ticker}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-wire-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-wire-500 transition hover:border-wire-600 hover:text-wire-200"
          >
            esc
          </button>
        </header>

        <div className="mb-3 flex items-center gap-2 font-mono text-[11px]">
          <span className={isDark ? "text-wire-300" : "text-ink-700"}>{msg.fromName}</span>
          <span style={{ color: tint }}>→</span>
          <span className={isDark ? "text-wire-300" : "text-ink-700"}>{msg.toName}</span>
        </div>

        <div
          className={`rounded-[3px] border px-3 py-2.5 ${
            isDark ? "bg-ink-900/90" : "bg-white/90"
          }`}
          style={{ borderColor: `${tint}88` }}
        >
          {reply && msg.note ? (
            <p
              className={`text-[12px] leading-relaxed ${
                isDark ? "text-wire-200" : "text-ink-800"
              }`}
            >
              {msg.note}
            </p>
          ) : (
            <p
              className={`text-[12px] leading-relaxed ${
                isDark ? "text-wire-400" : "text-ink-600"
              }`}
            >
              <span className={isDark ? "text-wire-200" : "text-ink-800"}>
                {msg.fromName}
              </span>{" "}
              asked{" "}
              <span className={isDark ? "text-wire-200" : "text-ink-800"}>
                {msg.toName}
              </span>{" "}
              to build on their{" "}
              {msg.ticker ? (
                <span
                  className={`font-semibold ${isDark ? "text-wire-100" : "text-ink-900"}`}
                >
                  {msg.ticker}
                </span>
              ) : (
                "ticker"
              )}{" "}
              thesis before the committee debate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
