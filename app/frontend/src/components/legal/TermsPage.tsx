import { LegalPageShell, LegalSection } from "./LegalPageShell";

export function TermsPage() {
  return (
    <LegalPageShell kicker="Legal" title="Terms of Service">
      <LegalSection title="1. Agreement">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of THE FLOOR
          (&ldquo;the Service&rdquo;), operated by AuthByte. By creating an account, entering the
          floor, or otherwise using the Service, you agree to these Terms. If you do not agree, do
          not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Simulation only — not investment advice">
        <p>
          THE FLOOR is a <strong>simulation and research tool</strong>. Agent outputs, committee
          debates, boss memos, price targets, direction calls, scorecards, and leaderboards are
          generated for educational and entertainment purposes. They are{" "}
          <strong>not investment advice</strong>, financial advice, tax advice, or a recommendation
          to buy, sell, or hold any security or other asset.
        </p>
        <p>
          We do not provide personalized investment recommendations. You are solely responsible for
          your own investment decisions and should consult a qualified financial professional before
          acting on any information you encounter in the Service.
        </p>
      </LegalSection>

      <LegalSection title="3. AI-generated content">
        <p>
          The Service uses large language models (routed through your OpenRouter account) to
          simulate investor personas. AI outputs may be inaccurate, incomplete, outdated, biased, or
          fabricated. Do not rely on them for trading or allocation decisions.
        </p>
      </LegalSection>

      <LegalSection title="4. Paper trading disclaimer">
        <p>
          Optional Alpaca <strong>paper</strong> execution submits simulated market orders to your
          Alpaca paper account only. Paper trading does not involve real money, does not reflect
          live market fills or slippage, and{" "}
          <strong>past paper performance does not guarantee future results</strong>.
        </p>
        <p>
          You must use paper API credentials only. Enabling paper execution requires explicit
          in-app consent. THE FLOOR is not a broker-dealer and does not execute live trades on your
          behalf.
        </p>
      </LegalSection>

      <LegalSection title="5. Your API keys and data">
        <p>
          You may supply your own OpenRouter, Alpaca, and other third-party API keys. Keys you enter
          in the browser are stored locally on your device unless you opt into cloud sync. You are
          responsible for key security, usage charges from third-party providers, and compliance with
          their terms.
        </p>
        <p>
          Market data, filings, and news feeds are provided by third parties and may be delayed,
          incomplete, or subject to their own licensing restrictions.
        </p>
      </LegalSection>

      <LegalSection title="6. Accounts and acceptable use">
        <p>
          When Supabase auth is enabled, you must provide accurate account information and keep
          credentials secure. You may not misuse the Service, attempt to bypass usage limits,
          scrape or resell outputs at scale, harass other members, or use the Service for unlawful
          market manipulation or insider trading.
        </p>
      </LegalSection>

      <LegalSection title="7. Subscriptions and billing">
        <p>
          Paid tiers (Pro, day passes, and similar offerings) are processed by Stripe. Prices,
          entitlements, and renewal terms are shown at checkout. Subscriptions renew automatically
          until cancelled in your account billing settings or through the Stripe customer portal.
          Refunds are handled according to the policy displayed at purchase time.
        </p>
      </LegalSection>

      <LegalSection title="8. Social features">
        <p>
          If you publish shifts, posts, or comments to the floor feed, you grant us a license to
          display that content to other users. You represent that you have the right to share what
          you post. Public replays and scorecards are illustrative — not endorsements of any
          security.
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimers and limitation of liability">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, AUTHBYTE AND ITS AFFILIATES ARE NOT LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR
          GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR RELIANCE ON SIMULATED OUTPUTS.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes and contact">
        <p>
          We may update these Terms from time to time. Material changes will be reflected on this
          page with an updated date. Continued use after changes constitutes acceptance.
        </p>
        <p>
          Questions:{" "}
          <a
            href="mailto:legal@thefloor.app"
            className="underline decoration-[rgba(18,17,14,0.25)] underline-offset-2 hover:opacity-70"
            style={{ color: "#12110E" }}
          >
            legal@thefloor.app
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
