import { useState } from "react";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { Landing } from "./components/Landing";
import { useAuth } from "./contexts/AuthContext";

const ENTERED_STORAGE = "floor.entered";

/** Gates the marketing landing page in front of the live app for the session. */
export function Root() {
  const { configured, loading, session } = useAuth();
  const [entered, setEntered] = useState<boolean>(
    () => sessionStorage.getItem(ENTERED_STORAGE) === "1",
  );

  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          sessionStorage.setItem(ENTERED_STORAGE, "1");
          setEntered(true);
        }}
      />
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
