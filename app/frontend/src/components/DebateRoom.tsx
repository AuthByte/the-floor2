import type { RoomState } from "../lib/types";
import { DEBATE_IMG_DISP, DEBATE_W } from "../lib/layout";

interface Props {
  state: RoomState;
  roomImage: string;
}

const IMG_NATURAL = 1024;
const IMG_SCALE = DEBATE_IMG_DISP / IMG_NATURAL;
const IMG_OFFSET = (DEBATE_W - DEBATE_IMG_DISP) / 2;

function DebateDoor({ side }: { side: "north" | "south" }) {
  const isNorth = side === "north";
  return (
    <div
      className="pointer-events-none absolute z-[18]"
      style={{
        left: "50%",
        ...(isNorth
          ? { top: IMG_OFFSET + 6, transform: "translateX(-50%)" }
          : { bottom: IMG_OFFSET + 6, transform: "translateX(-50%)" }),
        width: 56,
        height: 40,
      }}
      aria-hidden
    >
      <div
        className="relative h-full w-full border-2 border-amber-700/90 bg-amber-950/80 shadow-[inset_0_0_0_1px_rgba(255,200,100,0.25)]"
        style={{ imageRendering: "pixelated" }}
      >
        <div className="absolute inset-x-1 top-1 h-[6px] bg-amber-600/50" />
        <div className="absolute bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-300/80" />
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-amber-800/60" />
      </div>
    </div>
  );
}

export function DebateRoom({ state, roomImage }: Props) {
  const active = state.status === "WORKING";

  return (
    <div className="room-pixel-art relative h-full w-full overflow-visible">
      <img
        src={roomImage}
        alt="Argument room"
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: IMG_OFFSET,
          width: IMG_NATURAL,
          height: IMG_NATURAL,
          maxWidth: "none",
          transformOrigin: "top left",
          transform: `scale(${IMG_SCALE})`,
          imageRendering: "auto",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      <DebateDoor side="north" />
      <DebateDoor side="south" />

      {active ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[19] h-[2px] overflow-hidden">
          <div
            className="absolute inset-y-0 w-1/3 animate-bar"
            style={{ background: "rgba(255,80,80,0.95)" }}
          />
        </div>
      ) : null}
    </div>
  );
}
