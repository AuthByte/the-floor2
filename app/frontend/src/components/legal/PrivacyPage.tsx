import { LegalPageShell, LegalSection } from "./LegalPageShell";

export function PrivacyPage() {
  return (
    <LegalPageShell kicker="Trust" title="Privacy Policy">
      <LegalSection title="1. Overview">
        <p>
          This Privacy Policy describes how THE FLOOR (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects,
          uses, and shares information when you use our website and application. We build for
          transparency: simulation and research first, with optional cloud sync and paid tiers.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>
          <strong>Account data (Supabase Auth).</strong> When you sign up, Supabase stores your
          email address, authentication identifiers, and session tokens. Passwords are hashed by
          Supabase; we do not store plaintext passwords.
        </p>
        <p>
          <strong>Shift and usage data.</strong> When you run a shift, we process tickers, model
          choices, agent outputs, decisions, replay timelines, and related metadata. With cloud
          sync enabled, shift history, watchlists, and settings are stored in our Supabase
          Postgres database tied to your user ID. Without an account, much of this stays in your
          browser&apos;s local storage only.
        </p>
        <p>
          <strong>Social and public content.</strong> If you publish posts, comments, reactions, or
          presence on the floor feed, that content and your display handle may be visible to other
          users.
        </p>
        <p>
          <strong>Billing data (Stripe).</strong> If you purchase a subscription or day pass,
          Stripe processes payment card details and billing contact information. We receive
          subscription status, customer IDs, and invoice metadata — not your full card number.
        </p>
        <p>
          <strong>API keys you provide.</strong> OpenRouter, Alpaca, and similar keys entered in
          account settings are stored locally in your browser by default. They are sent to our
          backend only when needed to run a shift or paper execution and are not logged in
          plaintext.
        </p>
        <p>
          <strong>Technical logs.</strong> We may collect standard server logs (IP address, user
          agent, request timing) for security, rate limiting, and debugging.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <ul className="list-disc space-y-2 pl-5">
          <li>Authenticate you and sync your shift ledger across devices</li>
          <li>Run simulations, replays, scorecards, and optional paper order submission</li>
          <li>Enforce subscription entitlements and process payments via Stripe</li>
          <li>Operate social features (feed, notifications, leaderboards)</li>
          <li>Send optional shift memos or watchlist digests if you configure email</li>
          <li>Improve reliability, prevent abuse, and comply with law</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Third-party services">
        <p>We rely on service providers that process data on our behalf, including:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Supabase</strong> — authentication, database, and optional realtime presence
          </li>
          <li>
            <strong>Stripe</strong> — payment processing and subscription management
          </li>
          <li>
            <strong>OpenRouter</strong> — LLM inference when you supply a key
          </li>
          <li>
            <strong>Alpaca</strong> — optional paper brokerage execution
          </li>
          <li>Market data, news, and email providers as configured in your account</li>
        </ul>
        <p>
          Each provider has its own privacy policy. We encourage you to review them before
          connecting accounts.
        </p>
      </LegalSection>

      <LegalSection title="5. Retention and deletion">
        <p>
          Shift archives and settings persist while your account is active. You may delete local
          data by clearing browser storage. To request account deletion or export of cloud-stored
          data, contact us at the address below. We may retain limited billing records as required
          for tax and fraud prevention.
        </p>
      </LegalSection>

      <LegalSection title="6. Security">
        <p>
          We use HTTPS, row-level security in Supabase where applicable, and industry-standard
          practices to protect data in transit and at rest. No system is perfectly secure; protect
          your device, session, and API keys accordingly.
        </p>
      </LegalSection>

      <LegalSection title="7. Your choices">
        <p>
          You can use THE FLOOR without cloud sync or paid billing. You may opt out of social
          presence, decline paper trading, and cancel Stripe subscriptions at any time through
          account settings or the Stripe customer portal.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>
          The Service is not directed to children under 13 (or the minimum age in your
          jurisdiction). We do not knowingly collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes and contact">
        <p>
          We will post updates on this page with a revised &ldquo;last updated&rdquo; date.
          Material changes may also be communicated in-app or by email where appropriate.
        </p>
        <p>
          Privacy questions:{" "}
          <a
            href="mailto:privacy@thefloor.app"
            className="underline decoration-[rgba(18,17,14,0.25)] underline-offset-2 hover:opacity-70"
            style={{ color: "#12110E" }}
          >
            privacy@thefloor.app
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
