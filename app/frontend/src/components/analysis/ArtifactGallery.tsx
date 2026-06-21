import { useState } from "react";

import { resolveBackendUrl } from "../../lib/api";
import type { AgentArtifact } from "../../lib/parseAgentAnalysis";
import { InteractiveArtifact, isInteractiveArtifact } from "./InteractiveArtifacts";

interface Props {
  artifacts: AgentArtifact[];
}

export function ArtifactGallery({ artifacts }: Props) {
  const [zoomed, setZoomed] = useState<AgentArtifact | null>(null);
  if (!artifacts.length) return null;

  return (
    <section className="artifact-gallery border border-wire-800 bg-ink-900/90 shadow-[inset_0_1px_0_rgb(var(--brass)/0.12)]">
      <header className="flex items-center justify-between border-b border-brass/20 bg-ink-950/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-0.5 bg-brass/80" aria-hidden />
          <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-brass/90">
            desk artifacts
          </span>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-wire-600">
          {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="grid gap-4 p-4 grid-cols-1 2xl:grid-cols-2">
        {artifacts.map((art) =>
          isInteractiveArtifact(art) ? (
            <InteractiveArtifactCard key={art.id} artifact={art} />
          ) : (
            <ChartArtifactCard key={art.id} artifact={art} onZoom={setZoomed} />
          ),
        )}
      </div>
      {zoomed ? <ArtifactLightbox artifact={zoomed} onClose={() => setZoomed(null)} /> : null}
    </section>
  );
}

interface CardProps {
  artifact: AgentArtifact;
  onZoom: (a: AgentArtifact) => void;
}

function InteractiveArtifactCard({ artifact }: { artifact: AgentArtifact }) {
  return (
    <figure className="artifact-card overflow-hidden border border-wire-800/90 bg-ink-950/70">
      <div className="p-3">
        <InteractiveArtifact artifact={artifact} />
      </div>
      <figcaption className="border-t border-wire-800/70 px-2.5 py-2">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-wire-100">
          {artifact.title}
        </div>
        {artifact.caption ? (
          <p className="mt-1 text-[10px] leading-snug text-wire-500">{artifact.caption}</p>
        ) : null}
        <span className="mt-1.5 inline-block font-mono text-[8px] uppercase tracking-[0.2em] text-brass/80">
          interactive · {artifact.kind?.replace(/_/g, " ")}
        </span>
      </figcaption>
    </figure>
  );
}

function ChartArtifactCard({ artifact, onZoom }: CardProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = resolveBackendUrl(artifact.url ?? "");
  const aspect =
    artifact.width && artifact.height
      ? `${artifact.width} / ${artifact.height}`
      : "16 / 9";

  return (
    <figure className="artifact-card group overflow-hidden border border-wire-800/90 bg-ink-950/70">
      <button
        type="button"
        onClick={() => onZoom(artifact)}
        className="artifact-chart-frame relative block w-full overflow-hidden bg-ink-950 focus:outline-none focus:ring-1 focus:ring-brass/50"
        style={{ aspectRatio: aspect }}
        aria-label={`Expand ${artifact.title}`}
      >
        {!loaded && !failed ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
            rendering chart…
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.24em] text-siren/70">
            chart unavailable
          </div>
        ) : (
          <img
            src={src}
            alt={artifact.title}
            loading="lazy"
            className={`h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </button>
      <figcaption className="border-t border-wire-800/70 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-wire-200">
            {artifact.title}
          </div>
          {artifact.id === "agent_custom_chart" ? (
            <span className="border border-phos/35 bg-phos/10 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.18em] text-phos/90">
              agent-authored
            </span>
          ) : null}
        </div>
        {artifact.caption ? (
          <p className="mt-1 text-[10px] leading-snug text-wire-500">{artifact.caption}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

function ArtifactLightbox({
  artifact,
  onClose,
}: {
  artifact: AgentArtifact;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="artifact-lightbox max-h-[90vh] max-w-[90vw] border border-brass/25 bg-ink-900 p-2 shadow-[0_0_48px_rgb(var(--phos)/0.12),0_0_0_1px_rgb(var(--wire-800)/1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-wire-800/80 px-1 pb-2">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-brass/90">
              {artifact.title}
            </div>
            {artifact.caption ? (
              <p className="mt-0.5 text-[10px] leading-snug text-wire-500">{artifact.caption}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-wire-800 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.2em] text-wire-400 transition-colors hover:border-brass/40 hover:text-brass"
          >
            close
          </button>
        </div>
        <div className="artifact-chart-frame overflow-hidden">
          {artifact.url ? (
            <img
              src={resolveBackendUrl(artifact.url)}
              alt={artifact.title}
              className="max-h-[88vh] w-auto max-w-[min(96vw,1400px)] object-contain"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
