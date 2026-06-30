import { useCallback, useEffect, useState } from "react";

import { getApiBaseUrl, authHeaders } from "../lib/api";
import type { PersonaIngestJob } from "../lib/personaAgents";

type WizardStep = "source" | "fetching" | "preview" | "confirm" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  onMinted?: (agentKey: string, packId?: string) => void | Promise<void>;
}

const DISCLAIMER =
  "Simulated persona for education. Not affiliated with or endorsed by the real individual. Not financial advice.";

export function PersonaMintWizard({ open, onClose, onMinted }: Props) {
  const [step, setStep] = useState<WizardStep>("source");
  const [sourceType, setSourceType] = useState<"x_profile" | "text_paste">("text_paste");
  const [sourceRef, setSourceRef] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<PersonaIngestJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("source");
    setSourceRef("");
    setAcceptedTerms(false);
    setJobId(null);
    setJob(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const startIngest = async () => {
    if (!acceptedTerms) {
      setError("Accept the disclaimer to continue.");
      return;
    }
    setError(null);
    setStep("fetching");
    try {
      const res = await fetch(`${getApiBaseUrl()}/personas/ingest`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          source_type: sourceType,
          source_ref: sourceRef,
          visibility: "private",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail || `Ingest failed (${res.status})`);
      }
      const data = (await res.json()) as { job_id: string };
      setJobId(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
      setStep("source");
    }
  };

  useEffect(() => {
    if (!jobId || step !== "fetching") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/personas/ingest/${jobId}`, {
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error(`Poll failed (${res.status})`);
        const data = (await res.json()) as PersonaIngestJob;
        if (cancelled) return;
        setJob(data);
        if (data.status === "complete") {
          setStep("preview");
        } else if (data.status === "failed") {
          setError(data.error || "Ingest failed");
          setStep("source");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Poll failed");
          setStep("source");
        }
      }
    };

    const id = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, step]);

  const confirmMint = async () => {
    const preview = job?.preview as { agent_key?: string } | undefined;
    if (preview?.agent_key) {
      await onMinted?.(preview.agent_key, job?.persona_pack_id ?? undefined);
    }
    setStep("done");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div
        className="w-full max-w-lg rounded-lg border border-amber-900/40 bg-[#0c0a08] p-6 text-amber-50 shadow-2xl"
        role="dialog"
        aria-labelledby="persona-mint-title"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-600">Mint persona</p>
            <h2 id="persona-mint-title" className="font-display text-xl text-amber-100">
              New Age Persona Agent
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-amber-900/50 px-2 py-1 text-xs text-amber-400 hover:bg-amber-950"
          >
            Close
          </button>
        </header>

        <p className="mb-4 text-xs leading-relaxed text-amber-200/70">{DISCLAIMER}</p>

        {step === "source" && (
          <div className="space-y-3">
            <label className="block text-xs text-amber-300">
              Source type
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as "x_profile" | "text_paste")}
                className="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-2 text-sm"
              >
                <option value="text_paste">Paste text corpus</option>
                <option value="x_profile">Public X profile URL</option>
              </select>
            </label>
            <label className="block text-xs text-amber-300">
              {sourceType === "x_profile" ? "Profile URL" : "Source text"}
              <textarea
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                rows={sourceType === "text_paste" ? 8 : 2}
                className="mt-1 w-full rounded border border-amber-900/40 bg-black/40 px-2 py-2 text-sm"
                placeholder={
                  sourceType === "x_profile"
                    ? "https://x.com/handle"
                    : "Paste tweets, threads, or essays…"
                }
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-amber-300">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5"
              />
              I understand this creates a simulated persona for education only.
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="button"
              onClick={() => void startIngest()}
              disabled={!sourceRef.trim()}
              className="w-full rounded bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50 disabled:opacity-40"
            >
              Start mint
            </button>
          </div>
        )}

        {step === "fetching" && (
          <div className="space-y-2 text-sm text-amber-200">
            <p>Digesting voice and investing style…</p>
            <p className="text-xs text-amber-500">
              {(job?.progress as { message?: string } | undefined)?.message || "Queued"}
            </p>
          </div>
        )}

        {step === "preview" && job?.preview && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-amber-100">
              {(job.preview as { display_name?: string }).display_name}
              <span className="ml-2 text-xs text-amber-500">
                {(job.preview as { callsign?: string }).callsign}
              </span>
            </p>
            <p className="text-xs text-amber-300">
              {(job.preview as { investing_style?: string }).investing_style}
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200/80">
              {((job.preview as { checklist?: string[] }).checklist || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void confirmMint()}
              className="w-full rounded bg-amber-700 px-3 py-2 text-sm text-amber-50"
            >
              Add to roster
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 text-sm text-amber-200">
            <p>Persona minted. Enable it in the roster dock to run a shift.</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded border border-amber-700 px-3 py-2 text-amber-100"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
