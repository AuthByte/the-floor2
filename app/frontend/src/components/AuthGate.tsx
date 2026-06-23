import { FormEvent, useState } from "react";
import { Scanlines } from "./Scanlines";
import { useAuth } from "../contexts/AuthContext";

type Mode = "signin" | "signup";

/** Credential gate after the marketing landing — matches the live floor chrome. */
export function AuthGate() {
  const { loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-wire-400">
        <p className="font-mono text-[11px] uppercase tracking-[0.34em]">
          Verifying clearance…
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const err =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === "signup") {
      setNotice(
        "Account created. If email confirmation is enabled, check your inbox before signing in.",
      );
      setMode("signin");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 py-12 text-wire-200">
      <Scanlines />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.38em] text-brass">
            Clearance required
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[0.12em] text-wire-100">
            THE FLOOR
          </h1>
          <p className="mt-2 font-mono text-[11px] text-wire-500">
            Sign in to enter the after-hours committee.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[3px] border border-wire-800/90 bg-ink-900/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        >
          <div className="mb-4 flex gap-1 rounded border border-wire-800/80 bg-ink-950/60 p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 rounded-[2px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.28em] transition ${
                  mode === m
                    ? "bg-brass/15 text-brass"
                    : "text-wire-500 hover:text-wire-300"
                }`}
              >
                {m === "signin" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.32em] text-wire-600">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[2px] border border-wire-700 bg-ink-950 px-3 py-2.5 font-mono text-sm text-wire-100 outline-none transition placeholder:text-wire-700 focus:border-brass/50"
              placeholder="you@firm.com"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.32em] text-wire-600">
              Password
            </span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[2px] border border-wire-700 bg-ink-950 px-3 py-2.5 font-mono text-sm text-wire-100 outline-none transition placeholder:text-wire-700 focus:border-brass/50"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="mb-4 rounded border border-siren/30 bg-siren/10 px-3 py-2 font-mono text-[11px] text-siren">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mb-4 rounded border border-phos/30 bg-phos/10 px-3 py-2 font-mono text-[11px] text-phos">
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[2px] border border-brass/40 bg-gradient-to-b from-brass/20 to-brass/5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.34em] text-brass transition hover:border-brass/70 hover:from-brass/30 disabled:opacity-50"
          >
            {busy ? "Processing…" : mode === "signin" ? "Enter the floor" : "Request clearance"}
          </button>
        </form>
      </div>
    </div>
  );
}
