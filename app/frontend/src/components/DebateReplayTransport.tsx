import { REPLAY_SPEEDS, type ReplaySpeed } from "../lib/shiftReplay";



interface Palette {

  hair: string;

  faint: string;

  mute: string;

  brass: string;

  bull: string;

  text: string;

}



export interface DebateReplayTransportProps {

  lineIndex: number;

  lineCount: number;

  progress: number;

  playing: boolean;

  speed: ReplaySpeed;

  synthesized?: boolean;

  atVerdict: boolean;

  pal: Palette;

  onTogglePlay: () => void;

  onStep: (dir: -1 | 1) => void;

  onSeekProgress: (p: number) => void;

  onSpeed: (speed: ReplaySpeed) => void;

  onJumpVerdict: () => void;

  onJumpPhase: (dir: -1 | 1) => void;

  onRewind: () => void;

}



export function DebateReplayTransport({

  lineIndex,

  lineCount,

  progress,

  playing,

  speed,

  synthesized,

  atVerdict,

  pal,

  onTogglePlay,

  onStep,

  onSeekProgress,

  onSpeed,

  onJumpVerdict,

  onJumpPhase,

  onRewind,

}: DebateReplayTransportProps) {

  const displayLine = lineCount > 0 ? lineIndex + 1 : 0;



  return (

    <div

      className="shrink-0 px-3 py-2 sm:px-4"

      style={{ borderTop: `1px solid ${pal.hair}`, background: `${pal.brass}06` }}

    >

      <div className="flex items-center gap-3">

        <button

          type="button"

          onClick={onTogglePlay}

          className="shrink-0 rounded-[2px] px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.12em]"

          style={{ border: `1px solid ${pal.brass}`, color: pal.brass, background: `${pal.brass}12` }}

        >

          {playing ? "II" : ">"}

        </button>



        <div className="min-w-0 flex-1">

          <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[8px]">

            <span className="tabular-nums" style={{ color: pal.brass }}>

              {displayLine} / {lineCount || "—"}

            </span>

            <span className="tabular-nums" style={{ color: pal.faint }}>

              {Math.round(progress * 100)}%

              {synthesized ? " · approx" : ""}

            </span>

          </div>

          <input

            type="range"

            min={0}

            max={1000}

            step={1}

            value={Math.round(progress * 1000)}

            onChange={(e) => onSeekProgress(Number(e.target.value) / 1000)}

            className="w-full"

            style={{ accentColor: pal.brass }}

            aria-label="Debate replay progress"

          />

        </div>



        <div className="flex shrink-0 items-center gap-1">

          <MiniBtn label="<" pal={pal} onClick={() => onStep(-1)} />

          <MiniBtn label=">" pal={pal} onClick={() => onStep(1)} />

        </div>

      </div>



      <div className="mt-2 flex flex-wrap items-center gap-1">

        {REPLAY_SPEEDS.filter((s) => s <= 8).map((s) => (

          <button

            key={s}

            type="button"

            onClick={() => onSpeed(s)}

            className="rounded-[2px] px-1.5 py-0.5 font-mono text-[8px] tabular-nums"

            style={{

              border: `1px solid ${speed === s ? `${pal.brass}88` : pal.hair}`,

              color: speed === s ? pal.brass : pal.mute,

            }}

          >

            {s}x

          </button>

        ))}

        <span className="mx-0.5 h-3 w-px" style={{ background: pal.hair }} aria-hidden />

        <MiniBtn label="0" title="Start" pal={pal} onClick={onRewind} />

        <button

          type="button"

          onClick={onJumpVerdict}

          className="rounded-[2px] px-1.5 py-0.5 font-mono text-[8px]"

          style={{

            border: `1px solid ${atVerdict ? `${pal.bull}88` : pal.hair}`,

            color: atVerdict ? pal.bull : pal.mute,

          }}

        >

          verdict

        </button>

        <MiniBtn label="ph-" pal={pal} onClick={() => onJumpPhase(-1)} />

        <MiniBtn label="ph+" pal={pal} onClick={() => onJumpPhase(1)} />

      </div>

    </div>

  );

}



function MiniBtn({

  label,

  title,

  pal,

  onClick,

}: {

  label: string;

  title?: string;

  pal: Palette;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      title={title}

      onClick={onClick}

      className="rounded-[2px] px-1.5 py-0.5 font-mono text-[8px]"

      style={{ border: `1px solid ${pal.hair}`, color: pal.mute }}

    >

      {label}

    </button>

  );

}

