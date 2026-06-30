import { useEffect, useState, lazy, Suspense } from "react";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { FloorClosed } from "./components/FloorClosed";
import { AgentLeaderboard } from "./components/leaderboard/AgentLeaderboard";
import { useAuth } from "./contexts/AuthContext";
import { isFloorOpen } from "./lib/floorHours";
import { isPublicAppRoute } from "./lib/floorSocial/useAppUrl";

const Landing = lazy(() =>
  import("./components/Landing").then((m) => ({ default: m.Landing })),
);

const TermsPage = lazy(() =>
  import("./components/legal/TermsPage").then((m) => ({ default: m.TermsPage })),
);

const PrivacyPage = lazy(() =>
  import("./components/legal/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);

const PricingPage = lazy(() =>
  import("./components/PricingPage").then((m) => ({ default: m.PricingPage })),
);

const LEGAL_FALLBACK = (
  <div className="flex min-h-screen items-center justify-center bg-ink-950 text-wire-500">
    <p className="font-mono text-[11px] uppercase tracking-[0.34em]">Loading…</p>
  </div>
);

const ENTERED_STORAGE = "floor.entered";

/** Gates the marketing landing page in front of the live app for the session. */
export function Root() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (path === "/leaderboard" || path.endsWith("/leaderboard")) {
    return <AgentLeaderboard />;
  }
  if (path === "/terms" || path.endsWith("/terms")) {
    return (
      <Suspense fallback={LEGAL_FALLBACK}>
        <TermsPage />
      </Suspense>
    );
  }
  if (path === "/privacy" || path.endsWith("/privacy")) {
    return (
      <Suspense fallback={LEGAL_FALLBACK}>
        <PrivacyPage />
      </Suspense>
    );
  }
  if (path === "/pricing" || path.endsWith("/pricing")) {
    return (
      <Suspense fallback={LEGAL_FALLBACK}>
        <PricingPage
          onEnter={() => {
            sessionStorage.setItem(ENTERED_STORAGE, "1");
            window.location.href = "/";
          }}
        />
      </Suspense>
    );
  }

  const { configured, loading, session } = useAuth();
  const publicRoute = isPublicAppRoute();
  const [entered, setEntered] = useState<boolean>(
    () => publicRoute || sessionStorage.getItem(ENTERED_STORAGE) === "1",
  );
  const [floorOpen, setFloorOpen] = useState(() => isFloorOpen());

  useEffect(() => {
    const tick = () => setFloorOpen(isFloorOpen());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (publicRoute) {
    return <App />;
  }

  if (entered && !floorOpen) {
    return <FloorClosed />;
  }

  if (!entered) {
    return (
      <Suspense fallback={LEGAL_FALLBACK}>
        <Landing
          onEnter={() => {
            sessionStorage.setItem(ENTERED_STORAGE, "1");
            setEntered(true);
          }}
        />
      </Suspense>
    );
  }

  if (configured && !loading && !session) {
    return <AuthGate />;
  }

  if (configured && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-wire-400">
        <p className="font-mono text-[11px] uppercase tracking-[0.34em]">
          Verifying clearance…
        </p>
      </div>
    );
  }

  return <App />;
}
