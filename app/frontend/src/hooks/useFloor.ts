import { useCallback, useMemo, useRef, useState } from "react";
import {
  ANALYSTS,
  DATA_ANALYSTS,
  NAMED_ANALYSTS,
  SPECIALIST_ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  RISK_MANAGER,
  RISK_MANAGER_ID,
  RISK_PIPELINE_AGENTS,
  roomIdFor,
} from "../lib/agents";
import {
  applyRoomProgress,
  clearAnalysisThrottle,
} from "../lib/applyRoomProgress";
import {
  CONSULTATION_ID,
  DEBATE_ROOM_ID,
  RISK_FORGE_ID,
  RISK_RESEARCH_HUB_ID,
  RISK_WATCHTOWER_ID,
  SCENARIO_LAB_ID,
} from "../lib/layout";
import { resolveProgressRoomId } from "../lib/progressRoomId";
import { resolveTickers, runHedgeFund } from "../lib/api";
import { parseWatchlistInput } from "../lib/tickerInput";
import { OLLAMA_PROVIDER } from "../lib/models";
import type {
  CompletePayload,
  GraphEdge,
  GraphNode,
  LogLine,
  RoomState,
  RunState,
} from "../lib/types";

function makeIdleRoom(): RoomState {
  return {
    status: "STANDBY",
    ticker: null,
    message: "offline",
    analysis: null,
    updatedAt: 0,
    history: [],
    verdict: null,
  };
}

export function buildInitialRooms(): Record<string, RoomState> {
  const map: Record<string, RoomState> = {};
  for (const a of ANALYSTS) map[roomIdFor(a.key)] = makeIdleRoom();
  map[DEBATE_ROOM_ID] = {
    ...makeIdleRoom(),
    message: "chamber idle",
    debateFeed: [],
    debateRounds: [],
    activeDebateTicker: null,
  };
  map[CONSULTATION_ID] = { ...makeIdleRoom(), message: "no consults", consultations: [] };
  for (const a of RISK_PIPELINE_AGENTS) {
    map[a.key] = { ...makeIdleRoom(), message: "pipeline idle" };
  }
  map[PORTFOLIO_MANAGER_ID] = makeIdleRoom();
  map[RISK_MANAGER_ID] = makeIdleRoom();
  return map;
}

export interface FloorOptions {
  tickers: string;
  model: string;
  /** Backend model provider, e.g. "OpenRouter" or "Ollama". */
  provider: string;
  initialCash: number;
  openrouterKey: string;
  alpacaPaper: boolean;
  alpacaKeyId: string;
  alpacaSecret: string;
  memoEmail: boolean;
  digestEmail: string;
  resendApiKey: string;
  /** Analyst agent keys to include in this shift (PM + risk always run). */
  enabledAgentKeys: string[];
  runRiskPipeline?: boolean;
  /** Called after NL/symbol resolution with the final ticker list. */
  onTickersResolved?: (tickers: string[], rationale: string) => void;
}

