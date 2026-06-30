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
  PM_H,
  RISK_H,
  RISK_HUB_W,
  ROOM_H,
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

const WING_GAP = 48;

export function buildWingsPlan(): FloorPlan {
  const { dataCount, t1aCount, t1bCount, analysisCount, quantCount } = analystCounts();
  const westW = rowWidth(Math.max(dataCount, t1aCount, t1bCount, analysisCount, quantCount));
  const westEnd = PAD + westW;

  const debateX = westEnd + WING_GAP;
  const riskColX = debateX + DEBATE_W + RISK_COL_GAP;
  const riskColW = RISK_HUB_W;
  const canvasW = riskColX + riskColW + PAD;

  const t0Y = PAD;
  const t1aY = t0Y + ROOM_H + TIER_GAP;
  const t1bY = t1aY + ROOM_H + TIER_GAP;
  const tAnalysisY = t1bY + ROOM_H + TIER_GAP;
  const tQuantY = tAnalysisY + ROOM_H + TIER_GAP;

  const t1BlockTop = t1aY;
  const t1BlockBottom = t1bY + ROOM_H;
  const debateY = (t1BlockTop + t1BlockBottom) / 2 - DEBATE_H / 2;

  const t2Y = debateY + DEBATE_H + 40;
  const t3Y = t2Y + RISK_H + 40;

  const westBottom = tQuantY + ROOM_H;
  const pipelineBottom = t0Y + 4 * (ROOM_H + RISK_PIPE_GAP) + ROOM_H;
  const eastBottom = t3Y + PM_H;
  const canvasH = Math.max(westBottom, pipelineBottom, eastBottom) + PAD;

  const t0X = rowStart(PAD, westW, dataCount);
  const t1aX = rowStart(PAD, westW, t1aCount);
  const t1bX = rowStart(PAD, westW, t1bCount);
  const tAnalysisX = rowStart(PAD, westW, analysisCount);
  const tQuantX = rowStart(PAD, westW, quantCount);

  const riskForgeY = t0Y;
  const riskHubY = riskForgeY + ROOM_H + RISK_PIPE_GAP;
  const scenarioLabY = riskHubY + ROOM_H + RISK_PIPE_GAP;
  const riskWatchtowerY = scenarioLabY + ROOM_H + RISK_PIPE_GAP;
  const riskPipelineSpineX = riskColX + riskColW / 2;

  const t2X = debateX + (DEBATE_W - 360) / 2;
  const t3X = debateX + (DEBATE_W - 460) / 2;

  const roomPos = {
    ...buildRow(DATA_ANALYSTS.map((a) => a.key), t0Y, t0X),
    ...buildRow(NAMED_ANALYSTS.slice(0, t1aCount).map((a) => a.key), t1aY, t1aX),
    ...buildRow(NAMED_ANALYSTS.slice(t1aCount).map((a) => a.key), t1bY, t1bX),
    ...buildRow(SPECIALIST_ANALYSTS.map((a) => a.key), tAnalysisY, tAnalysisX),
    ...buildRow(QUANT_ANALYSTS.map((a) => a.key), tQuantY, tQuantX),
    [DEBATE_ROOM_ID]: { x: debateX, y: debateY },
    [RISK_FORGE_ID]: { x: riskColX, y: riskForgeY },
    [RISK_RESEARCH_HUB_ID]: { x: riskColX, y: riskHubY },
    [SCENARIO_LAB_ID]: { x: riskColX, y: scenarioLabY },
    [RISK_WATCHTOWER_ID]: { x: riskColX, y: riskWatchtowerY },
    [RISK_MANAGER_ID]: { x: t2X, y: t2Y },
    [PORTFOLIO_MANAGER_ID]: { x: t3X, y: t3Y },
  };

  const dataBusY = t0Y + ROOM_H + TIER_GAP / 2;
  const signalBusY = tQuantY + ROOM_H + TIER_GAP / 2;
  const spineX = debateX + DEBATE_W / 2;
  const westCenterX = PAD + westW / 2;

  const signalBusLeft = Math.min(t1aX, t1bX, tAnalysisX, tQuantX) + 240 / 2;
  const signalBusRight =
    Math.max(
      t1aX + rowWidth(t1aCount),
      t1bX + rowWidth(t1bCount),
      tAnalysisX + rowWidth(analysisCount),
      tQuantX + rowWidth(quantCount),
    ) - 240 / 2;

  const meta = FLOOR_LAYOUT_META.wings;

  return finalizePlan({
    id: "wings",
    label: meta.label,
    shortLabel: meta.short,
    description: meta.description,
    canvasW,
    canvasH,
    roomPos,
    t1aCount,
    debate: { x: debateX, y: debateY, w: DEBATE_W, h: DEBATE_H },
    debateRouting: "horizontal",
    hallways: {
      dataBusY,
      signalBusY,
      signalBusLeft,
      signalBusRight,
      spineX,
      allSpurs: buildSpurs(roomPos, signalBusY),
      riskBottomX: t2X + 360 / 2,
      riskTopY: t2Y,
      riskBottomY: t2Y + RISK_H,
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
      wingFeedX: westCenterX,
      wingBridgeY: debateY + DEBATE_H / 2,
      wingBridgeFromX: signalBusRight,
      wingBridgeToX: debateX,
    },
  });
}
