import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import {
  deleteMemberDesk,
  fetchMemberDesks,
  fetchPublicDesks,
  saveMemberDesk,
} from "../lib/floorSocial/apiExtended";
import type { MemberDesk } from "../lib/floorSocial/types";
import { getSupabase } from "../lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
  enabledAgents: string[];
  model: string;
  onApplyDesk: (enabledAgents: string[], model?: string) => void;
}

export function MemberDesksPanel({
  open,
  onClose,
  enabledAgents,
  model,
  onApplyDesk,
}: Props) {
  const { session } = useAuth();
  const [mine, setMine] = useState<MemberDesk[]>([]);
  const [publicDesks, setPublicDesks] = useState<MemberDesk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savePublic, setSavePublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const pub = await fetchPublicDesks(supabase);
      setPublicDesks(pub);
      if (userId) {
        const own = await fetchMemberDesks(supabase, userId);
        setMine(own);
      } else {
        setMine([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load desks");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSave() {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) {
      setError("Sign in to save desks.");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      setError("Name your desk first.");
      return;
    }
    if (!enabledAgents.length) {
      setError("Enable at least one agent before saving.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await saveMemberDesk(supabase, userId, {
        name,
        enabledAgents,
        model,
        isPublic: savePublic,
      });
      setSaveName("");
      setSavePublic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(deskId: string) {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMemberDesk(supabase, userId, deskId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function applyDesk(desk: MemberDesk) {
    onApplyDesk(desk.enabledAgents, desk.model ?? undefined);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[46] flex animate-fade-in items-stretch justify-center bg-ink-950/70 p-0 backdrop-blur-[3px] sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-lg animate-scale-in flex-col overflow-hidden border border-brass/20 bg-ink-950 shadow-float sm:my-auto sm:max-h-[88vh] sm:rounded-lg"
        role="dialog"
        aria-labelledby="member-desks-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-wire-800 px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-brass/80">
            roster presets
          </p>
          <h2
            id="member-desks-title"
            className="mt-1 font-display text-lg font-bold tracking-wide text-wire-100"
          >
            Member Desks
          </h2>
          <p className="mt-1 text-[11px] text-wire-500">
            Save and load agent rosters — share public desks with the floor
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {session?.user ? (
            <section className="rounded border border-wire-800 bg-ink-900/40 p-3">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
                Save current desk
              </h3>
              <p className="mt-1 text-[10px] text-wire-500">
                {enabledAgents.length} agents · {model || "default model"}
              </p>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Desk name"
                maxLength={80}
                className="mt-2 w-full rounded border border-wire-800 bg-ink-950 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none focus:border-brass/50"
              />
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-wire-400">
                <input
                  type="checkbox"
                  checked={savePublic}
                  onChange={(e) => setSavePublic(e.target.checked)}
                  className="accent-[rgb(var(--brass))]"
                />
                Public on floor
              </label>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy}
                className="mt-3 rounded border border-brass/50 bg-brass/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brass hover:bg-brass/20 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save desk"}
              </button>
            </section>
          ) : (
            <p className="text-[11px] text-wire-500">Sign in to save your own desks.</p>
          )}

          {error ? <p className="text-[11px] text-siren">{error}</p> : null}

          {loading ? (
            <p className="text-[11px] text-wire-500">Loading desks…</p>
          ) : (
            <>
              {mine.length > 0 ? (
                <DeskList
                  title="Your desks"
                  desks={mine}
                  onApply={applyDesk}
                  onDelete={(id) => void handleDelete(id)}
                  canDelete
                />
              ) : session?.user ? (
                <p className="text-[11px] text-wire-500">No saved desks yet.</p>
              ) : null}

              {publicDesks.length > 0 ? (
                <DeskList title="Public desks" desks={publicDesks} onApply={applyDesk} />
              ) : null}
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-wire-800 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wire-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-wire-400"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function DeskList({
  title,
  desks,
  onApply,
  onDelete,
  canDelete,
}: {
  title: string;
  desks: MemberDesk[];
  onApply: (desk: MemberDesk) => void;
  onDelete?: (id: string) => void;
  canDelete?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
        {title}
      </h3>
      <ul className="space-y-2">
        {desks.map((desk) => (
          <li
            key={desk.id}
            className="flex items-start justify-between gap-2 rounded border border-wire-800 bg-ink-900/30 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-wire-200">{desk.name}</div>
              <div className="mt-0.5 font-mono text-[9px] text-wire-500">
                {desk.enabledAgents.length} agents
                {desk.model ? ` · ${desk.model}` : ""}
                {desk.isPublic ? " · public" : ""}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => onApply(desk)}
                className="rounded border border-brass/40 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-brass hover:bg-brass/10"
              >
                Load
              </button>
              {canDelete && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(desk.id)}
                  className="rounded border border-wire-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-wire-500 hover:border-siren/40 hover:text-siren"
                >
                  Del
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