export interface FloorController {
  rooms: Record<string, RoomState>;
  log: LogLine[];
  runState: RunState;
  errorMsg: string | null;
  decisions: CompletePayload | null;
  shiftTickers: string[];
  shiftStartedAt: number | null;
  shiftRunId: string | null;
  resolvingTickers: boolean;
  start: (opts: FloorOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useFloor(): FloorController {
  const [rooms, setRooms] = useState<Record<string, RoomState>>(() =>
    buildInitialRooms(),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<CompletePayload | null>(null);
  const [shiftTickers, setShiftTickers] = useState<string[]>([]);
  const [shiftStartedAt, setShiftStartedAt] = useState<number | null>(null);
  const [shiftRunId, setShiftRunId] = useState<string | null>(null);
  const [resolvingTickers, setResolvingTickers] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const logIdRef = useRef(0);
  const shiftGenRef = useRef(0);
  const pendingRoomRef = useRef<
    Record<string, { payload: Parameters<typeof applyRoomProgress>[1]; tickerSet: Set<string> }>
  >({});
  const flushRafRef = useRef<number | null>(null);
  const lastLogStatusRef = useRef<Record<string, string>>({});

  const pushLog = useCallback((line: Omit<LogLine, "id">) => {
    setLog((prev) => {
      const id = `l${++logIdRef.current}`;
      const next = [...prev, { ...line, id }];
      // cap the buffer so we never drown the dom
      return next.length > 400 ? next.slice(-400) : next;
    });
  }, []);

  const flushRoomPatches = useCallback(() => {
    const batch = pendingRoomRef.current;
    pendingRoomRef.current = {};
    if (Object.keys(batch).length === 0) return;
    setRooms((prev) => {
      let next: Record<string, RoomState> | null = null;
      for (const [agent, { payload, tickerSet }] of Object.entries(batch)) {
        const cur = (next ?? prev)[agent];
        if (!cur) continue;
        const updated = applyRoomProgress(cur, payload, tickerSet);
        if (updated === cur) continue;
        if (!next) next = { ...prev };
        next[agent] = updated;
      }
      return next ?? prev;
    });
  }, []);

  const scheduleRoomPatch = useCallback(
    (agent: string, payload: Parameters<typeof applyRoomProgress>[1], tickerSet: Set<string>) => {
      pendingRoomRef.current[agent] = { payload, tickerSet };
      if (flushRafRef.current != null) return;
      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;
        flushRoomPatches();
      });
    },
    [flushRoomPatches],
  );

  const reset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    if (flushRafRef.current != null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    pendingRoomRef.current = {};
    lastLogStatusRef.current = {};
    clearAnalysisThrottle();
    setRooms(buildInitialRooms());
    setLog([]);
    setDecisions(null);
    setErrorMsg(null);
    setRunState("idle");
    setShiftTickers([]);
    setShiftStartedAt(null);
    setShiftRunId(null);
    setResolvingTickers(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setRunState((cur) => (cur === "running" ? "idle" : cur));
  }, []);

  const start = useCallback(
    async ({
      tickers,
      model,
      provider,
      initialCash,
      openrouterKey,
      alpacaPaper,
      alpacaKeyId,
      alpacaSecret,
      memoEmail,
      digestEmail,
      resendApiKey,
      enabledAgentKeys,
      runRiskPipeline = true,
      onTickersResolved,
    }: FloorOptions) => {
      const query = tickers.trim();
      if (!query) {
        setErrorMsg("describe what to analyze or enter ticker symbols.");
        setRunState("error");
        return;
      }

      const enabled = new Set(enabledAgentKeys);
      const activeAnalysts = ANALYSTS.filter((a) => enabled.has(a.key));
      if (activeAnalysts.length === 0) {
        setErrorMsg("no analysts selected. enable at least one in manage agents.");
        setRunState("error");
        return;
      }

      // Local providers (Ollama) run without a cloud key. OpenRouter models
      // still require one to authenticate the shift.
      const isLocalProvider = provider === OLLAMA_PROVIDER;
      const hasOpenrouterKey = openrouterKey.trim().length > 0;
      if (!isLocalProvider && !hasOpenrouterKey) {
        setErrorMsg("openrouter key required to resolve symbols and run the shift.");
        setRunState("error");
        return;
      }

      // Natural-language ticker resolution is served by an OpenRouter model on
      // the backend, so it needs a key even when the shift runs locally.
      const needsResolution = parseWatchlistInput(query).kind !== "direct";
      if (isLocalProvider && !hasOpenrouterKey && needsResolution) {
        setErrorMsg(
          "local models can't resolve natural-language watchlists — enter ticker symbols directly (e.g. AAPL, MSFT).",
        );
        setRunState("error");
        return;
      }

      const apiKeys: Record<string, string> = {};
      if (openrouterKey) apiKeys.OPENROUTER_API_KEY = openrouterKey;
      if (alpacaKeyId) apiKeys.ALPACA_API_KEY_ID = alpacaKeyId;
      if (alpacaSecret) apiKeys.ALPACA_API_SECRET_KEY = alpacaSecret;
      if (resendApiKey) apiKeys.RESEND_API_KEY = resendApiKey;

      setErrorMsg(null);

      const parsed = parseWatchlistInput(query);
      let tickerList: string[] = [];
      let resolveNote = "";

      if (parsed.kind === "direct") {
        tickerList = parsed.tickers;
      } else {
        setResolvingTickers(true);
        try {
          const resolved = await resolveTickers({
            query,
            api_keys: apiKeys,
          });
          tickerList = resolved.tickers.map((t) => t.toUpperCase());
          resolveNote = resolved.rationale?.trim() ?? "";
          if (tickerList.length === 0) {
            throw new Error("no symbols resolved from your request");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "ticker resolution failed";
          setErrorMsg(msg);
          setRunState("error");
          setResolvingTickers(false);
          return;
        } finally {
          setResolvingTickers(false);
        }
      }

      if (tickerList.length === 0) {
        setErrorMsg("describe what to analyze or enter ticker symbols.");
        setRunState("error");
        return;
      }

      onTickersResolved?.(tickerList, resolveNote);

      abortRef.current?.();
      if (flushRafRef.current != null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      pendingRoomRef.current = {};
      lastLogStatusRef.current = {};
      clearAnalysisThrottle();

      const shiftGen = ++shiftGenRef.current;
      const tickerSet = new Set(tickerList);

      // fresh start — wipe prior theses and logs
      setErrorMsg(null);
      setDecisions(null);
      setLog([]);
      setShiftTickers(tickerList);
      setShiftStartedAt(Date.now());
      setShiftRunId(null);
      setRunState("running");
      const dataFeedOn = DATA_ANALYSTS.some((a) => enabled.has(a.key));

      setRooms(() => {
        const fresh = buildInitialRooms();
        for (const a of ANALYSTS) {
          const id = roomIdFor(a.key);
          if (enabled.has(a.key)) {
            const isTier1 = NAMED_ANALYSTS.some((n) => n.key === a.key)
              || SPECIALIST_ANALYSTS.some((n) => n.key === a.key);
            fresh[id] = {
              ...fresh[id],
              status: "STANDBY",
              message:
                isTier1 && dataFeedOn ? "awaiting tier-0 feeds" : "queued",
              ticker: null,
              analysis: null,
              history: [],
            };
          } else {
            fresh[id] = {
              ...fresh[id],
              status: "STANDBY",
              message: "offline",
              ticker: null,
              analysis: null,
            };
          }
        }
        fresh[PORTFOLIO_MANAGER_ID] = {
          ...fresh[PORTFOLIO_MANAGER_ID],
          status: "STANDBY",
          message: "queued",
          ticker: null,
          analysis: null,
          history: [],
        };
        fresh[RISK_MANAGER_ID] = {
          ...fresh[RISK_MANAGER_ID],
          status: "STANDBY",
          message: "queued",
          ticker: null,
          analysis: null,
          history: [],
        };
        fresh[DEBATE_ROOM_ID] = {
          ...fresh[DEBATE_ROOM_ID],
          status: "STANDBY",
          message: "awaiting analysts",
          ticker: null,
          analysis: null,
          debateFeed: [],
          debateRounds: [],
          activeDebateTicker: null,
          history: [],
        };
        for (const a of RISK_PIPELINE_AGENTS) {
          fresh[a.key] = {
            ...fresh[a.key],
            status: runRiskPipeline ? "STANDBY" : "STANDBY",
            message: runRiskPipeline ? "queued" : "skipped",
            ticker: null,
            analysis: null,
            history: [],
          };
        }
        return fresh;
      });

      const graphNodes: GraphNode[] = [
        ...activeAnalysts.map<GraphNode>((a) => ({
          id: roomIdFor(a.key),
          type: "agent-node",
          data: { name: a.name },
        })),
        {
          id: PORTFOLIO_MANAGER_ID,
          type: "agent-node",
          data: { name: PORTFOLIO_MANAGER.name },
        },
      ];

      const graphEdges: GraphEdge[] = activeAnalysts.map<GraphEdge>((a) => ({
        id: `e-${a.key}-pm`,
        source: roomIdFor(a.key),
        target: PORTFOLIO_MANAGER_ID,
      }));

      if (parsed.kind !== "direct") {
        pushLog({
          ts: Date.now(),
          callsign: "SYS",
          ticker: null,
          status: `resolved ${tickerList.join(", ")}${resolveNote ? ` — ${resolveNote}` : ""}`,
          level: "ok",
        });
      }

      pushLog({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status: `dispatching ${activeAnalysts.length} analysts on ${tickerList.join(", ")}`,
        level: "ok",
      });

      const abort = runHedgeFund(
        {
          tickers: tickerList,
          ticker_query: query,
          graph_nodes: graphNodes,
          graph_edges: graphEdges,
          model_name: model,
          model_provider: provider,
          initial_cash: initialCash,
          margin_requirement: 0,
          execute_alpaca_paper: alpacaPaper,
          run_risk_pipeline: runRiskPipeline,
          send_memo_email: memoEmail && digestEmail.trim().length > 0,
          digest_email: memoEmail ? digestEmail.trim() : undefined,
          api_keys: Object.keys(apiKeys).length > 0 ? apiKeys : undefined,
        },
        {
          onStart: (runId) => {
            if (shiftGen !== shiftGenRef.current) return;
            setShiftRunId(runId);
            pushLog({
              ts: Date.now(),
              callsign: "SYS",
              ticker: null,
              status: "shift starting…",
              level: "info",
            });
          },
          onProgress: ({
            agent,
            ticker,
            status,
            analysis,
            timestamp,
            signal,
            confidence,
            thesis_summary,
          }) => {
            if (shiftGen !== shiftGenRef.current) return;

            const ts = timestamp ? Date.parse(timestamp) : Date.now();
            const roomId = resolveProgressRoomId(agent);
            scheduleRoomPatch(
              roomId,
              {
                agent: roomId,
                ticker,
                status,
                analysis,
                timestamp,
                signal,
                confidence,
                thesis_summary,
              },
              tickerSet,
            );

            const prevStatus = lastLogStatusRef.current[agent];
            if (prevStatus === status) return;
            lastLogStatusRef.current[agent] = status;

            const consultReply =
              agent === CONSULTATION_ID && status.includes('":');
            pushLog({
              ts,
              callsign: callsignFor(agent),
              roomId: agent,
              ticker,
              status,
              level:
                status.toLowerCase() === "done"
                  ? "ok"
                  : status.toLowerCase().startsWith("error")
                    ? "err"
                    : consultReply
                      ? "ok"
                      : agent === CONSULTATION_ID &&
                          status.toLowerCase().includes("consult")
                        ? "warn"
                        : "info",
            });
          },
          onComplete: (data) => {
            if (shiftGen !== shiftGenRef.current) return;
            if (flushRafRef.current != null) {
              cancelAnimationFrame(flushRafRef.current);
              flushRafRef.current = null;
            }
            flushRoomPatches();
            setDecisions(data);
            setRunState("complete");
            setRooms((prev) => {
              const out: Record<string, RoomState> = { ...prev };
              for (const k of Object.keys(out)) {
                const cur = out[k];
                if (cur.message === "offline") continue;
                if (cur.status === "WORKING" || cur.status === "STANDBY") {
                  out[k] = { ...cur, status: "DONE", message: "complete" };
                }
              }
              return out;
            });
            const paper = data.paper_trading;
            const mail = data.memo_email;
            let status = paper?.enabled
              ? "shift complete. boss memo + Alpaca paper orders sent."
              : paper?.skipped_reason
                ? `shift complete. Alpaca skipped: ${paper.skipped_reason}`
                : "shift complete. boss issued decisions.";
            if (mail?.enabled) {
              status = mail.sent
                ? `${status} Memo emailed to ${mail.to}.`
                : `${status} Memo email failed: ${mail.error ?? "unknown"}.`;
            }
            pushLog({
              ts: Date.now(),
              callsign: "SYS",
              ticker: null,
              status,
              level:
                (paper && !paper.enabled && paper.skipped_reason) ||
                (mail?.enabled && !mail.sent)
                  ? "warn"
                  : "ok",
            });
          },
          onError: (msg) => {
            if (shiftGen !== shiftGenRef.current) return;
            setErrorMsg(msg);
            setRunState("error");
            setRooms((prev) => {
              const out: Record<string, RoomState> = { ...prev };
              for (const k of Object.keys(out)) {
                if (out[k].status === "WORKING" || out[k].analysis) {
                  out[k] = {
                    ...out[k],
                    status: "ERROR",
                    message: "shift aborted",
                    analysis: null,
                  };
                }
              }
              return out;
            });
            pushLog({
              ts: Date.now(),
              callsign: "SYS",
              ticker: null,
              status: `error :: ${msg}`,
              level: "err",
            });
          },
        },
      );
      abortRef.current = abort;
    },
    [pushLog, scheduleRoomPatch, flushRoomPatches],
  );

  return useMemo(
    () => ({
      rooms,
      log,
      runState,
      errorMsg,
      decisions,
      shiftTickers,
      shiftStartedAt,
      shiftRunId,
      resolvingTickers,
      start,
      stop,
      reset,
    }),
    [
      rooms,
      log,
      runState,
      errorMsg,
      decisions,
      shiftTickers,
      shiftStartedAt,
      shiftRunId,
      resolvingTickers,
      start,
      stop,
      reset,
    ],
  );
}

const ALL_AGENTS_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const a of ANALYSTS) map[roomIdFor(a.key)] = a.callsign;
  map[PORTFOLIO_MANAGER_ID] = PORTFOLIO_MANAGER.callsign;
  map[RISK_MANAGER_ID] = RISK_MANAGER.callsign;
  map[DEBATE_ROOM_ID] = "DEBATE";
  map["macro_feed"] = "MACRO";
  map["system"] = "SYS";
  map["paper_desk"] = "PAPER";
  map["tier1_gate"] = "GATE";
  map[CONSULTATION_ID] = "MAIL";
  map[RISK_FORGE_ID] = "FORGE";
  map[RISK_RESEARCH_HUB_ID] = "RSHUB";
  map[SCENARIO_LAB_ID] = "SCNRO";
  map[RISK_WATCHTOWER_ID] = "TOWER";
  map["memo_desk"] = "MEMO";
  return map;
})();

function callsignFor(agentId: string): string {
  return ALL_AGENTS_BY_ID[agentId] ?? agentId.slice(0, 6).toUpperCase();
}
