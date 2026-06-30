import { useEffect, useMemo, useRef, useState } from "react";

import { ControlConsole } from "./components/ControlConsole";

import { DecisionsTerminal } from "./components/DecisionsTerminal";

import { Floor } from "./components/Floor";

import { Scanlines } from "./components/Scanlines";

import { SystemBar } from "./components/SystemBar";

import { TerminalLog } from "./components/TerminalLog";

import { AgentRosterDock } from "./components/AgentRosterDock";

import { ShiftLedgerPanel } from "./components/ShiftLedgerPanel";
import { ShadowBenchPanel } from "./components/ShadowBenchPanel";
import { ShiftReplayPanel } from "./components/ShiftReplayPanel";
import { WeatherReportPanel } from "./components/WeatherReportPanel";
import { BacktesterPanel } from "./components/BacktesterPanel";

import { ShiftPhaseRail } from "./components/ShiftPhaseRail";
import { FloorIdleHint } from "./components/FloorIdleHint";
import { ShortcutsPanel } from "./components/ShortcutsPanel";

import { useAuth } from "./contexts/AuthContext";
import { useUserData } from "./contexts/UserDataContext";

import { useAgentSelection } from "./hooks/useAgentSelection";

import { useFloor } from "./hooks/useFloor";

import { DebateTheater } from "./components/DebateTheater";

import { RoomDetailPanel } from "./components/RoomDetailPanel";

import {

  agentForRoomId,

  ANALYSTS,

  roomIdFor,

  PORTFOLIO_MANAGER_ID,

  RISK_MANAGER_ID,

} from "./lib/agents";

import { DEBATE_ROOM_ID } from "./lib/layout";

import { DEFAULT_MODEL, OPENROUTER_MODELS } from "./lib/models";

import { buildShiftTimeline, snapshotAtTime } from "./lib/shiftReplay";

import { countArtifacts } from "./lib/parseAgentAnalysis";

import type { CompletePayload } from "./lib/types";



const KEY_STORAGE = "floor.openrouter.key";

const MODEL_STORAGE = "floor.model";

const TICKERS_STORAGE = "floor.tickers";

const ALPACA_PAPER_STORAGE = "floor.alpaca.paper";
const RISK_PIPELINE_STORAGE = "floor.risk.pipeline";

const ALPACA_KEY_ID_STORAGE = "floor.alpaca.key.id";

const ALPACA_SECRET_STORAGE = "floor.alpaca.key.secret";

const MEMO_EMAIL_STORAGE = "floor.memo.email";

const DIGEST_EMAIL_STORAGE = "floor.digest.email";

const RESEND_KEY_STORAGE = "floor.resend.key";

const THEME_STORAGE = "floor.theme";

type Theme = "light" | "dark";

function initialTheme(): Theme {

  const stored = localStorage.getItem(THEME_STORAGE);

  return stored === "dark" ? "dark" : "light";

}



function initialModel(): string {

  const stored = localStorage.getItem(MODEL_STORAGE);

  if (!stored || stored === "openai/gpt-4o-mini") return DEFAULT_MODEL;

  if (OPENROUTER_MODELS.some((m) => m.id === stored)) return stored;

  return DEFAULT_MODEL;

}



function isTypingTarget(el: EventTarget | null): boolean {

  if (!(el instanceof HTMLElement)) return false;

  const tag = el.tagName;

  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;

}



