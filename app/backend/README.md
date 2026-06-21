# THE FLOOR — Backend

FastAPI backend for THE FLOOR. Exposes REST + SSE endpoints for running shifts, debate, backtests, and paper trading.

## Setup

```bash
git clone https://github.com/AuthByte/the-floor2.git
cd the-floor2
poetry install
cp .env.example .env
# edit .env with your API keys
poetry run uvicorn app.backend.main:app --reload --host 127.0.0.1 --port 8000
```

## Key endpoints

- `POST /hedge-fund/run` — stream a shift (SSE)
- `POST /hedge-fund/debate-interject` — chair interjection during live debate
- `GET /hedge-fund/agents` — roster
- `GET /health` — liveness
