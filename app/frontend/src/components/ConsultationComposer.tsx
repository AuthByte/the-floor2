import { useCallback, useEffect, useMemo, useState } from "react";

import { postUserConsultation } from "../lib/api";
import { PORTFOLIO_MANAGER_ID } from "../lib/agents";
import { DEBATE_ROOM_ID } from "../lib/layout";
import { listMentionableAgents, parseMention } from "../lib/mentionAgents";
import { roomIdFor } from "../lib/agents";
import { parseWatchlistInput } from "../lib/tickerInput";
import type { RoomState } from "../lib/types";

interface Props {
  runState: "idle" | "running" | "complete" | "error";
  runId: string | null;
  tickers: string;
  rooms?: Record<string, RoomState>;
}

function deriveShiftPhase(rooms: Record<string, RoomState> | undefined): string {
  if (!rooms) return "analysis";
  const debate = rooms[DEBATE_ROOM_ID];
  const pm = rooms[PORTFOLIO_MANAGER_ID];
  if (pm?.status === "WORKING" || pm?.status === "DONE") return "pm";
  if (debate?.status === "WORKING" || debate?.status === "DONE") return "debate";
  return "analysis";
}

function phaseHint(phase: string): string {
  switch (phase) {
    case "debate":
      return "Consult will affect debate at reconcile";
    case "pm":
      return "Will reconcile at memo";
    default:
      return "Consult syncs to committee signals";
  }
}

export function ConsultationComposer({ runState, runId, tickers, rooms }: Props) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [lastDiff, setLastDiff] = useState<string | null>(null);
  const [propagationToast, setPropagationToast] = useState<string | null>(null);

  const tickerList = useMemo(() => parseWatchlistInput(tickers).tickers, [tickers]);
  const agents = useMemo(() => listMentionableAgents(), []);
  const shiftPhase = useMemo(() => deriveShiftPhase(rooms), [rooms]);

  useEffect(() => {
    if (tickerList.length && !tickerList.includes(ticker)) {
      setTicker(tickerList[0]);
    }
  }, [tickerList, ticker]);

  const { agentKey: mentionKey } = parseMention(message);
  const targetReady = useMemo(() => {
    if (!mentionKey || !rooms) return true;
    const room = rooms[roomIdFor(mentionKey)];
    if (!room) return false;
    const st = (room.message || "").toLowerCase();
    return st === "done" || st.includes("revised (chair consult)");
  }, [mentionKey, rooms]);

  const visible = runState === "running" && Boolean(runId);

  const submit = useCallback(async () => {
    if (!runId || !ticker || !message.trim()) return;
    const { agentKey } = parseMention(message);
    if (!agentKey) {
      setError("Start with @AgentName — e.g. @Buffett what about China risk?");
      return;
    }
    if (!targetReady) {
      setError("That agent has not finished their thesis for this ticker yet");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postUserConsultation({
        run_id: runId,
        ticker,
        message: message.trim(),
      });
      setLastReply(res.revision?.reply_to_user ?? "Thesis revised.");
      const b = res.revision?.before;
      const a = res.revision?.after;
      if (b && a) {
        setLastDiff(
          `signal ${String(b.signal ?? "—")} → ${String(a.signal ?? "—")} · conf ${b.confidence ?? "—"}% → ${a.confidence ?? "—"}%`,
        );
      } else {
        setLastDiff(null);
      }
      if (res.propagation_queued) {
        setPropagationToast(`Material consult queued for ${ticker}`);
        window.setTimeout(() => setPropagationToast(null), 4000);
      }
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consult failed");
    } finally {
      setBusy(false);
    }
  }, [message, runId, ticker, targetReady]);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-36 z-[38] flex justify-center px-4">
      <div className="w-full max-w-xl rounded-lg border border-brass/35 bg-ink-950/95 shadow-float backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-brass">
            chair consult
          </span>
          <span className="font-mono text-[9px] text-wire-500">
            {open ? "hide" : "ask agent"} · {shiftPhase}
          </span>
        </button>

        {open ? (
          <div className="border-t border-wire-800 px-4 py-3">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-wire-500">
              {phaseHint(shiftPhase)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="rounded border border-wire-800 bg-ink-900 px-2 py-1.5 font-mono text-[10px] text-wire-200"
              >
                {tickerList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="flex flex-1 flex-wrap gap-1">
                {agents.slice(0, 6).map((a) => (
                  <button
                    key={a.agentKey}
                    type="button"
                    onClick={() =>
                      setMessage((m) => `@${a.name.split(" ")[0]} ${m.replace(/^@\S+\s*/, "")}`)
                    }
                    className="rounded border border-wire-800 px-1.5 py-0.5 font-mono text-[8px] text-wire-500 hover:border-brass/40 hover:text-brass"
                  >
                    {a.callsign}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="@Buffett How does the moat hold if rates stay higher for longer?"
              rows={2}
              className="mt-2 w-full resize-none rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[11px] text-wire-100 outline-none focus:border-brass/50"
            />
            {error ? <p className="mt-2 text-[10px] text-siren">{error}</p> : null}
            {!targetReady && mentionKey ? (
              <p className="mt-2 text-[10px] text-amber-400/90">Waiting for agent thesis…</p>
            ) : null}
            {lastReply ? (
              <p className="mt-2 text-[10px] leading-relaxed text-phos">{lastReply}</p>
            ) : null}
            {lastDiff ? (
              <p className="mt-1 font-mono text-[9px] text-brass">{lastDiff}</p>
            ) : null}
            {propagationToast ? (
              <p className="mt-1 text-[9px] text-phos">{propagationToast}</p>
            ) : null}
            <button
              type="button"
              disabled={busy || !message.trim() || !targetReady}
              onClick={() => void submit()}
              className="mt-3 rounded border border-phos/40 bg-phos/10 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-phos disabled:opacity-40"
            >
              {busy ? "consulting…" : "send consult"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
