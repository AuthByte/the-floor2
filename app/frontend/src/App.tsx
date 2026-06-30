import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";

import { ControlConsole } from "./components/ControlConsole";

import { DecisionsTerminal } from "./components/DecisionsTerminal";

import { Floor } from "./components/Floor";

import { LayoutAtmosphere } from "./components/LayoutAtmosphere";

import { SystemBar } from "./components/SystemBar";

import { TerminalLog } from "./components/TerminalLog";

import { AgentRosterDock } from "./components/AgentRosterDock";
import { PersonaMintWizard } from "./components/PersonaMintWizard";

import { ShiftShelfTray } from "./components/ShiftShelfTray";
import { ShiftLedgerPanel } from "./components/ShiftLedgerPanel";
import type { ShiftSession } from "./lib/shiftSession";
import { AccountSettingsPanel } from "./components/AccountSettingsPanel";
import { BacktestPanel } from "./components/BacktestPanel";
import { SocialFeed } from "./components/social/SocialFeed";
import { ShareShiftModal } from "./components/social/ShareShiftModal";
import { PostEmbedPage, SocialOverlays } from "./components/social/SocialOverlays";
import { PublicReplayPage } from "./components/social/PublicReplayPage";
import { AlpacaPortfolioPanel } from "./components/AlpacaPortfolioPanel";
import {
  PaperTradingConsentModal,
  hasAlpacaPaperConsent,
  setAlpacaPaperConsent,
} from "./components/PaperTradingConsentModal";
import { MemberDesksPanel } from "./components/MemberDesksPanel";
import { WatchlistPanel } from "./components/WatchlistPanel";

import { ShiftPhaseRail } from "./components/ShiftPhaseRail";
import { FloorIdleHint } from "./components/FloorIdleHint";
import { ConsultationComposer } from "./components/ConsultationComposer";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { FloorTour } from "./components/FloorTour";
import { OnboardingWizard, type OnboardingResult } from "./components/OnboardingWizard";

import { useAuth } from "./contexts/AuthContext";
import { useUserData } from "./contexts/UserDataContext";

import { useAgentSelection } from "./hooks/useAgentSelection";
import { usePersonaAgents } from "./hooks/usePersonaAgents";

import { useFloor } from "./hooks/useFloor";
import { useBilling } from "./hooks/useBilling";
import { planBadgeLabel } from "./lib/billing";

import {

  agentForRoomId,

  ANALYSTS,

  roomIdFor,

  PORTFOLIO_MANAGER_ID,

  RISK_MANAGER_ID,

} from "./lib/agents";

import { DEBATE_ROOM_ID } from "./lib/layout";

import { DEFAULT_MODEL, OPENROUTER_MODELS } from "./lib/models";

import { buildShiftTimeline, appendChairImpactTimeline, snapshotAtTime } from "./lib/shiftReplay";

import { countArtifacts } from "./lib/parseAgentAnalysis";

import type { CompletePayload, DebateRound, PaperTradingSummary, AlpacaStatus } from "./lib/types";
import { fetchAlpacaPortfolio, fetchAlpacaStatus, executeAlpacaPaper } from "./lib/api";
import type { ShiftArchiveInput, FloorPost, FeedMode } from "./lib/floorSocial/types";
import { buildPostSnapshot, pickHeroArtifactUrl } from "./lib/floorSocial/buildPostSnapshot";
import { publishDigestPost } from "./lib/floorSocial/api";
import { digestLastRunKey } from "./lib/watchlistDigest";
import { parseUrlState, setUrlState } from "./lib/floorSocial/useAppUrl";
import { useShiftPresence } from "./lib/floorSocial/useShiftPresence";
import { RoomDetailPanel } from "./components/RoomDetailPanel";
import { WATCHLIST_PRESETS } from "./lib/watchlists";
import { fetchShiftDetail, shiftHasArchivedReplay } from "./lib/userData/cloud";
import { getSupabase } from "./lib/supabase";
import { hasCompletedFloorTour } from "./lib/floorTour";
import { hasCompletedOnboarding, markOnboardingCompletedLocal } from "./lib/onboarding";
import type { ReplayRoomSnapshot } from "./lib/shiftReplay";
import type { ShiftReplayArchive } from "./lib/userData/types";
import { formatShiftDate, parseSummaryFromDecisions } from "./lib/shiftLedger";
import { prefetchAgentScorecards } from "./lib/agentScorecards";
import { ScheduleDeskPanel } from "./components/schedule/ScheduleDeskPanel";
import { fetchActiveServerShifts, fetchSchedules, formatNextScheduleChip, pickNextSchedule } from "./lib/schedule";

import {
  initialLayoutSkin,
  persistLayoutSkin,
  type LayoutSkin,
} from "./lib/layoutSkin";

const DebateTheater = lazy(() =>
  import("./components/DebateTheater").then((m) => ({ default: m.DebateTheater })),
);
const ShadowBenchPanel = lazy(() =>
  import("./components/ShadowBenchPanel").then((m) => ({ default: m.ShadowBenchPanel })),
);
const ShiftReplayPanel = lazy(() =>
  import("./components/ShiftReplayPanel").then((m) => ({ default: m.ShiftReplayPanel })),
);
const WeatherReportPanel = lazy(() =>
  import("./components/WeatherReportPanel").then((m) => ({ default: m.WeatherReportPanel })),
);

