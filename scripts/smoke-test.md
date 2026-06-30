# THE FLOOR — manual smoke test

Fast pre-launch checklist for local demo. Run backend and frontend first:

```powershell
# Terminal 1 — repo root
python -m uvicorn app.backend.main:app --reload --port 8000

# Terminal 2
cd app/frontend
npm run dev
```

Open http://localhost:5173 (API: http://localhost:8000).

## Backend (curl or browser)

| Check | Command / URL | Expected |
|-------|---------------|----------|
| Health | `GET http://localhost:8000/health` | `{"status":"ok","version":"..."}` |
| Root | `GET http://localhost:8000/` | Welcome JSON |
| Public post (no DB) | `GET http://localhost:8000/public/posts/00000000-0000-0000-0000-000000000001` | 404 when Supabase service role unset |
| Billing status | `GET http://localhost:8000/billing/status` | 200 JSON with `tier` (401 if `SUPABASE_URL` set and no Bearer token) |

PowerShell one-liner:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

## Frontend

| Check | Steps | Expected |
|-------|-------|----------|
| Landing loads | Open `/` | Hero, pricing/CTA visible, no blank screen |
| Floor entry | Sign in (if Supabase configured) or enter floor | Floor canvas renders rooms |
| System bar | Top bar visible | Plan badge (FREE/PRO), no stuck loading |
| Control console | Open console panel | Ticker input, run shift controls |
| Billing tab | Account → billing (if signed in) | Status or graceful error, not infinite spinner |
| Public embed | `/p/demo` or a published post URL | 404 or post card; no uncaught console errors |

## Automated backend smoke

```powershell
python -m pytest tests/test_launch_smoke.py -q
```

## Optional env notes

- `VITE_FLOOR_ALWAYS_OPEN=true` — bypass overnight floor schedule in production builds
- `SUPABASE_SERVICE_ROLE_KEY` — required for public post reads and shift archive
- `STRIPE_CHECKOUT_STUB_URL` — prefix for stub checkout URLs until Stripe webhooks land
