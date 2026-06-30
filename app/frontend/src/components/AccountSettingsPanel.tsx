import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  createBillingPortal,
  createCheckout,
  planDisplayName,
  type BillingStatus,
  type CheckoutPlan,
} from "../lib/billing";
import { OPENROUTER_MODELS } from "../lib/models";
import { getSupabase } from "../lib/supabase";
import { fetchProfile, updateDisplayName } from "../lib/floorSocial/api";
import type { RunState } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  userEmail?: string | null;
  cloudSynced: boolean;
  shiftCount: number;
  runState: RunState;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  model: string;
  onModelChange: (model: string) => void;
  initialCash: number;
  onInitialCashChange: (cash: number) => void;
  openrouterKey: string;
  onOpenrouterKeyChange: (key: string) => void;
  runRiskPipeline: boolean;
  onRunRiskPipelineChange: (on: boolean) => void;
  alpacaPaper: boolean;
  onAlpacaPaperChange: (on: boolean) => void;
  alpacaKeyId: string;
  onAlpacaKeyIdChange: (key: string) => void;
  alpacaSecret: string;
  onAlpacaSecretChange: (secret: string) => void;
  memoEmail: boolean;
  onMemoEmailChange: (on: boolean) => void;
  digestEmail: string;
  onDigestEmailChange: (email: string) => void;
  watchlistDigestEnabled: boolean;
  onWatchlistDigestEnabledChange: (on: boolean) => void;
  watchlistDigestEmail: boolean;
  onWatchlistDigestEmailChange: (on: boolean) => void;
  resendApiKey: string;
  onResendApiKeyChange: (key: string) => void;
  onSignOut?: () => void;
  billingStatus?: BillingStatus | null;
  billingLoading?: boolean;
  onBillingRefresh?: () => void;
}
function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-4 rounded border border-wire-800/80 bg-ink-900/40 px-3 py-2.5 transition hover:border-wire-700 ${disabled ? "opacity-50" : ""}`}
    >
      <span className="min-w-0">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-wire-300">
          {label}
        </span>
        {hint ? (
          <span className="mt-1 block text-[10px] leading-relaxed text-wire-600">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brass disabled:cursor-not-allowed"
      />
    </label>
  );
}
function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-wire-600">
        {children}
      </span>
      {hint ? <span className="text-[9px] uppercase tracking-[0.18em] text-wire-700">{hint}</span> : null}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded border border-wire-800 bg-ink-900 px-3 py-2 focus-within:border-brass/50">
      <input
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCorrect="off"
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-wire-200 placeholder-wire-700 outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-wire-600 transition hover:text-brass"
      >
        {revealed ? "hide" : "show"}
      </button>
    </div>
  );
}
/** Slide-over for account profile, security, and synced desk defaults. */
export function AccountSettingsPanel({
  open,
  onClose,
  userEmail,
  cloudSynced,
  shiftCount,
  runState,
  theme,
  onThemeChange,
  model,
  onModelChange,
  initialCash,
  onInitialCashChange,
  openrouterKey,
  onOpenrouterKeyChange,
  runRiskPipeline,
  onRunRiskPipelineChange,
  alpacaPaper,
  onAlpacaPaperChange,
  alpacaKeyId,
  onAlpacaKeyIdChange,
  alpacaSecret,
  onAlpacaSecretChange,
  memoEmail,
  onMemoEmailChange,
  digestEmail,
  onDigestEmailChange,
  watchlistDigestEnabled,
  onWatchlistDigestEnabledChange,
  watchlistDigestEmail,
  onWatchlistDigestEmailChange,
  resendApiKey,
  onResendApiKeyChange,
  onSignOut,
  billingStatus = null,
  billingLoading = false,
  onBillingRefresh,
}: Props) {
  const { configured, updatePassword } = useAuth();
  const signedIn = Boolean(userEmail && configured);
  const shiftRunning = runState === "running";
  const [activeTab, setActiveTab] = useState<"account" | "billing">("account");
  const [portalBusy, setPortalBusy] = useState(false);
  const [billingErr, setBillingErr] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [displayNameBusy, setDisplayNameBusy] = useState(false);
  const [displayNameMsg, setDisplayNameMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg(null);
      setPasswordErr(null);
      setDisplayNameMsg(null);
      setActiveTab("account");
      setBillingErr(null);
      return;
    }
    if (!signedIn) return;
    const supabase = getSupabase();
    if (!supabase || !userEmail) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (!id) return;
      const profile = await fetchProfile(supabase, id);
      if (profile) setDisplayName(profile.displayName);
    })();
  }, [open, signedIn, userEmail]);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordErr(null);
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordErr("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    const err = await updatePassword(newPassword);
    setPasswordBusy(false);
    if (err) {
      setPasswordErr(err);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMsg("Password updated.");
  }

  async function onOpenPortal() {
    setBillingErr(null);
    setPortalBusy(true);
    try {
      const { url } = await createBillingPortal(window.location.href);
      window.location.href = url;
    } catch (e) {
      setBillingErr(e instanceof Error ? e.message : "Could not open billing portal.");
      setPortalBusy(false);
    }
  }

  async function onUpgrade(plan: CheckoutPlan) {
    setBillingErr(null);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckout(plan, {
        successUrl: `${origin}/?checkout=success`,
        cancelUrl: origin,
      });
      window.location.href = url;
    } catch (e) {
      setBillingErr(e instanceof Error ? e.message : "Checkout failed.");
    }
  }

  const tier = billingStatus?.plan_tier ?? "free";
  const shiftsUsed = billingStatus?.shifts_used_this_period ?? 0;
  const shiftsLimit = billingStatus?.shifts_limit;
  const usageLabel =
    shiftsLimit == null
      ? `${shiftsUsed} shifts this period · unlimited`
      : `${shiftsUsed} / ${shiftsLimit} shifts this period`;

  async function onDisplayNameSave() {
    setDisplayNameMsg(null);
    const supabase = getSupabase();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const userId = data.user?.id;
    if (!supabase || !userId || !displayName.trim()) return;
    setDisplayNameBusy(true);
    try {
      await updateDisplayName(supabase, userId, displayName);
      setDisplayNameMsg("Display name saved.");
    } catch {
      setDisplayNameMsg("Could not save display name.");
    } finally {
      setDisplayNameBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="desk-backdrop absolute inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/55 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-brass/25 bg-ink-950 shadow-float"
        role="dialog"
        aria-labelledby="account-settings-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-wire-800 px-5 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brass/50 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass/70">
                clearance desk
              </div>
              <h2
                id="account-settings-title"
                className="mt-1 font-display text-base font-bold tracking-wide text-wire-100"
              >
                Account Settings
              </h2>
              <p className="mt-1 text-[11px] text-wire-500">
                {cloudSynced
                  ? "Defaults sync to your account across devices."
                  : "Defaults saved on this browser."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded border border-wire-700 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-wire-400 transition hover:border-brass/60 hover:text-brass"
            >
              esc
            </button>
          </div>
          {signedIn ? (
            <div className="mt-4 flex gap-2">
              {(["account", "billing"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "billing") onBillingRefresh?.();
                  }}
                  className={`flex-1 rounded border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                    activeTab === tab
                      ? "border-brass/50 bg-brass/10 text-brass"
                      : "border-wire-800 text-wire-500 hover:border-wire-600 hover:text-wire-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {activeTab === "billing" && signedIn ? (
            <section>
              <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.32em] text-brass/80">
                Billing
              </h3>
              <div className="space-y-3 rounded border border-wire-800/80 bg-ink-900/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <FieldLabel>Current plan</FieldLabel>
                    <p className="font-mono text-[14px] font-semibold text-wire-100">
                      {billingLoading ? "…" : planDisplayName(tier)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] ${
                      tier === "free"
                        ? "border-wire-700 bg-ink-900 text-wire-500"
                        : "border-brass/40 bg-brass/10 text-brass"
                    }`}
                  >
                    {tier === "free" ? "free" : "pro"}
                  </span>
                </div>

                {billingStatus?.entitlement_expires_at && tier === "day_pass" ? (
                  <p className="font-mono text-[10px] text-wire-500">
                    Expires{" "}
                    {new Date(billingStatus.entitlement_expires_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}

                <div className="border-t border-wire-800/60 pt-3">
                  <FieldLabel>Shift usage</FieldLabel>
                  <p className="font-mono text-[12px] text-wire-300">
                    {billingLoading ? "Loading…" : usageLabel}
                  </p>
                  {shiftsLimit != null && shiftsLimit > 0 ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-brass transition-all"
                        style={{
                          width: `${Math.min(100, (shiftsUsed / shiftsLimit) * 100)}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                {billingStatus?.has_subscription ? (
                  <button
                    type="button"
                    onClick={() => void onOpenPortal()}
                    disabled={portalBusy}
                    className="w-full rounded border border-brass/50 bg-brass/10 px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass transition hover:bg-brass/20 disabled:opacity-40"
                  >
                    {portalBusy ? "Opening…" : "Manage subscription"}
                  </button>
                ) : tier === "free" ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void onUpgrade("pro_monthly")}
                      className="w-full rounded border border-brass/50 bg-brass/10 px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass transition hover:bg-brass/20"
                    >
                      Upgrade to Pro
                    </button>
                    <a
                      href="/pricing"
                      className="block text-center font-mono text-[10px] uppercase tracking-[0.18em] text-wire-500 transition hover:text-brass"
                    >
                      View all plans
                    </a>
                  </div>
                ) : null}

                {billingErr ? (
                  <p className="font-mono text-[10px] text-siren">{billingErr}</p>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="space-y-6">
          {/* Profile & sync */}
          <section>
            <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.32em] text-brass/80">
              Profile
            </h3>
            <div className="space-y-3 rounded border border-wire-800/80 bg-ink-900/30 p-3">
              <div>
                <FieldLabel>Email</FieldLabel>
                <p className="truncate font-mono text-[12px] text-wire-200">
                  {userEmail ?? "Local session (not signed in)"}
                </p>
              </div>
              {signedIn ? (
                <div>
                  <FieldLabel>Display name</FieldLabel>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={48}
                      className="min-w-0 flex-1 rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
                      placeholder="How you appear on the feed"
                    />
                    <button
                      type="button"
                      onClick={() => void onDisplayNameSave()}
                      disabled={displayNameBusy || !displayName.trim()}
                      className="shrink-0 rounded border border-brass/50 bg-brass/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-brass disabled:opacity-40"
                    >
                      save
                    </button>
                  </div>
                  {displayNameMsg ? (
                    <p className="mt-1 font-mono text-[10px] text-phos">{displayNameMsg}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-wire-800/60 pt-3">
                <div>
                  <FieldLabel>Archive sync</FieldLabel>
                  <p className="font-mono text-[11px] text-wire-400">
                    {shiftCount} shift{shiftCount === 1 ? "" : "s"} archived
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] ${
                    cloudSynced
                      ? "border-phos/40 bg-phos/10 text-phos"
                      : "border-wire-700 bg-ink-900 text-wire-500"
                  }`}
                >
                  {cloudSynced ? "cloud" : "local"}
                </span>
              </div>
            </div>
          </section>

          {signedIn ? (
            <section>
              <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.32em] text-brass/80">
                Security
              </h3>
              <form onSubmit={onPasswordSubmit} className="space-y-3">
                <div>
                  <FieldLabel>New password</FieldLabel>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <FieldLabel>Confirm password</FieldLabel>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
                    placeholder="••••••••"
                  />
                </div>
                {passwordErr ? (
                  <p className="font-mono text-[10px] text-siren">{passwordErr}</p>
                ) : null}
                {passwordMsg ? (
                  <p className="font-mono text-[10px] text-phos">{passwordMsg}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={passwordBusy || !newPassword}
                  className="rounded border border-brass/50 bg-brass/10 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass transition hover:bg-brass/20 disabled:opacity-40"
                >
                  {passwordBusy ? "Updating…" : "Update password"}
                </button>
              </form>
            </section>
          ) : null}

          <section>
            <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.32em] text-brass/80">
              API keys &amp; integrations
            </h3>
            <div className="space-y-3">
              <div>
                <FieldLabel hint="required for shifts">OpenRouter key</FieldLabel>
                <SecretInput
                  value={openrouterKey}
                  onChange={onOpenrouterKeyChange}
                  placeholder="sk-or-v1-…"
                  disabled={shiftRunning}
                />
              </div>

              <Toggle
                label="Risk pipeline"
                hint="Forge → research → scenarios → watchtower before investors."
                checked={runRiskPipeline}
                onChange={onRunRiskPipelineChange}
                disabled={shiftRunning}
              />
              <Toggle
                label="Alpaca paper"
                hint="Default on for boss memo · submit orders after you sign off."
                checked={alpacaPaper}
                onChange={onAlpacaPaperChange}
                disabled={shiftRunning}
              />
              {alpacaPaper ? (
                <div className="space-y-3 rounded border border-wire-800/60 bg-ink-900/20 p-3">
                  <div>
                    <FieldLabel hint="or .env">Alpaca key id</FieldLabel>
                    <SecretInput
                      value={alpacaKeyId}
                      onChange={onAlpacaKeyIdChange}
                      placeholder="PK…"
                      disabled={shiftRunning}
                    />
                  </div>
                  <div>
                    <FieldLabel hint="paper only">Alpaca secret</FieldLabel>
                    <SecretInput
                      value={alpacaSecret}
                      onChange={onAlpacaSecretChange}
                      placeholder="••••"
                      disabled={shiftRunning}
                    />
                  </div>
                </div>
              ) : null}

              <Toggle
                label="Email boss memo"
                hint="Resend digest when shift completes."
                checked={memoEmail}
                onChange={onMemoEmailChange}
                disabled={shiftRunning}
              />
              {memoEmail ? (
                <div className="space-y-3 rounded border border-wire-800/60 bg-ink-900/20 p-3">
                  <div>
                    <FieldLabel hint="Resend test mode">Your email</FieldLabel>
                    <input
                      type="email"
                      value={digestEmail}
                      onChange={(e) => onDigestEmailChange(e.target.value)}
                      placeholder="you@example.com"
                      disabled={shiftRunning}
                      className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50 disabled:opacity-50"
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-wire-600">
                    With the default test sender{" "}
                    <span className="font-mono text-wire-500">onboarding@resend.dev</span>, mail
                    only delivers to the email you signed up with on Resend. Verify a domain to
                    send anywhere.
                  </p>
                  <div>
                    <FieldLabel hint="or .env">Resend API key</FieldLabel>
                    <SecretInput
                      value={resendApiKey}
                      onChange={onResendApiKeyChange}
                      placeholder="re_…"
                      disabled={shiftRunning}
                    />
                  </div>
                </div>
              ) : null}

              <Toggle
                label="Watchlist digest"
                hint="Daily in-app rollup of shifts and posts on your saved watchlists."
                checked={watchlistDigestEnabled}
                onChange={onWatchlistDigestEnabledChange}
                disabled={shiftRunning || !signedIn}
              />
              {watchlistDigestEnabled ? (
                <div className="space-y-3 rounded border border-wire-800/60 bg-ink-900/20 p-3">
                  <Toggle
                    label="Email digest"
                    hint="Optional daily email summary — separate from boss memo."
                    checked={watchlistDigestEmail}
                    onChange={onWatchlistDigestEmailChange}
                    disabled={shiftRunning}
                  />
                  {watchlistDigestEmail ? (
                    <p className="text-[10px] leading-relaxed text-wire-600">
                      Uses your boss memo email above unless you set a dedicated address in
                      cloud settings later.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.32em] text-brass/80">
              Desk defaults
            </h3>
            <div className="space-y-3">
              <div>
                <FieldLabel>Theme</FieldLabel>
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onThemeChange(t)}
                      className={`flex-1 rounded border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                        theme === t
                          ? "border-brass/50 bg-brass/10 text-brass"
                          : "border-wire-800 text-wire-500 hover:border-wire-600 hover:text-wire-300"
                      }`}
                    >
                      {t === "dark" ? "After hours" : "Paper"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>Default model</FieldLabel>
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
                >
                  {OPENROUTER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.hint}
                    </option>
                  ))}
                  {!OPENROUTER_MODELS.some((m) => m.id === model) ? (
                    <option value={model}>{model}</option>
                  ) : null}
                </select>
              </div>

              <div>
                <FieldLabel>Starting cash</FieldLabel>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={initialCash}
                  onChange={(e) => onInitialCashChange(Number(e.target.value) || 100000)}
                  className="w-full rounded border border-wire-800 bg-ink-900 px-3 py-2 font-mono text-[12px] text-wire-200 outline-none transition focus:border-brass/50"
                />
              </div>
            </div>
          </section>
          </div>
          )}
        </div>

        {onSignOut ? (
          <footer className="shrink-0 border-t border-wire-800 px-5 py-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                void onSignOut();
              }}
              className="w-full rounded border border-siren/40 bg-siren/5 px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-siren transition hover:bg-siren/15"
            >
              Sign out
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
