import { useCallback, useEffect, useRef, useState } from "react";

import {
  postSchedulerChat,
  type SchedulerChatResponse,
} from "../../lib/schedule";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  initialPrompt?: string | null;
  prefill?: string | null;
  onSchedulesUpdated?: (schedules: SchedulerChatResponse["schedules"]) => void;
}

export function SchedulerChat({ initialPrompt, prefill, onSchedulesUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setInput("");
      try {
        const res = await postSchedulerChat(trimmed, conversationId);
        setConversationId(res.conversation_id);
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
        onSchedulesUpdated?.(res.schedules);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chat failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, onSchedulesUpdated],
  );

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="font-mono text-[11px] leading-relaxed text-wire-500">
            Tell the desk scheduler what to run and when — e.g. &quot;Run NVDA and AAPL
            weekdays at 9:35am Eastern&quot; or &quot;Schedule my tech watchlist at market
            open.&quot;
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-sm border px-3 py-2 font-mono text-[11px] leading-relaxed ${
              m.role === "user"
                ? "ml-6 border-wire-800 bg-ink-900/80 text-wire-200"
                : "mr-4 border-brass/25 bg-brass/5 text-wire-300"
            }`}
          >
            <span className="mb-1 block text-[9px] uppercase tracking-[0.2em] text-wire-600">
              {m.role === "user" ? "You" : "Desk scheduler"}
            </span>
            {m.content}
          </div>
        ))}
        {busy ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass/70">
            Scheduling…
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="mt-2 font-mono text-[10px] text-siren">{error}</p>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Schedule a shift…"
          className="min-w-0 flex-1 rounded-sm border border-wire-800 bg-ink-950 px-3 py-2 font-mono text-[12px] text-wire-100 placeholder:text-wire-600 focus:border-brass/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="desk-toolbar-btn shrink-0 rounded-sm border border-brass/35 bg-brass/10 px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-brass disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
