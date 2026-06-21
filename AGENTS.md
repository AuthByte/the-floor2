# AGENTS.md

## Cursor Cloud specific instructions

THE FLOOR is an AI multi-agent investment committee. The two services you normally run are the **FastAPI backend** and the **Vite/React frontend** (see `README.md` and `app/README.md` for the product overview). Dependencies are refreshed automatically by the startup update script (`poetry install` + `npm install` in `app/frontend`); the notes below are the non-obvious bits.

### Running the services
- **Backend (port 8000):** run from the repo root so the module path resolves —
  `python3 -m poetry run uvicorn app.backend.main:app --host 127.0.0.1 --port 8000`.
  `python3 -m poetry` is the most reliable invocation: Poetry is installed via `pip --user`, so the bare `poetry` command may not be on `PATH` in a non-interactive shell.
- **Frontend (port 5173):** `npm run dev --prefix app/frontend`. It calls the backend at `http://localhost:8000` (override with `VITE_API_URL`). The backend CORS allow-list is `localhost:5173` / `127.0.0.1:5173`.
- The SQLite DB (`app/backend/hedge_fund.db`) and Alembic migrations are created automatically on first backend startup.
- After editing frontend source, do a **hard reload** (Ctrl+Shift+R) in the browser — Vite HMR can leave `App.tsx` mount effects (e.g. the Ollama model fetch) running stale code, which looks like a missing feature.

### LLM providers — how to actually run a shift
- A shift needs an LLM. No cloud LLM keys (OpenAI/Anthropic/OpenRouter/etc.) are provisioned by default; only **market-data** provider keys are (FMP, Finnhub, Alpha Vantage, Polygon, Tiingo, FRED, Alpaca paper, Resend, …) as secrets/env vars.
- **Local Ollama is the no-key path** and is selectable in the UI model dropdown ("Local · Ollama" group). The backend reads installed models from `/ollama/status`.
- **Ollama version matters:** `0.30.x` segfaults (`llama-server ... signal: segmentation fault`) for every model on this VM's CPU. Use **`0.5.7`** (`curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=0.5.7 sh`), then `ollama serve` and `ollama pull llama3.2:1b`. `llama3.2:*` models are known-good; `gemma3:4b` is unreliable.
- **CPU inference is slow** (~1–4 min per LLM call). A full committee shift makes many calls (the risk pipeline + debate + risk manager + PM always run, in addition to the analysts), so a complete shift can take many minutes. For fast iteration use `llama3.2:1b`, a single analyst, and direct ticker symbols (e.g. `AAPL`). `SUB_AGENTS=0` (env on the backend) cuts extra LLM calls.
- Natural-language watchlist resolution (`/hedge-fund/resolve-tickers`) is served by an OpenRouter model on the backend, so it still needs an OpenRouter key; with a local model, enter ticker symbols directly.
- Free market-data tickers (no `FINANCIAL_DATASETS_API_KEY` needed): `AAPL, GOOGL, MSFT, NVDA, TSLA`.

### Lint / test / build
- **Frontend lint:** `npm run lint --prefix app/frontend`. It runs with `--max-warnings 0` and there are ~13 pre-existing `react-hooks`/`react-refresh` *warnings*, so the command exits non-zero even though there are 0 errors.
- **Frontend build / typecheck:** `npm run build --prefix app/frontend` (runs `tsc` then `vite build`).
- **Backend tests:** `python3 -m poetry run pytest`. The `v2/data/test_client.py` and `v2/event_study/test_event_study.py` tests hit live data for non-free tickers (JPM/XOM) and fail without that data/network — this is expected offline and unrelated to app code.
