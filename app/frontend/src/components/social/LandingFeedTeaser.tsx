import { DEMO_FLOOR_POSTS } from "../../lib/floorSocial/demoPosts";
import { FloorPostCard } from "./FloorPostCard";

interface Props {
  onEnter?: () => void;
}

const PAPER = "#F2EFE7";
const INK = "#12110E";
const INK_SOFT = "#4A463C";
const BRASS = "#A57E22";

/** Static example runs for the marketing landing — no Supabase. */
export function LandingFeedTeaser({ onEnter }: Props) {
  return (
    <section id="lp-feed" className="relative py-24 lg:py-32" style={{ background: PAPER }}>
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p
              className="font-mono text-[11px] font-medium uppercase tracking-[0.32em]"
              style={{ color: BRASS }}
            >
              Members wire
            </p>
            <h2
              className="mt-4 font-display text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold leading-[1.08] tracking-tight"
              style={{ color: INK }}
            >
              Shared runs from the floor
            </h2>
            <p className="mt-4 font-mono text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>
              When a shift completes, desks can publish the boss memo, committee split, and
              artifacts for other cleared members. Examples below — enter to run your own.
            </p>
          </div>
          {onEnter ? (
            <button
              type="button"
              onClick={onEnter}
              className="shrink-0 rounded border px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] transition hover:opacity-90"
              style={{ borderColor: BRASS, color: BRASS, background: "rgba(165,126,34,0.08)" }}
            >
              Enter the floor
            </button>
          ) : null}
        </div>

        <ul className="grid gap-4 lg:grid-cols-3">
          {DEMO_FLOOR_POSTS.map((post) => (
            <li key={post.id} className="overflow-hidden rounded-lg border border-[rgba(18,17,14,0.14)] shadow-sm">
              <FloorPostCard post={post} mode="demo" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
