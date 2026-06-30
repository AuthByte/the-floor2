import { memo } from "react";

import {

  DEBATE_PHASE_COLORS,

  phaseSegmentAtLine,

  type DebatePhaseSegment,

} from "../lib/debateReplay";



interface Palette {

  hair: string;

  faint: string;

  brass: string;

  text: string;

}



interface Props {

  segments: DebatePhaseSegment[];

  activeLineIndex: number;

  liveFloorOpen?: boolean;

  onSeekLine: (lineIndex: number) => void;

  pal: Palette;

}



export const DebateChairTimeline = memo(function DebateChairTimeline({

  segments,

  activeLineIndex,

  liveFloorOpen = false,

  onSeekLine,

  pal,

}: Props) {

  if (!segments.length && !liveFloorOpen) return null;



  const activeSeg = phaseSegmentAtLine(segments, activeLineIndex);

  const totalLines = segments.reduce((max, s) => Math.max(max, s.lineEnd), 0) + 1;

  const progressPct = totalLines > 0 ? Math.min(100, ((activeLineIndex + 1) / totalLines) * 100) : 0;



  return (

    <div

      className="shrink-0 px-3 py-2 sm:px-4"

      style={{ borderBottom: `1px solid ${pal.hair}`, background: `${pal.brass}05` }}

      role="tablist"

      aria-label="Debate phase timeline"

    >

      <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[7px] tracking-[0.18em]">

        <span style={{ color: pal.faint }}>PHASE</span>

        {liveFloorOpen ? (

          <span className="flex items-center gap-1.5" style={{ color: pal.brass }}>

            <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: pal.brass }} />

            FLOOR OPEN

          </span>

        ) : activeSeg ? (

          <span style={{ color: DEBATE_PHASE_COLORS[activeSeg.kind] }}>{activeSeg.label}</span>

        ) : null}

      </div>



      <div className="relative mb-2 h-1 overflow-hidden rounded-full" style={{ background: pal.hair }}>

        <div

          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out"

          style={{ width: `${progressPct}%`, background: activeSeg ? DEBATE_PHASE_COLORS[activeSeg.kind] : pal.brass }}

        />

      </div>



      <div className="flex gap-1 overflow-x-auto pb-0.5">

        {liveFloorOpen ? (

          <PhaseChip

            kind="floor_open"

            label="Floor"

            active={liveFloorOpen}

            pal={pal}

            onClick={() => onSeekLine(activeLineIndex)}

          />

        ) : null}

        {segments.map((seg, i) => (

          <PhaseChip

            key={`${seg.kind}-${seg.lineStart}-${i}`}

            kind={seg.kind}

            label={seg.label}

            active={activeSeg === seg}

            pal={pal}

            onClick={() => onSeekLine(seg.lineStart)}

          />

        ))}

      </div>

    </div>

  );

});



function PhaseChip({

  kind,

  label,

  active,

  pal,

  onClick,

}: {

  kind: DebatePhaseSegment["kind"];

  label: string;

  active: boolean;

  pal: Palette;

  onClick: () => void;

}) {

  const color = DEBATE_PHASE_COLORS[kind];

  return (

    <button

      type="button"

      role="tab"

      aria-selected={active}

      onClick={onClick}

      className="shrink-0 rounded-[2px] px-2 py-1 font-mono text-[7px] tracking-[0.1em] transition-colors"

      style={{

        border: `1px solid ${active ? `${color}99` : pal.hair}`,

        background: active ? `${color}14` : "transparent",

        color: active ? color : pal.faint,

      }}

      title={label}

    >

      {label}

    </button>

  );

}