export default function App() {

  const floor = useFloor();
  const { configured: authConfigured, user, signOut, session } = useAuth();
  const userData = useUserData();

  const roster = useAgentSelection();

  const [tickers, setTickers] = useState<string>(

    () => localStorage.getItem(TICKERS_STORAGE) || "AAPL, MSFT, NVDA",

  );

  const [model, setModel] = useState<string>(initialModel);

  const [initialCash, setInitialCash] = useState<number>(100000);

  const [openrouterKey, setOpenrouterKey] = useState<string>(

    () => localStorage.getItem(KEY_STORAGE) || "",

  );

  const [alpacaPaper, setAlpacaPaper] = useState(

    () => localStorage.getItem(ALPACA_PAPER_STORAGE) === "1",

  );

  const [runRiskPipeline, setRunRiskPipeline] = useState(

    () => localStorage.getItem(RISK_PIPELINE_STORAGE) !== "0",

  );

  const [alpacaKeyId, setAlpacaKeyId] = useState(

    () => localStorage.getItem(ALPACA_KEY_ID_STORAGE) || "",

  );

  const [alpacaSecret, setAlpacaSecret] = useState(

    () => localStorage.getItem(ALPACA_SECRET_STORAGE) || "",

  );

  const [memoEmail, setMemoEmail] = useState(

    () => localStorage.getItem(MEMO_EMAIL_STORAGE) === "1",

  );

  const [digestEmail, setDigestEmail] = useState(

    () => localStorage.getItem(DIGEST_EMAIL_STORAGE) || "",

  );

  const [resendApiKey, setResendApiKey] = useState(

    () => localStorage.getItem(RESEND_KEY_STORAGE) || "",

  );

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [seenArtifacts, setSeenArtifacts] = useState<Record<string, number>>({});

  const [debateTheaterOpen, setDebateTheaterOpen] = useState(false);

  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);

  const [focusSeq, setFocusSeq] = useState(0);

  const [ledgerOpen, setLedgerOpen] = useState(false);

  const [backtestOpen, setBacktestOpen] = useState(false);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [replayCursor, setReplayCursor] = useState(0);

  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const [theme, setTheme] = useState<Theme>(initialTheme);



  useEffect(() => {
    setSettingsHydrated(false);
  }, [session?.user.id]);



  useEffect(() => {

    document.documentElement.classList.toggle("dark", theme === "dark");

    localStorage.setItem(THEME_STORAGE, theme);

    return () => {

      // landing page always renders in its own light paper world

      document.documentElement.classList.remove("dark");

    };

  }, [theme]);



  useEffect(() => {
    if (!userData.ready || settingsHydrated) return;
    const s = userData.settings;
    if (s.tickers) setTickers(s.tickers);
    if (s.model) setModel(s.model);
    if (s.theme) setTheme(s.theme);
    if (s.initialCash != null) setInitialCash(s.initialCash);
    if (s.alpacaPaper != null) setAlpacaPaper(s.alpacaPaper);
    if (s.runRiskPipeline != null) setRunRiskPipeline(s.runRiskPipeline);
    if (s.memoEmail != null) setMemoEmail(s.memoEmail);
    if (s.digestEmail != null) setDigestEmail(s.digestEmail);
    if (s.enabledAgents?.length) roster.replaceEnabled(s.enabledAgents);
    setSettingsHydrated(true);
  }, [userData.ready, userData.settings, settingsHydrated, roster]);



  useEffect(() => {
    if (!settingsHydrated) return;
    userData.updateSettings({
      model,
      tickers,
      theme,
      initialCash,
      enabledAgents: roster.enabledKeys,
      alpacaPaper,
      runRiskPipeline,
      memoEmail,
      digestEmail,
    });
  }, [
    settingsHydrated,
    model,
    tickers,
    theme,
    initialCash,
    roster.enabledKeys,
    alpacaPaper,
    runRiskPipeline,
    memoEmail,
    digestEmail,
    userData,
  ]);



  const archivedPayloadRef = useRef<CompletePayload | null>(null);



  const debateState = floor.rooms[DEBATE_ROOM_ID];

  // The debate room flips to WORKING the moment the chamber node activates, but
  // no arguments have streamed yet. Only auto-reveal the theater once there is

  // real content (a streamed line or a completed round); otherwise an empty

  // dark modal covers the floor while the T1 agents are still deliberating.

  const debateHasContent =

    (debateState?.debateFeed?.length ?? 0) > 0 ||

    (debateState?.debateRounds?.length ?? 0) > 0;



  useEffect(() => {

    if (debateState?.status === "WORKING" && debateHasContent) {

      setDebateTheaterOpen(true);

    }

    if (debateState?.status === "STANDBY" || debateState?.status === "DONE") {

      if (floor.runState !== "running") setDebateTheaterOpen(false);

    }

  }, [debateState?.status, debateHasContent, floor.runState]);



  useEffect(() => {

    if (floor.runState === "idle") {

      archivedPayloadRef.current = null;

    }

  }, [floor.runState]);



  useEffect(() => {

    if (floor.runState !== "complete" || !floor.decisions) return;

    if (archivedPayloadRef.current === floor.decisions) return;

    archivedPayloadRef.current = floor.decisions;

    const startedAt = floor.shiftStartedAt ?? Date.now();

    void userData.saveShift({

      tickers,

      model,

      initialCash,

      analystCount: roster.enabledCount,

      payload: floor.decisions,

      replay: {

        shiftStartedAt: startedAt,

        timeline: buildShiftTimeline(floor.rooms, floor.log, startedAt),

        roomIds: Object.keys(floor.rooms),

        log: floor.log,

      },

      runId: floor.shiftRunId,

    });

  }, [

    floor.runState,

    floor.decisions,

    floor.rooms,

    floor.log,

    floor.shiftStartedAt,

    tickers,

    model,

    initialCash,

    roster.enabledCount,

    userData,

  ]);



  useEffect(() => {

    if (floor.runState === "complete" && floor.decisions) {

      setMemoOpen(true);

    }

  }, [floor.runState, floor.decisions]);



  useEffect(() => {

    if (floor.runState === "idle") {

      setMemoOpen(false);

    }

  }, [floor.runState]);



  useEffect(() => {

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        e.preventDefault();

        setShortcutsOpen((v) => !v);

        return;

      }

      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        e.preventDefault();

        setLedgerOpen((v) => !v);

        return;

      }

      if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (floor.runState !== "complete" || !floor.decisions) return;

        e.preventDefault();

        setMemoOpen(true);

        return;
      }

      if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (floor.runState !== "complete" || !floor.decisions) return;

        e.preventDefault();

        setShadowOpen((v) => !v);

        return;
      }

      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (floor.runState !== "complete" || !floor.shiftStartedAt) return;

        e.preventDefault();

        setReplayOpen((v) => !v);

        return;
      }

      if (e.key.toLowerCase() === "w" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (floor.runState !== "complete" || !floor.decisions) return;

        e.preventDefault();

        setWeatherOpen((v) => !v);

      }

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [floor.runState, floor.decisions, floor.shiftStartedAt]);



  const roomSelection = useMemo(() => {

    if (!selectedRoomId) return null;

    const agent = agentForRoomId(selectedRoomId, DEBATE_ROOM_ID);

    if (!agent) return null;

    return { roomId: selectedRoomId, agent };

  }, [selectedRoomId]);



  // How many chart artifacts each room has produced this shift.

  const artifactCounts = useMemo(() => {

    const out: Record<string, number> = {};

    for (const [id, r] of Object.entries(floor.rooms)) {

      const n = countArtifacts(r.analysis);

      if (n > 0) out[id] = n;

    }

    return out;

  }, [floor.rooms]);



  // Fresh shift (or full reset) clears the "seen" ledger so new charts alert.

  useEffect(() => {

    if (floor.runState === "running" || floor.runState === "idle") {

      setSeenArtifacts({});

    }

  }, [floor.runState]);



  // Opening a room marks its current charts as seen (clears its alert).

  useEffect(() => {

    if (!selectedRoomId) return;

    const n = artifactCounts[selectedRoomId] ?? 0;

    setSeenArtifacts((prev) =>

      prev[selectedRoomId] === n ? prev : { ...prev, [selectedRoomId]: n },

    );

  }, [selectedRoomId, artifactCounts]);



  // Rooms with charts the user hasn't opened yet get an exclamation badge.

  const newChartRoomIds = useMemo(() => {

    const ids = new Set<string>();

    for (const [id, n] of Object.entries(artifactCounts)) {

      if (id === selectedRoomId) continue;

      if (n > (seenArtifacts[id] ?? 0)) ids.add(id);

    }

    return ids;

  }, [artifactCounts, seenArtifacts, selectedRoomId]);



  useEffect(() => {

    if (openrouterKey) localStorage.setItem(KEY_STORAGE, openrouterKey);

  }, [openrouterKey]);

  useEffect(() => {

    localStorage.setItem(ALPACA_PAPER_STORAGE, alpacaPaper ? "1" : "0");

  }, [alpacaPaper]);

  useEffect(() => {

    localStorage.setItem(RISK_PIPELINE_STORAGE, runRiskPipeline ? "1" : "0");

  }, [runRiskPipeline]);

  useEffect(() => {

    if (alpacaKeyId) localStorage.setItem(ALPACA_KEY_ID_STORAGE, alpacaKeyId);

  }, [alpacaKeyId]);

  useEffect(() => {

    if (alpacaSecret) localStorage.setItem(ALPACA_SECRET_STORAGE, alpacaSecret);

  }, [alpacaSecret]);

  useEffect(() => {

    localStorage.setItem(MEMO_EMAIL_STORAGE, memoEmail ? "1" : "0");

  }, [memoEmail]);

  useEffect(() => {

    if (digestEmail) localStorage.setItem(DIGEST_EMAIL_STORAGE, digestEmail);

  }, [digestEmail]);

  useEffect(() => {

    if (resendApiKey) localStorage.setItem(RESEND_KEY_STORAGE, resendApiKey);

  }, [resendApiKey]);

  useEffect(() => {

    localStorage.setItem(MODEL_STORAGE, model);

  }, [model]);

  useEffect(() => {

    localStorage.setItem(TICKERS_STORAGE, tickers);

  }, [tickers]);



  const deployRoomIds = useMemo(() => {

    const ids = new Set<string>([PORTFOLIO_MANAGER_ID, RISK_MANAGER_ID]);

    for (const a of ANALYSTS) {

      if (roster.enabled.has(a.key)) ids.add(roomIdFor(a.key));

    }

    return ids;

  }, [roster.enabled]);



  const { activeCount, doneCount, totalRooms } = useMemo(() => {

    let active = 0;

    let done = 0;

    for (const [id, r] of Object.entries(floor.rooms)) {

      if (!deployRoomIds.has(id)) continue;

      if (r.status === "WORKING") active++;

      else if (r.status === "DONE") done++;

    }

    return {

      activeCount: active,

      doneCount: done,

      totalRooms: deployRoomIds.size,

    };

  }, [floor.rooms, deployRoomIds]);

  const replaySnapshot = useMemo(() => {
    if (!replayOpen || !floor.shiftStartedAt) return null;
    const timeline = buildShiftTimeline(floor.rooms, floor.log, floor.shiftStartedAt);
    if (!timeline.length) return null;
    const t = replayCursor || timeline[0].ts;
    return snapshotAtTime(timeline, t, Object.keys(floor.rooms));
  }, [replayOpen, replayCursor, floor.rooms, floor.log, floor.shiftStartedAt]);

  return (

    <div className="relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-ink-900 to-ink-950 font-sans text-wire-200">

      <Scanlines />



      <SystemBar

        runState={floor.runState}

        activeCount={activeCount}

        doneCount={doneCount}

        totalRooms={totalRooms}

        tickerHint={
          floor.shiftTickers.length > 0
            ? floor.shiftTickers.join(", ")
            : tickers
        }

        ledgerCount={userData.shifts.length}

        onOpenBacktest={() => setBacktestOpen(true)}

        onOpenLedger={() => setLedgerOpen(true)}

        onOpenShortcuts={() => setShortcutsOpen(true)}

        onOpenMemo={() => setMemoOpen(true)}

        onOpenShadowBench={() => setShadowOpen(true)}

        onOpenReplay={() => setReplayOpen(true)}

        onOpenWeather={() => setWeatherOpen(true)}

        theme={theme}

        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}

        userEmail={authConfigured ? user?.email ?? null : null}
        onSignOut={authConfigured ? signOut : undefined}

      />



      <ShiftPhaseRail

        runState={floor.runState}

        resolvingTickers={floor.resolvingTickers}

        rooms={floor.rooms}

        enabledAgentKeys={roster.enabled}

        runRiskPipeline={runRiskPipeline}

      />



      <ControlConsole

        tickers={tickers}

        onTickersChange={setTickers}

        extraWatchlists={userData.watchlists}

        model={model}

        onModelChange={setModel}

        initialCash={initialCash}

        onCashChange={setInitialCash}

        openrouterKey={openrouterKey}

        onKeyChange={setOpenrouterKey}

        alpacaPaper={alpacaPaper}

        onAlpacaPaperChange={setAlpacaPaper}

        runRiskPipeline={runRiskPipeline}

        onRunRiskPipelineChange={setRunRiskPipeline}

        alpacaKeyId={alpacaKeyId}

        onAlpacaKeyIdChange={setAlpacaKeyId}

        alpacaSecret={alpacaSecret}

        onAlpacaSecretChange={setAlpacaSecret}

        memoEmail={memoEmail}

        onMemoEmailChange={setMemoEmail}

        digestEmail={digestEmail}

        onDigestEmailChange={setDigestEmail}

        resendApiKey={resendApiKey}

        onResendApiKeyChange={setResendApiKey}

        runState={floor.runState}

        errorMsg={floor.errorMsg}

        resolvingTickers={floor.resolvingTickers}

        onStart={() =>
          void floor.start({
            tickers,
            model,
            initialCash,
            openrouterKey,
            alpacaPaper,
            runRiskPipeline,
            alpacaKeyId,
            alpacaSecret,
            memoEmail,
            digestEmail,
            resendApiKey,
            enabledAgentKeys: roster.enabledKeys,
            onTickersResolved: (resolved) => setTickers(resolved.join(", ")),
          })
        }

        onStop={floor.stop}

        onReset={floor.reset}

        enabledAnalystCount={roster.enabledCount}

      />



      <main className="relative z-0 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">

        <div className="relative min-h-0 min-w-0">

          <Floor

            rooms={floor.rooms}

            enabledAgentKeys={roster.enabled}

            selectedRoomId={selectedRoomId}

            onRoomSelect={(roomId) => {
              if (roomId === DEBATE_ROOM_ID) {
                setDebateTheaterOpen(true);
                return;
              }
              setSelectedRoomId(roomId);
            }}

            onOpenDebateTheater={() => setDebateTheaterOpen(true)}

            newChartRoomIds={newChartRoomIds}

            focusRoomId={focusRoomId}

            focusSeq={focusSeq}

            replaySnapshot={replaySnapshot}

            runState={floor.runState}

          />

          <FloorIdleHint

            runState={floor.runState}

            enabledCount={roster.enabledCount}

            hasApiKey={openrouterKey.trim().length > 0}

          />

          <DebateTheater

            state={

              debateState ?? {

                status: "STANDBY",

                ticker: null,

                message: "chamber idle",

                analysis: null,

                updatedAt: 0,

                history: [],

                debateFeed: [],

              }

            }

            open={debateTheaterOpen}

            onClose={() => setDebateTheaterOpen(false)}

            theme={theme}

            runState={floor.runState}

            shiftRunId={floor.shiftRunId}

          />

          <RoomDetailPanel

            selection={roomSelection}

            state={selectedRoomId ? floor.rooms[selectedRoomId] ?? null : null}

            onClose={() => setSelectedRoomId(null)}

          />

          <ShiftLedgerPanel
            open={ledgerOpen}
            onClose={() => setLedgerOpen(false)}
            entries={userData.shifts}
            onDelete={(id) => void userData.deleteShift(id)}
            onClearAll={() => void userData.clearShifts()}
            cloudSynced={userData.cloud}
          />

        </div>

        <div className="min-h-0 h-full overflow-hidden">

          <TerminalLog
            log={floor.log}
            runState={floor.runState}
            onFocusRoom={(roomId) => {
              setFocusRoomId(roomId);
              setFocusSeq((s) => s + 1);
            }}
          />

        </div>

      </main>



      <AgentRosterDock

        enabled={roster.enabled}

        enabledCount={roster.enabledCount}

        totalToggleable={roster.totalToggleable}

        onToggle={roster.toggle}

        onEnableAll={roster.enableAll}

        onDisableAllExceptOne={roster.disableAllExceptOne}

        onSetDataTier={(on) => roster.setTier(roster.dataKeys, on)}

        onSetNamedTier={(on) => roster.setTier(roster.namedKeys, on)}

        onSetSpecialistTier={(on) => roster.setTier(roster.specialistKeys, on)}

        onSetQuantTier={(on) => roster.setTier(roster.quantKeys, on)}

        runState={floor.runState}

      />



      <DecisionsTerminal

        data={floor.decisions}

        open={memoOpen}

        onDismiss={() => setMemoOpen(false)}

      />



      <ShadowBenchPanel
        open={shadowOpen}
        onClose={() => setShadowOpen(false)}
        payload={floor.decisions}
      />

      <ShiftReplayPanel
        open={replayOpen}
        onClose={() => setReplayOpen(false)}
        rooms={floor.rooms}
        log={floor.log}
        shiftStartedAt={floor.shiftStartedAt}
        totalDesks={totalRooms}
        onTimeChange={setReplayCursor}
      />

      <WeatherReportPanel
        open={weatherOpen}
        onClose={() => setWeatherOpen(false)}
        payload={floor.decisions}
      />

      <BacktesterPanel
        open={backtestOpen}
        onClose={() => setBacktestOpen(false)}
        tickers={tickers}
        model={model}
        openrouterKey={openrouterKey}
        enabledAgentKeys={roster.enabledKeys}
        initialCapital={initialCash}
      />

      <ShortcutsPanel

        open={shortcutsOpen}

        onClose={() => setShortcutsOpen(false)}

      />

    </div>

  );

}


