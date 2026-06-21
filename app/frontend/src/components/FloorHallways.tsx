import {
  ALL_SPURS,
  CANVAS_H,
  CANVAS_W,
  DATA_BUS_Y,
  PM_TOP_Y,
  RISK_BOTTOM_X,
  RISK_BOTTOM_Y,
  RISK_COL_X,
  RISK_PIPELINE_FEED_Y,
  RISK_PIPELINE_SPINE_X,
  RISK_PIPELINE_STAGES,
  RISK_TOP_Y,
  RISK_WATCHTOWER_Y,
  ROOM_H,
  SIGNAL_BUS_LEFT,
  SIGNAL_BUS_RIGHT,
  SIGNAL_BUS_Y,
  SPINE_X,
  T0_Y,
  T1B_Y,
  T_ANALYSIS_Y,
  T2_X,
} from "../lib/layout";

// Arrowhead marker IDs
const ARROW_ID = "hway-arrow";
const ARROW_DIM_ID = "hway-arrow-dim";

export function FloorHallways() {
  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={CANVAS_W}
      height={CANVAS_H}
      className="pointer-events-none absolute left-0 top-0"
      aria-hidden
    >
      <defs>
        {/* Arrowhead for main spurs */}
        <marker
          id={ARROW_ID}
          markerWidth="6"
          markerHeight="6"
          refX="3"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(34,255,102,0.55)" />
        </marker>
        {/* Arrowhead for dim spurs */}
        <marker
          id={ARROW_DIM_ID}
          markerWidth="5"
          markerHeight="5"
          refX="2.5"
          refY="2.5"
          orient="auto"
        >
          <path d="M0,0 L0,5 L5,2.5 z" fill="rgba(34,255,102,0.22)" />
        </marker>
        {/* No SVG filters — they break GPU compositing inside CSS transforms */}
      </defs>

      {/* ── All analyst spurs to signal bus ─────────────────────────────── */}
      {ALL_SPURS.map((spur, i) => {
        const color = spur.dim
          ? "rgba(34,255,102,0.18)"
          : "rgba(34,255,102,0.38)";
        const sw = spur.dim ? 1 : 1.5;
        return (
          <line
            key={i}
            x1={spur.cx}
            y1={spur.fromY}
            x2={spur.cx}
            y2={spur.toY}
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={spur.dim ? "4 4" : undefined}
            markerEnd={`url(#${spur.dim ? ARROW_DIM_ID : ARROW_ID})`}
          />
        );
      })}

      {/* ── Signal bus horizontal line ───────────────────────────────────── */}
      <line
        x1={SIGNAL_BUS_LEFT}
        y1={SIGNAL_BUS_Y}
        x2={SIGNAL_BUS_RIGHT}
        y2={SIGNAL_BUS_Y}
        stroke="rgba(34,255,102,0.75)"
        strokeWidth={2.5}
      />
      {/* Junction dots on signal bus */}
      {ALL_SPURS.map((spur, i) => (
        <circle
          key={i}
          cx={spur.cx}
          cy={SIGNAL_BUS_Y}
          r={spur.dim ? 2 : 3}
          fill={spur.dim ? "rgba(34,255,102,0.3)" : "rgba(34,255,102,0.65)"}
        />
      ))}

      {/* ── Risk discovery pipeline (side column) ───────────────────────── */}
      {RISK_PIPELINE_STAGES.slice(0, -1).map((stage, i) => {
        const next = RISK_PIPELINE_STAGES[i + 1];
        return (
          <line
            key={`risk-pipe-${i}`}
            x1={RISK_PIPELINE_SPINE_X}
            y1={stage.bottom}
            x2={RISK_PIPELINE_SPINE_X}
            y2={next.top}
            stroke="rgba(255,160,64,0.55)"
            strokeWidth={2}
            markerEnd={`url(#${ARROW_ID})`}
          />
        );
      })}
      {/* Watchtower → legend floor (tier-1 gate) */}
      <line
        x1={RISK_PIPELINE_SPINE_X}
        y1={RISK_WATCHTOWER_Y + ROOM_H}
        x2={RISK_PIPELINE_SPINE_X}
        y2={RISK_PIPELINE_FEED_Y}
        stroke="rgba(255,160,64,0.45)"
        strokeWidth={2}
      />
      <line
        x1={RISK_PIPELINE_SPINE_X}
        y1={RISK_PIPELINE_FEED_Y}
        x2={SPINE_X}
        y2={RISK_PIPELINE_FEED_Y}
        stroke="rgba(255,160,64,0.55)"
        strokeWidth={2}
        strokeDasharray="6 4"
        markerEnd={`url(#${ARROW_ID})`}
      />

      {/* ── Spine: signal bus → Risk Manager ─────────────────────────────── */}
      <line
        x1={SPINE_X}
        y1={SIGNAL_BUS_Y}
        x2={SPINE_X}
        y2={RISK_TOP_Y}
        stroke="rgba(34,255,102,0.85)"
        strokeWidth={2.5}
        markerEnd={`url(#${ARROW_ID})`}
      />

      {/* ── Risk → PM connector ─────────────────────────────────────────── */}
      <line
        x1={RISK_BOTTOM_X}
        y1={RISK_BOTTOM_Y}
        x2={RISK_BOTTOM_X}
        y2={PM_TOP_Y}
        stroke="rgba(34,255,102,0.95)"
        strokeWidth={3.5}
        markerEnd={`url(#${ARROW_ID})`}
      />

      {/* ── Label: data corridor ─────────────────────────────────────────── */}
      <CorridorLabel
        x={28}
        y={DATA_BUS_Y - 10}
        text="DATA CORRIDOR"
        sub="tier 0 → tier 1"
      />

      {/* ── Label: signal corridor ───────────────────────────────────────── */}
      <CorridorLabel
        x={28}
        y={SIGNAL_BUS_Y - 12}
        text="SIGNAL BUS"
        sub="analysts → risk gate"
      />

      {/* ── Label: PM corridor ──────────────────────────────────────────── */}
      <CorridorLabel
        x={CANVAS_W - 28}
        y={RISK_BOTTOM_Y + 38}
        text="DECISION PIPE"
        sub="risk → boss"
        right
      />

      {/* ── Section label: Data Feeds ─────────────────────────────────────── */}
      <TierLabel x={SIGNAL_BUS_LEFT} y={T0_Y - 18} text="TIER 0 // DATA FEEDS" />
      {/* ── Section label: Analyst Floor ──────────────────────────────────── */}
      <TierLabel x={SIGNAL_BUS_LEFT} y={T1B_Y - 18} text="TIER 1 // LEGEND FLOOR" />
      <TierLabel x={SIGNAL_BUS_LEFT} y={T_ANALYSIS_Y - 18} text="FURTHER ANALYSIS" />
      <TierLabel x={RISK_COL_X} y={T0_Y - 18} text="RISK DISCOVERY // FORGE → WATCH" />
      {/* ── Section label: Risk Gate ──────────────────────────────────────── */}
      <TierLabel x={T2_X} y={RISK_TOP_Y - 18} text="TIER 2 // RISK GATE" />
      {/* ── Section label: Boss Office ────────────────────────────────────── */}
      <TierLabel x={T2_X} y={PM_TOP_Y - 18} text="TIER 3 // BOSS OFFICE" />
    </svg>
  );
}

function CorridorLabel({
  x,
  y,
  text,
  sub,
  right,
}: {
  x: number;
  y: number;
  text: string;
  sub: string;
  right?: boolean;
}) {
  const anchor = right ? "end" : "start";
  return (
    <g>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={9}
        letterSpacing={3}
        fill="rgba(34,255,102,0.45)"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight={600}
      >
        {text.toUpperCase()}
      </text>
      <text
        x={x}
        y={y + 13}
        textAnchor={anchor}
        fontSize={8}
        letterSpacing={2}
        fill="rgba(34,255,102,0.22)"
        fontFamily="'JetBrains Mono', monospace"
      >
        {sub}
      </text>
    </g>
  );
}

function TierLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="start"
      fontSize={8.5}
      letterSpacing={3.5}
      fill="rgba(34,255,102,0.28)"
      fontFamily="'JetBrains Mono', monospace"
      fontWeight={700}
    >
      {text.toUpperCase()}
    </text>
  );
}
