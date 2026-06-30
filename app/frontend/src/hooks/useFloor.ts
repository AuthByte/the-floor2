import { useCallback, useMemo, useRef, useState } from "react";
import {
  ANALYSTS,
  PORTFOLIO_MANAGER,
  PORTFOLIO_MANAGER_ID,
  roomIdFor,
} from "../lib/agents";
import { clearAnalysisThrottle } from "../lib/applyRoomProgress";
import { resolveTickers, runHedgeFund } from "../lib/api";
import type { WatchlistPreset } from "../lib/watchlists";
import { PROVIDER } from "../lib/models";
import { parseWatchlistInput } from "../lib/tickerInput";
import {
  applySessionToFloorState,
  buildInitialRooms,
  buildRunningRooms,
  commitBootstrapLogs,
  createShiftSessionRuntime,
  createShiftStreamHandlers,
  MAX_SHELVED_RUNS,
  newShelfId,
  snapshotSession,
  type AutoPublishDigestInput,
  type ShiftSession,
  type ShiftSessionRuntime,
} from "../lib/shiftSession";
import type {
  CompletePayload,
  GraphEdge,
  GraphNode,
  LogLine,
  RoomState,
  RunState,
} from "../lib/types";

export { buildInitialRooms };

export interface FloorOptions {
  tickers: string;
  model: string;
  initialCash: number;
  openrouterKey: string;
  alpacaKeyId: string;
  alpacaSecret: string;
  memoEmail: boolean;
  digestEmail: string;
  resendApiKey: string;
  enabledAgentKeys: string[];
  runRiskPipeline?: boolean;
  onTickersResolved?: (tickers: string[], rationale: string) => void;
}

export type { AutoPublishDigestInput };

