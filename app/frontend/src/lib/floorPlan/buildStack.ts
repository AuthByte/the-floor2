import {
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  PORTFOLIO_MANAGER_ID,
  QUANT_ANALYSTS,
  RISK_MANAGER_ID,
  SPECIALIST_ANALYSTS,
} from "../agents";
import { FLOOR_LAYOUT_META } from "../floorLayoutMode";
import {
  DEBATE_H,
  DEBATE_ROOM_ID,
  DEBATE_W,
  RISK_HUB_W,
  ROOM_H,
  ROOM_W,
  RISK_FORGE_ID,
  RISK_RESEARCH_HUB_ID,
  SCENARIO_LAB_ID,
  RISK_WATCHTOWER_ID,
} from "./constants";
import {
  analystCounts,
  buildRow,
  buildSpurs,
  finalizePlan,
  PAD,
  RISK_COL_GAP,
  RISK_PIPE_GAP,
  rowStart,
  rowWidth,
  TIER_GAP,
} from "./helpers";
import type { FloorPlan } from "./types";

const ROW_GAP = DEBATE_H + 16;

export function buildStackPlan(): FloorPlan {
  const { dataCount, t1aCount, t1bCount, analysisCount, quantCount } = analystCounts();
  const mainW = rowWidth(Math.max(dataCount, t1aCount, t1bCount, analysisCount, quantCount));
  const riskColW = RISK_HUB_W;
  const riskColX = PAD + mainW + RISK_COL_GAP;

  const canvasW = PAD + mainW + RISK_COL_GAP + riskColW + PAD;

  const t0Y = PAD;
  const t1aY = t0Y + ROOM_H + TIER_GAP;
  const t1bY = t1aY + ROOM_H + ROW_GAP;
  const tAnalysisY = t1bY + ROOM_H + TIER_GAP;
  const tQuantY = tAnalysisY + ROOM_H + TIER_GAP;
  const t2Y = tQuantY + ROOM_H + TIER_GAP;
  const t3Y = t2Y + 200 + 40;
  const canvasH = t3Y + 240 + PAD;

  const riskForgeY = t0Y;
  const riskHubY = riskForgeY + ROOM_H + RISK_PIPE_GAP;
  const scenarioLabY = riskHubY + ROOM_H + RISK_PIPE_GAP;
  const riskWatchtowerY = scenarioLabY + ROOM_H + RISK_PIPE_GAP;
  const riskPipelineSpineX = riskColX + riskColW / 2;

  const t0X = rowStart(PAD, mainW, dataCount);
  const t1aX = rowStart(PAD, mainW, t1aCount);
  const t1bX = rowStart(PAD, mainW, t1bCount);
  const tAnalysisX = rowStart(PAD, mainW, analysisCount);
  const tQuantX = rowStart(PAD, mainW, quantCount);

  const debateX = PAD + (mainW - DEBATE_W) / 2;
  const debateY = t1aY + ROOM_H + (ROW_GAP - DEBATE_H) / 2;
  const t2X = PAD + (mainW - 360) / 2;
  const t3X = PAD + (mainW - 460) / 2;

  const roomPos = {
    ...buildRow(DATA_ANALYSTS.map((a) => a.key), t0Y, t0X),
    [RISK_FORGE_ID]: { x: riskColX, y: riskForgeY },
    [RISK_RESEARCH_HUB_ID]: { x: riskColX, y: riskHubY },
    [SCENARIO_LAB_ID]: { x: riskColX, y: scenarioLabY },
    [RISK_WATCHTOWER_ID]: { x: riskColX, y: riskWatchtowerY },
    ...buildRow(NAMED_ANALYSTS.slice(0, t1aCount).map((a) => a.key), t1aY, t1aX),
    ...buildRow(NAMED_ANALYSTS.slice(t1aCount).map((a) => a.key), t1bY, t1bX),
    ...buildRow(SPECIALIST_ANALYSTS.map((a) => a.key), tAnalysisY, tAnalysisX),
    ...buildRow(QUANT_ANALYSTS.map((a) => a.key), tQuantY, tQuantX),
    [DEBATE_ROOM_ID]: { x: debateX, y: debateY },
    [RISK_MANAGER_ID]: { x: t2X, y: t2Y },
    [PORTFOLIO_MANAGER_ID]: { x: t3X, y: t3Y },
  };

  const dataBusY = t0Y + ROOM_H + TIER_GAP / 2;
  const signalBusY = tQuantY + ROOM_H + TIER_GAP / 2;
  const spineX = PAD + mainW / 2;

  const signalBusLeft = Math.min(t1aX, t1bX, tAnalysisX, tQuantX) + ROOM_W / 2;
  const signalBusRight =
    Math.max(
      t1aX + rowWidth(t1aCount),
      t1bX + rowWidth(t1bCount),
      tAnalysisX + rowWidth(analysisCount),
      tQuantX + rowWidth(quantCount),
    ) - ROOM_W / 2;

  const meta = FLOOR_LAYOUT_META.stack;

  return finalizePlan({
    id: "stack",
    label: meta.label,
    shortLabel: meta.short,
    description: meta.description,
    canvasW,
    canvasH,
    roomPos,
    t1aCount,
    debate: { x: debateX, y: debateY, w: DEBATE_W, h: DEBATE_H },
    debateRouting: "vertical",
    hallways: {
      dataBusY,
      signalBusY,
      signalBusLeft,
      signalBusRight,
      spineX,
      allSpurs: buildSpurs(roomPos, signalBusY),
      riskBottomX: t2X + 360 / 2,
      riskTopY: t2Y,
      riskBottomY: t2Y + 200,
      pmTopY: t3Y,
      riskColX,
      riskPipelineSpineX,
      riskPipelineStages: [
        { top: riskForgeY, bottom: riskForgeY + ROOM_H },
        { top: riskHubY, bottom: riskHubY + ROOM_H },
        { top: scenarioLabY, bottom: scenarioLabY + ROOM_H },
        { top: riskWatchtowerY, bottom: riskWatchtowerY + ROOM_H },
      ],
      riskPipelineFeedY: t1aY + ROOM_H / 2,
      t0Y,
      t1bY,
      tAnalysisY,
      t2X,
      riskWatchtowerY,
    },
  });
}
