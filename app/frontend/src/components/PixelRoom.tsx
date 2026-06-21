import { memo } from "react";
import type { AgentDef } from "../lib/agents";
import type { RoomAsset } from "../lib/roomAssets";
import type { RoomState } from "../lib/types";
import { ROOM_H, ROOM_W } from "../lib/layout";
import { WalkGridOverlay } from "./WalkGridOverlay";
import { WalkingSprite } from "./WalkingSprite";
import { RoomThesisHint } from "./RoomThesisHint";
import { RoomVerdictPlaque } from "./RoomVerdictPlaque";

// Room source images are square (1024×1024) and now pre-processed once with
// fal-ai Bria background removal (see scripts/remove-room-bg.mjs). They have
// a real alpha channel on disk, so no per-load chroma-key is needed.
//
// We render the hex inscribed in a ROOM_H×ROOM_H box (square) so its aspect
// ratio is preserved, then horizontally center it within the wider ROOM_W
// slot. The image is drawn at its NATURAL resolution and scaled DOWN with a
// CSS transform — when the outer canvas is zoomed in, the transform-derived
// effective size grows back toward natural resolution, keeping pixels crisp
// at every zoom level.
const IMG_NATURAL = 1024;
const IMG_DISP    = ROOM_H;                       // display size (square)
const IMG_SCALE   = IMG_DISP / IMG_NATURAL;
const IMG_OFFSET  = (ROOM_W - IMG_DISP) / 2;      // horizontal centering inside room

interface Props {
  agent: AgentDef;
  state: RoomState;
  roomNumber: string;
  asset: RoomAsset;
  enabled?: boolean;
  /** Hide cubicle sprite while agent walks on the floor canvas. */
  hideSprite?: boolean;
}

function PixelRoomImpl({ agent, state, asset, enabled = true, hideSprite = false }: Props) {
  const isWorking = state.status === "WORKING";
  const spriteIdle = hideSprite || !enabled || state.status === "STANDBY";
  const showSprite = asset.spriteSheet && !hideSprite;

  return (
    <div className="room-pixel-art relative h-full w-full overflow-visible">
      {state.verdict ? <RoomVerdictPlaque verdict={state.verdict} /> : null}
      <RoomThesisHint state={state} />
      <img
        src={asset.roomImage}
        alt={agent.name}
        draggable={false}
        style={{
          position:        "absolute",
          top:             0,
          left:            IMG_OFFSET,
          width:           IMG_NATURAL,
          height:          IMG_NATURAL,
          maxWidth:        "none",     // override Tailwind's preflight max-width:100%
          transformOrigin: "top left",
          transform:       `scale(${IMG_SCALE})`,
          imageRendering:  "pixelated",
          pointerEvents:   "none",
          userSelect:      "none",
        }}
      />

      {showSprite && (
        <div
          style={{
            position: "absolute",
            top:      0,
            left:     IMG_OFFSET,
            width:    IMG_DISP,
            height:   IMG_DISP,
          }}
        >
          {asset.showWalkGridDebug && asset.walkGrid ? (
            <WalkGridOverlay grid={asset.walkGrid} roomPx={IMG_DISP} />
          ) : null}
          <WalkingSprite
            spriteUrl={asset.spriteSheet!}
            idle={spriteIdle}
            walkGrid={asset.walkGrid}
            roomPx={IMG_DISP}
          />
        </div>
      )}

      {isWorking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div
            className="absolute inset-y-0 w-1/3 animate-bar"
            style={{ background: "rgba(255,184,0,0.9)" }}
          />
        </div>
      )}
    </div>
  );
}

export const PixelRoom = memo(PixelRoomImpl);
