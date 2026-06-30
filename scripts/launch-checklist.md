# THE FLOOR — production launch checklist

Use this before pointing customers at a live deployment.

## 1. Environment

### Backend (`.env` or secrets manager)

- [ ] `ENV=production`
- [ ] `SUPABASE_URL` — project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — required for `/public/*` reads and server writes
- [ ] `SUPABASE_ANON_KEY` — optional on backend; used if service role absent
- [ ] `SCORING_CRON_SECRET` — long random string for `POST /hedge-fund/scoring/run`
- [ ] `CORS_ORIGINS` — comma-separated frontend origins (no trailing slashes)
- [ ] `TRUST_PROXY=true` when behind ALB, nginx, or Cloudflare (rate-limit IP resolution)
- [ ] `OPENROUTER_API_KEY` (or other LLM keys) — shifts will not run without a model provider
- [ ] Optional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` when billing is live
- [ ] Optional: `RESEND_API_KEY`, Alpaca keys, market-data API keys

### Frontend (`app/frontend/.env` on Vercel)

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_API_URL` — FastAPI origin (e.g. `https://api.yourdomain.com`)
- [ ] `VITE_APP_URL` — canonical app origin for share/embed links
- [ ] Do **not** set `VITE_FLOOR_ALWAYS_OPEN=true` in production unless you intend 24/7 floor hours

## 2. Supabase

- [ ] RLS policies applied for `floor_posts`, `shifts`, profiles, reactions, comments
- [ ] Storage bucket `shift-artifacts` (or `SUPABASE_ARTIFACT_BUCKET`) exists and policies allow signed uploads
- [ ] Auth redirect URLs include production `VITE_APP_URL`
- [ ] Service role key stored only on backend — never in frontend env

## 3. Deploy & smoke test

- [ ] Backend image built and deployed (ECS, Railway, Fly, etc.)
- [ ] `GET /health` returns `{"status":"ok","version":"..."}`
- [ ] Frontend build deployed with production env vars
- [ ] Sign in → run one shift → archive/publish flow works
- [ ] Public embed: `GET /public/posts/{id}` and `/replay` return 200 for a published post
- [ ] Rate limits: 11th `POST /hedge-fund/run` within an hour returns 429
- [ ] Scoring cron: `POST /hedge-fund/scoring/run` with `X-Scoring-Secret` header succeeds

## 4. Stripe (when monetization is enabled)

- [ ] Webhook endpoint registered in Stripe dashboard
- [ ] Test checkout → entitlement reflected in Supabase `subscriptions` / profile
- [ ] Pro user bypasses free-tier shift cap (once entitlement gate ships)

## 5. Observability & ops

- [ ] CloudWatch / platform logs retained ≥ 14 days
- [ ] Uptime check on `/health`
- [ ] Daily scoring scheduled (EventBridge, cron, or `scripts/run-scoring.ps1` against prod API)
- [ ] Backup: Supabase point-in-time recovery enabled on paid plan

## 6. Security pass

- [ ] No secrets in git; `.env` in `.gitignore`
- [ ] `CORS_ORIGINS` does not include `*`
- [ ] `TRUST_PROXY` only set when a reverse proxy strips client `X-Forwarded-For`
- [ ] Rotate `SCORING_CRON_SECRET` if ever exposed

## Quick local prod simulation

```powershell
# Terminal 1 — backend with production guards
$env:ENV="production"
$env:SUPABASE_URL="https://....supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:SCORING_CRON_SECRET="..."
python -m uvicorn app.backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd app/frontend
$env:VITE_API_URL="http://localhost:8000"
npm run dev
```

If startup fails with missing env vars, `app/backend/config.py` validation is working as intended.