function PanelFallback() {
  return null;
}

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
const PRESENCE_OPT_IN_STORAGE = "floor.presenceOptIn";

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
  const { configured: authConfigured, user, signOut, session } = useAuth();
  const userData = useUserData();
  const billing = useBilling({ enabled: authConfigured && Boolean(session) });
  const presence = useShiftPresence();

  const allWatchlists = useMemo(
    () => [...WATCHLIST_PRESETS, ...userData.watchlists],
    [userData.watchlists],
  );

  const floor = useFloor({
    watchlists: allWatchlists,
    hasUserSession: Boolean(session?.user?.id),
    getLastDigestRunTs: (watchlistId) =>
      Number(localStorage.getItem(digestLastRunKey(watchlistId)) ?? 0),
    setLastDigestRunTs: (watchlistId, ts) =>
      localStorage.setItem(digestLastRunKey(watchlistId), String(ts)),
    onAutoPublishDigest: async ({ shift, caption, watchlist }) => {
      const supabase = getSupabase();
      const userId = session?.user?.id;
      if (!supabase || !userId) return;
      const snapshot = buildPostSnapshot(shift);
      const watchlistId = /^[0-9a-f-]{36}$/i.test(watchlist.id) ? watchlist.id : null;
      if (!watchlistId) return;
      await publishDigestPost(supabase, userId, {
        shiftId: shift.id,
        runId: shift.runId,
        caption,
        tickers: shift.tickers,
        model: shift.model,
        analystCount: shift.analystCount,
        tsMs: shift.ts,
        snapshot,
        heroArtifactUrl: pickHeroArtifactUrl(snapshot),
        watchlistId,
      });
    },
    onShelvedSessionComplete: (session) => {
      setShelfToast(`Shelf shift complete — ${session.label}`);
      window.setTimeout(() => setShelfToast((t) => (t?.includes(session.label) ? null : t)), 6000);
    },
  });

  const roster = useAgentSelection();
  const personas = usePersonaAgents(authConfigured);
  const [personaMintOpen, setPersonaMintOpen] = useState(false);

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

  const [watchlistDigestEnabled, setWatchlistDigestEnabled] = useState(false);
  const [watchlistDigestEmail, setWatchlistDigestEmail] = useState(false);

  const [resendApiKey, setResendApiKey] = useState(

    () => localStorage.getItem(RESEND_KEY_STORAGE) || "",

  );

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const [seenArtifacts, setSeenArtifacts] = useState<Record<string, number>>({});

  const [debateTheaterOpen, setDebateTheaterOpen] = useState(false);
  const [debateTheaterMode, setDebateTheaterMode] = useState<"live" | "replay">("live");
  const [debateReplayRounds, setDebateReplayRounds] = useState<DebateRound[] | null>(null);
  const [debateReplaySynthesized, setDebateReplaySynthesized] = useState(false);

  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);

  const [focusSeq, setFocusSeq] = useState(0);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<"floor" | "feed">("floor");
  const [shareShiftOpen, setShareShiftOpen] = useState(false);
  const [shareShiftEntry, setShareShiftEntry] = useState<ShiftArchiveInput | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>("all");
  const [feedPostId, setFeedPostId] = useState<string | null>(null);
  const [feedRefreshNonce, setFeedRefreshNonce] = useState(0);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [postReplayPost, setPostReplayPost] = useState<FloorPost | null>(null);
  const [postReplayOpen, setPostReplayOpen] = useState(false);
  const [postReplaySnapshot, setPostReplaySnapshot] = useState<Record<string, ReplayRoomSnapshot> | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [paperDeskSummary, setPaperDeskSummary] = useState<PaperTradingSummary | null>(null);
  const [alpacaStatus, setAlpacaStatus] = useState<AlpacaStatus | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingPaperExecuteRef = useRef<(() => void) | null>(null);
  const [paperExecuting, setPaperExecuting] = useState(false);
  const [memberDesksOpen, setMemberDesksOpen] = useState(false);
  const [watchlistsOpen, setWatchlistsOpen] = useState(false);
  const [embedPostId] = useState(() => parseUrlState().embedPostId ?? null);
  const [replayPostId] = useState(() => parseUrlState().replayPostId ?? null);
  const [embedReplay] = useState(() => parseUrlState().embedReplay ?? false);
  const [memoRunIdFromUrl] = useState(() => parseUrlState().memoRunId ?? null);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [shelfToast, setShelfToast] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoPublishedPostId, setMemoPublishedPostId] = useState<string | null>(null);
  const [archivedMemoPayload, setArchivedMemoPayload] = useState<CompletePayload | null>(null);
  const [archivedMemoRunId, setArchivedMemoRunId] = useState<string | null>(null);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [ledgerReplayOpen, setLedgerReplayOpen] = useState(false);
  const [ledgerReplayArchive, setLedgerReplayArchive] = useState<ShiftReplayArchive | null>(null);
  const [ledgerReplayMeta, setLedgerReplayMeta] = useState<{
    title: string;
    subtitle: string;
    analystCount: number;
  } | null>(null);
  const [ledgerReplaySnapshot, setLedgerReplaySnapshot] = useState<Record<string, ReplayRoomSnapshot> | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleInitialPrompt, setScheduleInitialPrompt] = useState<string | null>(null);
  const [serverShiftLive, setServerShiftLive] = useState(false);
  const [nextScheduleChip, setNextScheduleChip] = useState<string | null>(null);
  const [replayCursor, setReplayCursor] = useState(0);

  const handleRoomSelect = useCallback((roomId: string) => {
    if (roomId === DEBATE_ROOM_ID) {
      setDebateTheaterOpen(true);
      return;
    }
    setSelectedRoomId(roomId);
  }, []);

  const handleOpenDebateTheater = useCallback(() => {
    setDebateTheaterMode("live");
    setDebateReplayRounds(null);
    setDebateTheaterOpen(true);
  }, []);

  const handleOpenDebateReplay = useCallback(
    (rounds: DebateRound[], opts?: { synthesized?: boolean }) => {
      if (!rounds.length) return;
      setPostReplayOpen(false);
      setDebateReplayRounds(rounds);
      setDebateTheaterMode("replay");
      setDebateReplaySynthesized(opts?.synthesized ?? false);
      setDebateTheaterOpen(true);
    },
    [],
  );

  const handleCloseDebateTheater = useCallback(() => {
    setDebateTheaterOpen(false);
    setDebateTheaterMode("live");
    setDebateReplayRounds(null);
    setDebateReplaySynthesized(false);
  }, []);

  const watchlistShiftPreview = useMemo(() => {
    if (floor.runState !== "complete" || !floor.shiftTickers.length || !floor.decisions) {
      return null;
    }
    const summary = parseSummaryFromDecisions(floor.decisions.decisions ?? null);
    const shift: ShiftArchiveInput = {
      id: floor.shiftRunId ?? `preview-${floor.shiftStartedAt ?? 0}`,
      ts: floor.shiftStartedAt ?? Date.now(),
      runId: floor.shiftRunId,
      tickers: floor.shiftTickers,
      model,
      analystCount: roster.enabledKeys.length,
      summary,
      decisions: floor.decisions.decisions ?? null,
      prices: floor.decisions.current_prices ?? null,
      payload: floor.decisions,
    };
    return {
      tickers: floor.shiftTickers,
      summary,
      snapshot: buildPostSnapshot(shift),
    };
  }, [
    floor.runState,
    floor.shiftTickers,
    floor.decisions,
    floor.shiftStartedAt,
    floor.shiftRunId,
    model,
    roster.enabledKeys.length,
  ]);

  const handleFocusWireRoom = useCallback((roomId: string) => {
    setFocusRoomId(roomId);
    setFocusSeq((s) => s + 1);
  }, []);

  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const [theme, setTheme] = useState<Theme>(initialTheme);

  const [layoutSkin, setLayoutSkin] = useState<LayoutSkin>(initialLayoutSkin);



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
    persistLayoutSkin(layoutSkin);
  }, [layoutSkin]);

  const toggleLayoutSkin = useCallback(() => {
    setLayoutSkin((s) => (s === "ops" ? "gallery" : "ops"));
  }, []);



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
    if (s.watchlistDigest?.enabled != null) setWatchlistDigestEnabled(s.watchlistDigest.enabled);
    if (s.watchlistDigest?.email != null) setWatchlistDigestEmail(s.watchlistDigest.email);
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
      watchlistDigest: {
        enabled: watchlistDigestEnabled,
        cadence: "daily",
        email: watchlistDigestEmail,
        emailAddress: digestEmail || undefined,
        includeScorecardHits: true,
      },
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
    watchlistDigestEnabled,
    watchlistDigestEmail,
    userData,
  ]);



  const archivedPayloadRef = useRef<CompletePayload | null>(null);



  const debateState = floor.rooms[DEBATE_ROOM_ID];

  const debateTheaterState = useMemo(() => {
    if (debateTheaterMode === "replay" && debateReplayRounds?.length) {
      return {
        status: "DONE" as const,
        ticker: debateReplayRounds[debateReplayRounds.length - 1]?.ticker ?? null,
        message: "archived debate",
        analysis: null,
        updatedAt: 0,
        history: [],
        debateFeed: [],
        debateRounds: debateReplayRounds,
        activeDebateTicker: debateReplayRounds[0]?.ticker ?? null,
      };
    }
    return (
      debateState ?? {
        status: "STANDBY" as const,
        ticker: null,
        message: "chamber idle",
        analysis: null,
        updatedAt: 0,
        history: [],
        debateFeed: [],
      }
    );
  }, [debateTheaterMode, debateReplayRounds, debateState]);

  // The debate room flips to WORKING the moment the chamber node activates, but
  // no arguments have streamed yet. Only auto-reveal the theater once there is

  // real content (a streamed line or a completed round); otherwise an empty

  // dark modal covers the floor while the T1 agents are still deliberating.

  const debateHasContent =

    (debateState?.debateFeed?.length ?? 0) > 0 ||

    (debateState?.debateRounds?.length ?? 0) > 0;



  useEffect(() => {

    if (debateTheaterMode === "replay") return;

    if (debateState?.status === "WORKING" && debateHasContent) {

      setDebateTheaterOpen(true);

    }

    if (debateState?.status === "STANDBY" || debateState?.status === "DONE") {

      if (floor.runState !== "running") setDebateTheaterOpen(false);

    }

  }, [debateState?.status, debateHasContent, floor.runState, debateTheaterMode]);



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

        timeline: appendChairImpactTimeline(
          buildShiftTimeline(floor.rooms, floor.log, startedAt),
          floor.decisions?.chair_impact,
          startedAt,
        ),

        roomIds: Object.keys(floor.rooms),

        log: floor.log,

      },

      runId: floor.shiftRunId,

    }).catch((err) => console.error("Failed to archive shift replay:", err));

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
    if (!memoRunIdFromUrl || !userData.ready) return;
    if (floor.runState === "complete" && floor.shiftRunId === memoRunIdFromUrl && floor.decisions) {
      setMemoOpen(true);
      setActiveView("floor");
      return;
    }
    const shift = userData.shifts.find((s) => s.runId === memoRunIdFromUrl);
    if (!shift) return;

    let cancelled = false;
    (async () => {
      let payload = shift.payload;
      if (!payload && userData.cloud && session?.user?.id) {
        const supabase = getSupabase();
        if (supabase) {
          const detail = await fetchShiftDetail(supabase, session.user.id, shift.id);
          payload = detail?.payload ?? null;
        }
      }
      if (cancelled || !payload) return;
      setArchivedMemoPayload(payload);
      setArchivedMemoRunId(shift.runId ?? memoRunIdFromUrl);
      setMemoOpen(true);
      setActiveView("floor");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    memoRunIdFromUrl,
    userData.ready,
    userData.shifts,
    userData.cloud,
    session?.user?.id,
    floor.runState,
    floor.shiftRunId,
    floor.decisions,
  ]);

  const handleMemoDismiss = useCallback(() => {
    setMemoOpen(false);
    if (archivedMemoPayload) {
      setArchivedMemoPayload(null);
      setArchivedMemoRunId(null);
      setUrlState({ memoRunId: undefined });
    }
  }, [archivedMemoPayload]);

  useEffect(() => {

    if (floor.runState === "complete" && floor.decisions) {

      setMemoOpen(true);

    }

  }, [floor.runState, floor.decisions]);



  useEffect(() => {

    if (floor.runState === "idle" && !archivedMemoPayload) {

      setMemoOpen(false);
      setMemoPublishedPostId(null);

    }

    if (floor.runState === "running") {
      setArchivedMemoPayload(null);
      setArchivedMemoRunId(null);
    }

  }, [floor.runState, archivedMemoPayload]);



  useEffect(() => {
    if (!session?.user?.id || !userData.ready || !settingsHydrated) return;
    if (hasCompletedOnboarding(userData.settings)) return;
    setOnboardingOpen(true);
  }, [session?.user?.id, userData.ready, userData.settings, settingsHydrated]);

  useEffect(() => {
    if (activeView !== "floor") return;
    if (!hasCompletedOnboarding(userData.settings)) return;
    if (hasCompletedFloorTour()) return;
    const id = window.setTimeout(() => setTourOpen(true), 900);
    return () => window.clearTimeout(id);
  }, [activeView, userData.settings]);



  const handleOpenSchedule = useCallback(() => {
    setScheduleOpen(true);
  }, []);

  useEffect(() => {
    if (!authConfigured || !session) {
      setServerShiftLive(false);
      return;
    }
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void fetchActiveServerShifts().then((r) => setServerShiftLive(r.active.length > 0));
    };
    poll();
    const id = window.setInterval(poll, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authConfigured, session]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void fetchSchedules()
        .then((data) => {
          const next = pickNextSchedule(data.schedules);
          setNextScheduleChip(next ? formatNextScheduleChip(next) : null);
        })
        .catch(() => setNextScheduleChip(null));
    };
    poll();
    const id = window.setInterval(poll, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scheduleOpen]);



  useEffect(() => {

    const onKey = (e: KeyboardEvent) => {

      if (tourOpen || onboardingOpen) return;

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

      if (e.shiftKey && e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (!floor.canShelf) return;

        e.preventDefault();

        floor.shelfActiveRun();

        return;

      }

      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        e.preventDefault();

        void handleOpenSchedule();

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

        return;
      }

      if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {

        if (isTypingTarget(e.target)) return;

        if (floor.runState === "running") return;

        e.preventDefault();

        setBacktestOpen((v) => !v);

        return;
      }

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [floor.runState, floor.decisions, floor.shiftStartedAt, floor.canShelf, floor.shelfActiveRun, tourOpen, onboardingOpen, handleOpenSchedule]);



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



  const totalRooms = useMemo(() => deployRoomIds.size, [deployRoomIds]);

  const replaySnapshot = useMemo(() => {
    if (postReplayOpen && postReplaySnapshot) return postReplaySnapshot;
    if (ledgerReplayOpen && ledgerReplaySnapshot) return ledgerReplaySnapshot;
    if (!replayOpen || !floor.shiftStartedAt) return null;
    const timeline = buildShiftTimeline(floor.rooms, floor.log, floor.shiftStartedAt);
    if (!timeline.length) return null;
    const t = replayCursor || timeline[0].ts;
    return snapshotAtTime(timeline, t, Object.keys(floor.rooms));
  }, [
    postReplayOpen,
    postReplaySnapshot,
    ledgerReplayOpen,
    ledgerReplaySnapshot,
    replayOpen,
    replayCursor,
    floor.rooms,
    floor.log,
    floor.shiftStartedAt,
  ]);

  const handleOpenProfile = useCallback((handle: string) => {
    setProfileHandle(handle);
    setUrlState({ profileHandle: handle, view: "feed" });
    setActiveView("feed");
  }, []);

  const handleOpenFeedPost = useCallback((postId: string) => {
    setFeedPostId(postId);
    setActiveView("feed");
    setUrlState({ view: "feed", postId });
  }, []);

  const hasArchivedReplay = useCallback((replay: ShiftReplayArchive | null | undefined) => {
    return Boolean(replay?.timeline?.length);
  }, []);

  const ensureShiftReplayArchived = useCallback(
    async (shiftId: string, runId?: string | null) => {
      const local =
        userData.shifts.find((s) => s.id === shiftId) ??
        (runId ? userData.shifts.find((s) => s.runId === runId) : undefined);

      if (local && hasArchivedReplay(local.replay)) {
        const supabase = getSupabase();
        const userId = session?.user?.id;
        if (!userData.cloud || !supabase || !userId) return;
        const ready = await shiftHasArchivedReplay(supabase, userId, {
          shiftId: local.id,
          runId: local.runId ?? runId,
        });
        if (ready) return;
      }

      const floorMatches =
        floor.runState === "complete" &&
        floor.decisions &&
        (local?.runId === floor.shiftRunId || runId === floor.shiftRunId);

      if (floorMatches && floor.decisions) {
        const decisions = floor.decisions;
        const startedAt = floor.shiftStartedAt ?? Date.now();
        await userData.saveShift({
          tickers,
          model,
          initialCash,
          analystCount: roster.enabledCount,
          payload: decisions,
          replay: {
            shiftStartedAt: startedAt,
            timeline: appendChairImpactTimeline(
              buildShiftTimeline(floor.rooms, floor.log, startedAt),
              decisions.chair_impact,
              startedAt,
            ),
            roomIds: Object.keys(floor.rooms),
            log: floor.log,
          },
          runId: floor.shiftRunId,
        });
      }

      const supabase = getSupabase();
      const userId = session?.user?.id;
      if (!userData.cloud || !supabase || !userId) {
        const after =
          userData.shifts.find((s) => s.id === shiftId) ??
          (runId ? userData.shifts.find((s) => s.runId === runId) : undefined);
        if (after && hasArchivedReplay(after.replay)) return;
        throw new Error("Replay not archived yet. Try again in a moment.");
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const ready = await shiftHasArchivedReplay(supabase, userId, {
          shiftId,
          runId: runId ?? local?.runId,
        });
        if (ready) return;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }

      throw new Error("Replay archive not ready. Wait a moment and try again.");
    },
    [
      userData,
      session?.user?.id,
      hasArchivedReplay,
      floor.runState,
      floor.decisions,
      floor.shiftRunId,
      floor.shiftStartedAt,
      floor.rooms,
      floor.log,
      tickers,
      model,
      initialCash,
      roster.enabledCount,
    ],
  );

  const handleForkPublished = useCallback((post: FloorPost) => {
    setFeedRefreshNonce((n) => n + 1);
    setFeedPostId(post.id);
    setUrlState({ view: "feed", postId: post.id });
    setActiveView("feed");
  }, []);

  const handleMemoShareToFeed = useCallback(() => {
    if (!floor.decisions) return;
    const archived =
      userData.shifts.find((s) => s.runId && s.runId === floor.shiftRunId) ??
      userData.shifts[0];
    const decisions = floor.decisions.decisions;
    const prices = floor.decisions.current_prices ?? null;
    setShareShiftEntry({
      id: archived?.id ?? crypto.randomUUID(),
      ts: archived?.ts ?? Date.now(),
      runId: floor.shiftRunId,
      tickers: archived?.tickers ?? tickers.split(",").map((t) => t.trim()).filter(Boolean),
      model: archived?.model ?? model,
      analystCount: archived?.analystCount ?? roster.enabledCount,
      summary: archived?.summary ?? parseSummaryFromDecisions(decisions),
      decisions,
      prices,
      payload: floor.decisions,
    });
    setShareShiftOpen(true);
  }, [
    floor.decisions,
    floor.shiftRunId,
    userData.shifts,
    tickers,
    model,
    roster.enabledCount,
  ]);

  const handleReplayOnFloor = useCallback((post: FloorPost) => {
    setPostReplayPost(post);
    setPostReplayOpen(true);
    setPostReplaySnapshot(null);
    setActiveView("floor");
    setUrlState({ view: "floor", postId: undefined, profileHandle: undefined });
  }, []);

  const alpacaApiKeys = useMemo(
    () => ({
      OPENROUTER_API_KEY: openrouterKey,
      ALPACA_API_KEY_ID: alpacaKeyId,
      ALPACA_API_SECRET_KEY: alpacaSecret,
    }),
    [openrouterKey, alpacaKeyId, alpacaSecret],
  );

  const hasClientAlpacaKeys = Boolean(alpacaKeyId.trim() && alpacaSecret.trim());
  const alpacaKeysConfigured = Boolean(alpacaStatus?.configured ?? hasClientAlpacaKeys);

  const lastShiftSymbols = useMemo(() => {
    const orders = floor.decisions?.paper_trading?.orders ?? [];
    return orders
      .filter((o) => o.status !== "skipped" && o.requested_qty > 0)
      .map((o) => o.ticker);
  }, [floor.decisions?.paper_trading?.orders]);

  const executeStartShift = useCallback(() => {
    void floor.start({
      tickers,
      model,
      initialCash,
      openrouterKey,
      runRiskPipeline,
      alpacaKeyId,
      alpacaSecret,
      memoEmail,
      digestEmail,
      resendApiKey,
      enabledAgentKeys: roster.enabledKeys,
      onTickersResolved: (resolved) => setTickers(resolved.join(", ")),
    });
  }, [
    floor,
    tickers,
    model,
    initialCash,
    openrouterKey,
    runRiskPipeline,
    alpacaKeyId,
    alpacaSecret,
    memoEmail,
    digestEmail,
    resendApiKey,
    roster.enabledKeys,
  ]);

  const handleStartShift = useCallback(() => {
    executeStartShift();
  }, [executeStartShift]);

  const handleShelfOpenMemo = useCallback((session: ShiftSession) => {
    floor.restoreShelf(session.shelfId);
    setArchivedMemoPayload(null);
    setArchivedMemoRunId(null);
    setMemoOpen(true);
  }, [floor]);

  const runPaperExecute = useCallback(async () => {
    const payload = floor.decisions;
    if (!payload?.decisions) return;
    setPaperExecuting(true);
    try {
      const paper = await executeAlpacaPaper({
        decisions: payload.decisions,
        current_prices: payload.current_prices ?? undefined,
        shift_id: floor.shiftRunId ?? undefined,
        api_keys: alpacaApiKeys,
      });
      floor.applyPaperTrading(paper);
      setAlpacaPaper(true);
    } catch (e) {
      floor.applyPaperTrading({
        enabled: false,
        skipped_reason: e instanceof Error ? e.message : "Paper execution failed",
        orders: [],
        account: null,
        positions: [],
        shift_id: floor.shiftRunId ?? undefined,
      });
    } finally {
      setPaperExecuting(false);
    }
  }, [floor, alpacaApiKeys]);

  const handlePaperExecute = useCallback(() => {
    if (!alpacaPaper) return;
    const run = () => {
      void runPaperExecute();
    };
    if (hasClientAlpacaKeys && !hasAlpacaPaperConsent()) {
      pendingPaperExecuteRef.current = run;
      setConsentOpen(true);
      return;
    }
    run();
  }, [alpacaPaper, hasClientAlpacaKeys, runPaperExecute]);

  const handleOnboardingComplete = useCallback(
    (result: OnboardingResult, startShift: boolean) => {
      setTickers(result.tickers);
      roster.replaceEnabled(result.enabledAgents);
      if (result.openrouterKey) {
        setOpenrouterKey(result.openrouterKey);
        localStorage.setItem(KEY_STORAGE, result.openrouterKey);
      }
      markOnboardingCompletedLocal();
      userData.updateSettings({
        onboarding_completed: true,
        tickers: result.tickers,
        enabledAgents: result.enabledAgents,
      });
      setOnboardingOpen(false);

      if (startShift && result.openrouterKey.trim()) {
        void floor.start({
          tickers: result.tickers,
          model,
          initialCash,
          openrouterKey: result.openrouterKey.trim(),
          runRiskPipeline,
          alpacaKeyId,
          alpacaSecret,
          memoEmail,
          digestEmail,
          resendApiKey,
          enabledAgentKeys: result.enabledAgents,
          onTickersResolved: (resolved) => setTickers(resolved.join(", ")),
        });
      }
    },
    [
      roster,
      userData,
      floor,
      model,
      initialCash,
      runRiskPipeline,
      alpacaKeyId,
      alpacaSecret,
      memoEmail,
      digestEmail,
      resendApiKey,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchAlpacaStatus(alpacaApiKeys)
      .then((status) => {
        if (!cancelled) setAlpacaStatus(status);
      })
      .catch(() => {
        if (!cancelled) setAlpacaStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [alpacaApiKeys]);

  useEffect(() => {
    const summary = floor.decisions?.paper_trading?.summary;
    if (summary) setPaperDeskSummary(summary);
  }, [floor.decisions?.paper_trading]);

  useEffect(() => {
    if (activeView !== "floor" || !alpacaKeysConfigured) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchAlpacaPortfolio(alpacaApiKeys);
        if (cancelled) return;
        const equity = data.account?.equity ?? null;
        const lastEquity = data.account?.last_equity ?? null;
        const dayPnl =
          equity != null && lastEquity != null ? equity - lastEquity : null;
        setPaperDeskSummary((prev) => ({
          orders_submitted: prev?.orders_submitted ?? 0,
          orders_filled: prev?.orders_filled ?? 0,
          orders_failed: prev?.orders_failed ?? 0,
          equity,
          day_pnl: dayPnl,
        }));
      } catch {
        /* background poll — ignore */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeView, alpacaKeysConfigured, alpacaApiKeys]);

  useEffect(() => {
    const url = parseUrlState();
    if (url.view === "feed") setActiveView("feed");
    if (url.profileHandle) setProfileHandle(url.profileHandle);
    if (url.postId) {
      setFeedPostId(url.postId);
      setActiveView("feed");
    }
  }, []);

  useEffect(() => {
    if (floor.runState !== "idle" && floor.runState !== "complete") return;
    const keys = roster.enabledKeys;
    if (!keys.length) return;
    void prefetchAgentScorecards(keys);
  }, [floor.runState, roster.enabledKeys]);

  const presencePublish = presence.publish;
  const presenceClear = presence.clear;

  useEffect(() => {
    if (floor.runState === "running") return;
    void presenceClear();
  }, [floor.runState, presenceClear]);

  useEffect(() => {
    const optIn = localStorage.getItem(PRESENCE_OPT_IN_STORAGE) === "1";
    if (!optIn || !session?.user?.id || floor.runState !== "running") return;

    const payload = {
      tickers: floor.shiftTickers,
      model,
      analystCount: roster.enabledCount,
      visible: true,
    };
    void presencePublish(payload);
    const id = window.setInterval(() => void presencePublish(payload), 45_000);
    return () => {
      window.clearInterval(id);
      void presenceClear();
    };
  }, [
    floor.runState,
    floor.shiftTickers,
    model,
    roster.enabledCount,
    session?.user?.id,
    presencePublish,
    presenceClear,
  ]);

  if (embedPostId) {
    return <PostEmbedPage postId={embedPostId} inlineReplay={embedReplay} />;
  }

  if (replayPostId) {
    return <PublicReplayPage postId={replayPostId} />;
  }

  return (

    <div
      data-layout={layoutSkin}
      className="desk-shell relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-ink-900 to-ink-950 font-sans text-wire-200"
    >

      <LayoutAtmosphere skin={layoutSkin} shiftRunning={floor.runState === "running"} />



      <SystemBar

        runState={floor.runState}

        ledgerCount={userData.shifts.length}

        onOpenLedger={() => setLedgerOpen(true)}

        onOpenShortcuts={() => setShortcutsOpen(true)}

        onOpenTour={() => setTourOpen(true)}

        onOpenMemo={() => setMemoOpen(true)}

        onOpenShadowBench={() => setShadowOpen(true)}

        onOpenReplay={() => setReplayOpen(true)}

        onOpenWeather={() => setWeatherOpen(true)}

        onOpenBacktest={() => {
          setBacktestOpen(true);
        }}

        theme={theme}

        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}

        layoutSkin={layoutSkin}
        onToggleLayoutSkin={toggleLayoutSkin}

        userEmail={authConfigured ? user?.email ?? null : null}
        onSignOut={authConfigured ? signOut : undefined}
        onOpenAccountSettings={() => setAccountSettingsOpen(true)}
        planBadge={authConfigured && session ? planBadgeLabel(billing.planTier) : null}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view);
          setUrlState({ view, postId: undefined, profileHandle: undefined });
        }}
        onOpenPortfolio={() => setPortfolioOpen(true)}
        paperDeskSummary={paperDeskSummary}
        onOpenMemberDesks={() => setMemberDesksOpen(true)}
        onOpenPersonaMint={() => setPersonaMintOpen(true)}
        onOpenSchedule={() => handleOpenSchedule()}
        shelvedCount={floor.shelvedRuns.length}
        serverShiftLive={serverShiftLive}
        nextScheduleChip={nextScheduleChip}
        onOpenPost={handleOpenFeedPost}
        onOpenProfile={handleOpenProfile}
        showNotifications={authConfigured && Boolean(session)}

      />

      {activeView === "floor" && floor.shelvedRuns.length > 0 ? (
        <ShiftShelfTray
          runs={floor.shelvedRuns}
          onRestore={(id) => {
            floor.restoreShelf(id);
          }}
          onDiscard={(id) => floor.discardShelf(id)}
          onOpenMemo={handleShelfOpenMemo}
        />
      ) : null}

      {shelfToast ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[45] -translate-x-1/2 animate-rise-in rounded-lg border border-brass/40 bg-ink-950/95 px-4 py-2.5 text-[11px] tracking-[0.06em] text-brass shadow-float backdrop-blur-md">
          {shelfToast}
        </div>
      ) : null}



      {activeView === "floor" ? (
      <>
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

        runState={floor.runState}

        errorMsg={floor.errorMsg}

        resolvingTickers={floor.resolvingTickers}

        onOpenSettings={() => setAccountSettingsOpen(true)}

        onManageWatchlists={() => setWatchlistsOpen(true)}

        onStart={handleStartShift}

        onStop={floor.stop}

        onReset={floor.reset}

        onShelf={() => floor.shelfActiveRun()}

        canShelf={floor.canShelf}

        enabledAnalystCount={roster.enabledCount}

      />
      </>
      ) : null}



      <main className={`desk-main-grid relative z-0 grid min-h-0 flex-1 ${
        activeView === "feed"
          ? "grid-cols-1"
          : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]"
      }`}>

        <div data-tour="floor-map" className="desk-floor-pane relative min-h-0 min-w-0">

          {activeView === "feed" ? (
            <SocialFeed
              feedMode={feedMode}
              onFeedModeChange={setFeedMode}
              onOpenProfile={handleOpenProfile}
              onReplayOnFloor={handleReplayOnFloor}
              initialPostId={feedPostId}
              refreshNonce={feedRefreshNonce}
            />
          ) : (
          <>
          <Floor

            rooms={floor.rooms}

            enabledAgentKeys={roster.enabled}

            selectedRoomId={selectedRoomId}

            onRoomSelect={handleRoomSelect}

            onOpenDebateTheater={handleOpenDebateTheater}

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

          <ConsultationComposer
            runState={floor.runState}
            runId={floor.shiftRunId}
            tickers={tickers}
            rooms={floor.rooms}
          />

          <Suspense fallback={<PanelFallback />}>
            <DebateTheater

            state={debateTheaterState}

            open={debateTheaterOpen}

            onClose={handleCloseDebateTheater}

            theme={theme}

            runState={floor.runState}

            shiftRunId={floor.shiftRunId}

            mode={debateTheaterMode}

            replayRounds={debateReplayRounds}

            synthesized={debateReplaySynthesized}

            />
          </Suspense>

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
            onShare={(entry) => {
              setShareShiftEntry({
                id: entry.id,
                ts: entry.ts,
                runId: "runId" in entry ? entry.runId : null,
                tickers: entry.tickers,
                model: entry.model,
                analystCount: entry.analystCount,
                summary: entry.summary,
                decisions: entry.decisions,
                prices: entry.prices,
                payload: entry.payload ?? null,
              });
              setShareShiftOpen(true);
            }}
            onReplay={(entry) => {
              if (!entry.replay?.timeline?.length) return;
              setLedgerReplayArchive(entry.replay);
              setLedgerReplayMeta({
                title: entry.tickers.join(", ") || "Archived shift",
                subtitle: `${formatShiftDate(entry.ts)} · ${entry.analystCount} desks · ${entry.model.split("/").pop()}`,
                analystCount: entry.analystCount,
              });
              setLedgerReplaySnapshot(null);
              setLedgerReplayOpen(true);
              setLedgerOpen(false);
              setActiveView("floor");
            }}
            onScheduleAgain={(entry) => {
              const tickers = entry.tickers.join(", ");
              setScheduleInitialPrompt(
                `Schedule my last shift (${tickers}) weekdays at 9:35am Eastern — same roster and cash.`,
              );
              setLedgerOpen(false);
              void handleOpenSchedule();
            }}
          />
          </>
          )}

        </div>

        {activeView === "floor" ? (
        <div className="desk-wire-pane min-h-0 h-full overflow-hidden">

          <TerminalLog
            log={floor.log}
            runState={floor.runState}
            onFocusRoom={handleFocusWireRoom}
          />

        </div>
        ) : null}

      </main>



      {activeView === "floor" ? (
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

        personaAgents={personas.personaAgents}
        personaLoading={personas.loading}

      />
      ) : null}



      <DecisionsTerminal

        data={archivedMemoPayload ?? floor.decisions}

        open={memoOpen}

        onDismiss={handleMemoDismiss}

        runId={archivedMemoRunId ?? floor.shiftRunId}

        publishedPostId={memoPublishedPostId}

        onShareToFeed={handleMemoShareToFeed}

        canExecutePaper={!archivedMemoPayload && floor.runState === "complete"}

        paperExecuteEnabled={alpacaPaper}

        onPaperExecuteEnabledChange={setAlpacaPaper}

        onPaperExecute={handlePaperExecute}

        paperExecuting={paperExecuting}

        alpacaKeysConfigured={alpacaKeysConfigured}

        onOpenAccountSettings={() => setAccountSettingsOpen(true)}

      />



      <Suspense fallback={<PanelFallback />}>
        <ShadowBenchPanel
          open={shadowOpen}
          onClose={() => setShadowOpen(false)}
          payload={floor.decisions}
          shiftContext={
            floor.runState === "complete" && floor.decisions
              ? {
                  runId: floor.shiftRunId,
                  model,
                  analystCount: roster.enabledCount,
                  tsMs: floor.shiftStartedAt ?? Date.now(),
                }
              : undefined
          }
          onForkPublished={handleForkPublished}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback />}>
        <ShiftReplayPanel
          open={replayOpen}
          onClose={() => setReplayOpen(false)}
          rooms={floor.rooms}
          log={floor.log}
          shiftStartedAt={floor.shiftStartedAt}
          totalDesks={totalRooms}
          onTimeChange={setReplayCursor}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback />}>
        {ledgerReplayArchive && ledgerReplayMeta ? (
          <ShiftReplayPanel
            mode="archive"
            open={ledgerReplayOpen}
            onClose={() => {
              setLedgerReplayOpen(false);
              setLedgerReplayArchive(null);
              setLedgerReplayMeta(null);
              setLedgerReplaySnapshot(null);
            }}
            archive={ledgerReplayArchive}
            title={ledgerReplayMeta.title}
            subtitle={ledgerReplayMeta.subtitle}
            totalDesks={ledgerReplayMeta.analystCount}
            onSnapshotChange={setLedgerReplaySnapshot}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<PanelFallback />}>
        <WeatherReportPanel
          open={weatherOpen}
          onClose={() => setWeatherOpen(false)}
          payload={floor.decisions}
        />
      </Suspense>

      <BacktestPanel
        open={backtestOpen}
        onClose={() => setBacktestOpen(false)}
        tickers={tickers}
        model={model}
        openrouterKey={openrouterKey}
        enabledAnalystKeys={roster.enabled}
        enabledAnalystCount={roster.enabledCount}
        initialCapital={initialCash}
      />

      <ShortcutsPanel

        open={shortcutsOpen}

        onClose={() => setShortcutsOpen(false)}

        onRestartTour={() => setTourOpen(true)}

      />

      <FloorTour open={tourOpen} onClose={() => setTourOpen(false)} />

      <OnboardingWizard open={onboardingOpen} onComplete={handleOnboardingComplete} />

      <ShareShiftModal
        open={shareShiftOpen}
        shift={shareShiftEntry}
        onClose={() => {
          setShareShiftOpen(false);
          setShareShiftEntry(null);
        }}
        ensureReplayArchived={ensureShiftReplayArchived}
        onPublished={(postId) => {
          if (memoOpen) setMemoPublishedPostId(postId);
          setFeedRefreshNonce((n) => n + 1);
          setUrlState({ postId, view: "feed" });
          setActiveView("feed");
        }}
      />

      <AccountSettingsPanel
        open={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
        userEmail={authConfigured ? user?.email ?? null : null}
        cloudSynced={userData.cloud}
        shiftCount={userData.shifts.length}
        runState={floor.runState}
        theme={theme}
        onThemeChange={setTheme}
        model={model}
        onModelChange={setModel}
        initialCash={initialCash}
        onInitialCashChange={setInitialCash}
        openrouterKey={openrouterKey}
        onOpenrouterKeyChange={setOpenrouterKey}
        runRiskPipeline={runRiskPipeline}
        onRunRiskPipelineChange={setRunRiskPipeline}
        alpacaPaper={alpacaPaper}
        onAlpacaPaperChange={setAlpacaPaper}
        alpacaKeyId={alpacaKeyId}
        onAlpacaKeyIdChange={setAlpacaKeyId}
        alpacaSecret={alpacaSecret}
        onAlpacaSecretChange={setAlpacaSecret}
        memoEmail={memoEmail}
        onMemoEmailChange={setMemoEmail}
        digestEmail={digestEmail}
        onDigestEmailChange={setDigestEmail}
        watchlistDigestEnabled={watchlistDigestEnabled}
        onWatchlistDigestEnabledChange={setWatchlistDigestEnabled}
        watchlistDigestEmail={watchlistDigestEmail}
        onWatchlistDigestEmailChange={setWatchlistDigestEmail}
        resendApiKey={resendApiKey}
        onResendApiKeyChange={setResendApiKey}
        onSignOut={authConfigured ? signOut : undefined}
        billingStatus={billing.status}
        billingLoading={billing.loading}
        onBillingRefresh={() => void billing.refresh()}
      />

      <PaperTradingConsentModal
        open={consentOpen}
        onAccept={() => {
          setAlpacaPaperConsent();
          setConsentOpen(false);
          pendingPaperExecuteRef.current?.();
          pendingPaperExecuteRef.current = null;
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingPaperExecuteRef.current = null;
        }}
      />

      <ScheduleDeskPanel
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        tickers={tickers}
        enabledAgentKeys={roster.enabledKeys}
        initialPrompt={scheduleInitialPrompt}
        onClearInitialPrompt={() => setScheduleInitialPrompt(null)}
      />

      <PersonaMintWizard
        open={personaMintOpen}
        onClose={() => setPersonaMintOpen(false)}
        onMinted={async (agentKey) => {
          await personas.refresh();
          if (!roster.enabled.has(agentKey)) roster.toggle(agentKey);
        }}
      />

      <AlpacaPortfolioPanel
        open={portfolioOpen}
        onClose={() => setPortfolioOpen(false)}
        apiKeys={alpacaApiKeys}
        lastShiftSymbols={lastShiftSymbols}
        onOpenSettings={() => setAccountSettingsOpen(true)}
      />

      <MemberDesksPanel
        open={memberDesksOpen}
        onClose={() => setMemberDesksOpen(false)}
        enabledAgents={[...roster.enabled]}
        model={model}
        onApplyDesk={(agents, deskModel) => {
          roster.replaceEnabled(agents);
          if (deskModel) setModel(deskModel);
        }}
      />

      <WatchlistPanel
        open={watchlistsOpen}
        onClose={() => setWatchlistsOpen(false)}
        lastShiftPreview={watchlistShiftPreview}
      />

      <SocialOverlays
        profileHandle={profileHandle}
        onCloseProfile={() => {
          setProfileHandle(null);
          setUrlState({ profileHandle: undefined });
        }}
        postReplayPost={postReplayPost}
        postReplayOpen={postReplayOpen}
        onClosePostReplay={() => {
          setPostReplayOpen(false);
          setPostReplayPost(null);
          setPostReplaySnapshot(null);
        }}
        onPostReplaySnapshot={setPostReplaySnapshot}
        onOpenDebateTheater={handleOpenDebateReplay}
      />

    </div>

  );

}


