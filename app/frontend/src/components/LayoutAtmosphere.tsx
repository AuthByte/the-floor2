import type { LayoutSkin } from "../lib/layoutSkin";
import { Scanlines } from "./Scanlines";

interface Props {
  skin: LayoutSkin;
  shiftRunning: boolean;
}

/** Ambient layers — ops uses CRT scanlines; gallery uses a clean mesh wash. */
export function LayoutAtmosphere({ skin, shiftRunning }: Props) {
  if (skin === "gallery") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[45]" aria-hidden>
        <div className="gallery-aurora absolute inset-0" />
        <div className="gallery-mesh absolute inset-0 opacity-80" />
        {shiftRunning ? (
          <div className="gallery-shift-pulse absolute inset-x-0 top-0 h-32" />
        ) : null}
      </div>
    );
  }

  return <Scanlines lite={shiftRunning} offDuringShift />;
}
