import type { FloorLayoutMode } from "../floorLayoutMode";

export interface Pos {
  x: number;
  y: number;
}

export interface RoomBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Spur {
  cx: number;
  fromY: number;
  toY: number;
  dim: boolean;
}

export interface FloorPlanHallways {
  dataBusY: number;
  signalBusY: number;
  signalBusLeft: number;
  signalBusRight: number;
  spineX: number;
  allSpurs: Spur[];
  riskBottomX: number;
  riskTopY: number;
  riskBottomY: number;
  pmTopY: number;
  riskColX: number;
  riskPipelineSpineX: number;
  riskPipelineStages: readonly { top: number; bottom: number }[];
  riskPipelineFeedY: number;
  t0Y: number;
  t1bY: number;
  tAnalysisY: number;
  t2X: number;
  riskWatchtowerY: number;
  /** Present in wings layout — horizontal bridge from west signal bus into debate. */
  wingFeedX?: number;
  wingBridgeY?: number;
  wingBridgeFromX?: number;
  wingBridgeToX?: number;
}

export interface FloorPlan {
  id: FloorLayoutMode;
  label: string;
  shortLabel: string;
  description: string;
  canvasW: number;
  canvasH: number;
  roomPos: Record<string, Pos>;
  t1aCount: number;
  debate: { x: number; y: number; w: number; h: number };
  /** vertical = north/south doors (stack); horizontal = east/west doors (wings). */
  debateRouting: "vertical" | "horizontal";
  hallways: FloorPlanHallways;
  roomBounds(roomId: string): RoomBounds | null;
}
