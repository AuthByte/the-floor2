import { memo } from "react";
import { ROOM_H } from "../lib/layout";
import type { FloorPlan } from "../lib/floorPlan/types";

const ARROW_ID = "hway-arrow";
const ARROW_DIM_ID = "hway-arrow-dim";

interface Props {
  plan: FloorPlan;
}

export const FloorHallways = memo(function FloorHallways({ plan }: Props) {
  const {
    canvasW,
    canvasH,
    hallways: h,
    id: planId,
  } = plan;

  const {
    dataBusY,
    signalBusY,
    signalBusLeft,
    signalBusRight,
    spineX,
    allSpurs,
    riskBottomX,
    riskTopY,
    riskBottomY,
    pmTopY,
    riskColX,
    riskPipelineSpineX,
    riskPipelineStages,
    riskPipelineFeedY,
    t0Y,
    t1bY,
    tAnalysisY,
    t2X,
    riskWatchtowerY,
    wingFeedX,
    wingBridgeY,
    wingBridgeFromX,
    wingBridgeToX,
  } = h;

  const isWings = planId === "wings";

  return (
    <svg
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      width={canvasW}
      height={canvasH}
      className="pointer-events-none absolute left-0 top-0"
      aria-hidden
    >
      <defs>
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
      </defs>

      {allSpurs.map((spur, i) => {
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

      <line
        x1={signalBusLeft}
        y1={signalBusY}
        x2={signalBusRight}
        y2={signalBusY}
        stroke="rgba(34,255,102,0.75)"
        strokeWidth={2.5}
      />
      {allSpurs.map((spur, i) => (
        <circle
          key={i}
          cx={spur.cx}
          cy={signalBusY}
          r={spur.dim ? 2 : 3}
          fill={spur.dim ? "rgba(34,255,102,0.3)" : "rgba(34,255,102,0.65)"}
        />
      ))}

      {isWings && wingBridgeFromX != null && wingBridgeToX != null && wingBridgeY != null ? (
        <>
          <line
            x1={wingBridgeFromX}
            y1={signalBusY}
            x2={wingBridgeFromX}
            y2={wingBridgeY}
            stroke="rgba(34,255,102,0.55)"
            strokeWidth={2}
          />
          <line
            x1={wingBridgeFromX}
            y1={wingBridgeY}
            x2={wingBridgeToX}
            y2={wingBridgeY}
            stroke="rgba(34,255,102,0.75)"
            strokeWidth={2.5}
            markerEnd={`url(#${ARROW_ID})`}
          />
        </>
      ) : null}

      {riskPipelineStages.slice(0, -1).map((stage, i) => {
        const next = riskPipelineStages[i + 1];
        return (
          <line
            key={`risk-pipe-${i}`}
            x1={riskPipelineSpineX}
            y1={stage.bottom}
            x2={riskPipelineSpineX}
            y2={next.top}
            stroke="rgba(255,160,64,0.55)"
            strokeWidth={2}
            markerEnd={`url(#${ARROW_ID})`}
          />
        );
      })}
      <line
        x1={riskPipelineSpineX}
        y1={riskWatchtowerY + ROOM_H}
        x2={riskPipelineSpineX}
        y2={riskPipelineFeedY}
        stroke="rgba(255,160,64,0.45)"
        strokeWidth={2}
      />
      <line
        x1={riskPipelineSpineX}
        y1={riskPipelineFeedY}
        x2={isWings && wingFeedX != null ? wingFeedX : spineX}
        y2={riskPipelineFeedY}
        stroke="rgba(255,160,64,0.55)"
        strokeWidth={2}
        strokeDasharray="6 4"
        markerEnd={`url(#${ARROW_ID})`}
      />

      <line
        x1={isWings && wingBridgeToX != null ? wingBridgeToX : spineX}
        y1={signalBusY}
        x2={spineX}
        y2={riskTopY}
        stroke="rgba(34,255,102,0.85)"
        strokeWidth={2.5}
        markerEnd={`url(#${ARROW_ID})`}
      />

      <line
        x1={riskBottomX}
        y1={riskBottomY}
        x2={riskBottomX}
        y2={pmTopY}
        stroke="rgba(34,255,102,0.95)"
        strokeWidth={3.5}
        markerEnd={`url(#${ARROW_ID})`}
      />

      <CorridorLabel
        x={28}
        y={dataBusY - 10}
        text="DATA CORRIDOR"
        sub="tier 0 → tier 1"
      />
      <CorridorLabel
        x={28}
        y={signalBusY - 12}
        text="SIGNAL BUS"
        sub={isWings ? "west wing → debate" : "analysts → risk gate"}
      />
      <CorridorLabel
        x={canvasW - 28}
        y={riskBottomY + 38}
        text="DECISION PIPE"
        sub="risk → boss"
        right
      />

      <TierLabel x={signalBusLeft} y={t0Y - 18} text="TIER 0 // DATA FEEDS" />
      <TierLabel
        x={signalBusLeft}
        y={t1bY - 18}
        text={isWings ? "TIER 1 // WEST WING" : "TIER 1 // LEGEND FLOOR"}
      />
      <TierLabel x={signalBusLeft} y={tAnalysisY - 18} text="FURTHER ANALYSIS" />
      <TierLabel x={riskColX} y={t0Y - 18} text="RISK DISCOVERY // FORGE → WATCH" />
      {isWings ? (
        <TierLabel x={plan.debate.x} y={plan.debate.y - 18} text="DEBATE // EAST WING" />
      ) : null}
      <TierLabel x={t2X} y={riskTopY - 18} text="TIER 2 // RISK GATE" />
      <TierLabel x={t2X} y={pmTopY - 18} text="TIER 3 // BOSS OFFICE" />
    </svg>
  );
});

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