export interface UseFloorConfig {
  watchlists?: WatchlistPreset[];
  hasUserSession?: boolean;
  getLastDigestRunTs?: (watchlistId: string) => number;
  setLastDigestRunTs?: (watchlistId: string, ts: number) => void;
  onAutoPublishDigest?: (input: AutoPublishDigestInput) => Promise<void>;
  onPaywall?: (payload: import("../lib/entitlements").PaywallPayload) => void;
  onShelvedSessionComplete?: (session: ShiftSession) => void;
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
  shelvedRuns: ShiftSession[];
  canShelf: boolean;
  start: (opts: FloorOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
  shelfActiveRun: () => boolean;
  restoreShelf: (shelfId: string) => boolean;
  discardShelf: (shelfId: string) => void;
  applyPaperTrading: (paper: import("../lib/types").PaperTradingResult) => void;
}

function resetActiveUiState(): {
  rooms: Record<string, RoomState>;
  log: LogLine[];
  runState: RunState;
  errorMsg: string | null;
  decisions: CompletePayload | null;
  shiftTickers: string[];
  shiftStartedAt: number | null;
  shiftRunId: string | null;
} {
  return {
    rooms: buildInitialRooms(),
    log: [],
    runState: "idle",
    errorMsg: null,
    decisions: null,
    shiftTickers: [],
    shiftStartedAt: null,
    shiftRunId: null,
  };
}

export function useFloor(config?: UseFloorConfig): FloorController {
  const configRef = useRef(config);
  configRef.current = config;

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
  const [shelvedRuns, setShelvedRuns] = useState<ShiftSession[]>([]);

  const activeShelfIdRef = useRef<string | null>(null);
  const activeRuntimeRef = useRef<ShiftSessionRuntime | null>(null);
  const shelvedRuntimesRef = useRef<Map<string, ShiftSessionRuntime>>(new Map());
  const discardedShelfIdsRef = useRef<Set<string>>(new Set());

  const notifyShelvedList = useCallback(() => {
    setShelvedRuns(
      Array.from(shelvedRuntimesRef.current.values()).map((rt) =>
        snapshotSession(rt.session),
      ),
    );
  }, []);

  const applySessionToReact = useCallback((session: ShiftSession) => {
    const applied = applySessionToFloorState(session);
    setRooms(applied.rooms);
    setLog(applied.log);
    setRunState(applied.runState);
    setErrorMsg(applied.errorMsg);
    setDecisions(applied.decisions);
    setShiftTickers(applied.shiftTickers);
    setShiftStartedAt(applied.shiftStartedAt);
    setShiftRunId(applied.shiftRunId);
  }, []);

  const resetActiveUi = useCallback(() => {
    clearAnalysisThrottle();
    const fresh = resetActiveUiState();
    setRooms(fresh.rooms);
    setLog(fresh.log);
    setRunState(fresh.runState);
    setErrorMsg(fresh.errorMsg);
    setDecisions(fresh.decisions);
    setShiftTickers(fresh.shiftTickers);
    setShiftStartedAt(fresh.shiftStartedAt);
    setShiftRunId(fresh.shiftRunId);
  }, []);

  const isSessionDiscarded = useCallback((shelfId: string) => {
    if (discardedShelfIdsRef.current.has(shelfId)) return true;
    if (activeShelfIdRef.current === shelfId) return false;
    return !shelvedRuntimesRef.current.has(shelfId);
  }, []);

  const handleSessionChange = useCallback(
    (session: ShiftSession) => {
      if (activeShelfIdRef.current === session.shelfId) {
        applySessionToReact(session);
        return;
      }
      if (shelvedRuntimesRef.current.has(session.shelfId)) {
        const rt = shelvedRuntimesRef.current.get(session.shelfId)!;
        rt.session = session;
        notifyShelvedList();
      }
    },
    [applySessionToReact, notifyShelvedList],
  );

  const handleShelvedComplete = useCallback(
    (session: ShiftSession) => {
      if (activeShelfIdRef.current === session.shelfId) return;
      configRef.current?.onShelvedSessionComplete?.(session);
    },
    [],
  );

  const makeStreamDeps = useCallback(
    (runtime: ShiftSessionRuntime, shelfId: string, tickerList: string[], startedAt: number) => ({
      session: runtime.session,
      buffers: runtime.buffers,
      tickerSet: runtime.tickerSet,
      tickerList,
      startedAt,
      isDiscarded: () => isSessionDiscarded(shelfId),
      onSessionChange: handleSessionChange,
      onShelvedComplete: handleShelvedComplete,
      onPaywall: (payload: import("../lib/entitlements").PaywallPayload) => {
        configRef.current?.onPaywall?.(payload);
        if (activeShelfIdRef.current === shelfId) {
          runtime.session.abort?.();
          runtime.session.abort = null;
          activeRuntimeRef.current = null;
          activeShelfIdRef.current = null;
          resetActiveUi();
        }
      },
      onAutoPublishDigest: configRef.current?.onAutoPublishDigest,
      watchlists: configRef.current?.watchlists,
      hasUserSession: configRef.current?.hasUserSession,
      getLastDigestRunTs: configRef.current?.getLastDigestRunTs,
      setLastDigestRunTs: configRef.current?.setLastDigestRunTs,
    }),
    [handleSessionChange, handleShelvedComplete, isSessionDiscarded, resetActiveUi],
  );

  const pushLogToActive = useCallback(
    (line: Omit<LogLine, "id">) => {
      setLog((prev) => {
        const next = [...prev, { ...line, id: `l${prev.length + 1}` }];
        return next.length > 400 ? next.slice(-400) : next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    if (activeRuntimeRef.current?.session.status === "running") {
      activeRuntimeRef.current.session.abort?.();
    }
    activeRuntimeRef.current = null;
    activeShelfIdRef.current = null;
    resetActiveUi();
    setResolvingTickers(false);
  }, [resetActiveUi]);

  const applyPaperTrading = useCallback(
    (paper: import("../lib/types").PaperTradingResult) => {
      setDecisions((prev) => (prev ? { ...prev, paper_trading: paper } : prev));
      if (activeRuntimeRef.current?.session.decisions) {
        activeRuntimeRef.current.session.decisions = {
          ...activeRuntimeRef.current.session.decisions,
          paper_trading: paper,
        };
      }
      pushLogToActive({
        ts: Date.now(),
        callsign: "PAPER",
        ticker: null,
        status: paper.enabled
          ? "boss memo · Alpaca paper orders submitted."
          : paper.skipped_reason
            ? `Alpaca paper skipped: ${paper.skipped_reason}`
            : "boss memo · Alpaca paper updated.",
        level: paper.enabled ? "ok" : paper.skipped_reason ? "warn" : "info",
      });
    },
    [pushLogToActive],
  );

  const stop = useCallback(() => {
    if (activeRuntimeRef.current?.session.status === "running") {
      activeRuntimeRef.current.session.abort?.();
      activeRuntimeRef.current.session.abort = null;
    }
    activeRuntimeRef.current = null;
    activeShelfIdRef.current = null;
    setRunState((cur) => (cur === "running" ? "idle" : cur));
  }, []);

  const shelfActiveRun = useCallback((): boolean => {
    if (runState !== "running" || !activeRuntimeRef.current) return false;
    if (shelvedRuntimesRef.current.size >= MAX_SHELVED_RUNS) {
      setErrorMsg("Max 2 shelved shifts — discard one from the shelf tray first.");
      return false;
    }

    const rt = activeRuntimeRef.current;
    shelvedRuntimesRef.current.set(rt.session.shelfId, rt);
    activeRuntimeRef.current = null;
    activeShelfIdRef.current = null;
    notifyShelvedList();
    resetActiveUi();
    return true;
  }, [runState, notifyShelvedList, resetActiveUi]);

  const restoreShelf = useCallback(
    (shelfId: string): boolean => {
      const rt = shelvedRuntimesRef.current.get(shelfId);
      if (!rt) return false;

      if (runState === "running" && activeRuntimeRef.current) {
        if (!shelfActiveRun()) return false;
      }

      shelvedRuntimesRef.current.delete(shelfId);
      activeRuntimeRef.current = rt;
      activeShelfIdRef.current = shelfId;
      applySessionToReact(rt.session);
      notifyShelvedList();
      return true;
    },
    [runState, shelfActiveRun, applySessionToReact, notifyShelvedList],
  );

  const discardShelf = useCallback(
    (shelfId: string) => {
      const rt = shelvedRuntimesRef.current.get(shelfId);
      if (!rt) return;
      discardedShelfIdsRef.current.add(shelfId);
      rt.discarded = true;
      rt.session.abort?.();
      rt.session.abort = null;
      shelvedRuntimesRef.current.delete(shelfId);
      notifyShelvedList();
    },
    [notifyShelvedList],
  );

  const start = useCallback(
    async ({
      tickers,
      model,
      initialCash,
      openrouterKey,
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

      if (!openrouterKey.trim()) {
        setErrorMsg("openrouter key required to resolve symbols and run the shift.");
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

      if (activeRuntimeRef.current?.session.status === "running") {
        activeRuntimeRef.current.session.abort?.();
      }
      activeRuntimeRef.current = null;
      activeShelfIdRef.current = null;
      clearAnalysisThrottle();

      const shelfId = newShelfId();
      const startedAt = Date.now();
      const label =
        tickerList.length <= 3
          ? tickerList.join(", ")
          : `${tickerList.slice(0, 2).join(", ")} +${tickerList.length - 2}`;

      const runningRooms = buildRunningRooms(enabled, runRiskPipeline);
      const runtime = createShiftSessionRuntime({
        shelfId,
        label,
        tickerList,
        model,
        analystCount: activeAnalysts.length,
        startedAt,
        rooms: runningRooms,
      });

      activeRuntimeRef.current = runtime;
      activeShelfIdRef.current = shelfId;

      setErrorMsg(null);
      setDecisions(null);
      setLog([]);
      setShiftTickers(tickerList);
      setShiftStartedAt(startedAt);
      setShiftRunId(null);
      setRunState("running");
      setRooms(runningRooms);

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
        runtime.buffers.pendingLog.push({
          ts: Date.now(),
          callsign: "SYS",
          ticker: null,
          status: `resolved ${tickerList.join(", ")}${resolveNote ? ` — ${resolveNote}` : ""}`,
          level: "ok",
        });
      }

      runtime.buffers.pendingLog.push({
        ts: Date.now(),
        callsign: "SYS",
        ticker: null,
        status: `dispatching ${activeAnalysts.length} analysts on ${tickerList.join(", ")}`,
        level: "ok",
      });

      const handlers = createShiftStreamHandlers(
        makeStreamDeps(runtime, shelfId, tickerList, startedAt),
      );
      handleSessionChange(commitBootstrapLogs(runtime));

      const abort = runHedgeFund(
        {
          tickers: tickerList,
          ticker_query: query,
          graph_nodes: graphNodes,
          graph_edges: graphEdges,
          model_name: model,
          model_provider: PROVIDER,
          initial_cash: initialCash,
          margin_requirement: 0,
          execute_alpaca_paper: false,
          run_risk_pipeline: runRiskPipeline,
          send_memo_email: memoEmail && digestEmail.trim().length > 0,
          digest_email: memoEmail ? digestEmail.trim() : undefined,
          api_keys: Object.keys(apiKeys).length > 0 ? apiKeys : undefined,
        },
        handlers,
      );

      runtime.session.abort = abort;
      handleSessionChange(snapshotSession(runtime.session));
    },
    [makeStreamDeps, handleSessionChange],
  );

  const canShelf =
    runState === "running" && shelvedRuns.length < MAX_SHELVED_RUNS;

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
      shelvedRuns,
      canShelf,
      start,
      stop,
      reset,
      shelfActiveRun,
      restoreShelf,
      discardShelf,
      applyPaperTrading,
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
      shelvedRuns,
      canShelf,
      start,
      stop,
      reset,
      shelfActiveRun,
      restoreShelf,
      discardShelf,
      applyPaperTrading,
    ],
  );
}
