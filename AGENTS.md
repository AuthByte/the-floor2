# Agent notes

Standard install and run commands live in `README.md` and `app/README.md`. This file is only for non-obvious Cloud Agent / local QA caveats.

## Cursor Cloud specific instructions

- Backend (Poetry, port 8000) and Vite (port 5173) are the two processes needed for a live shift. Do not put `uvicorn` or `npm run dev` in the VM update script; start them in the session if they are not already listening.
- The OpenRouter key belongs in the UI (password field / `localStorage` key `floor.openrouter.key`). Never commit it, never paste it into issues, logs, or screenshots.
- `openrouter/free` works for live QA even when it is missing from the committed `OPENROUTER_MODELS` dropdown; the control still accepts a stored id.
- Deploy-all is **36** toggleable analysts (6 data feeds + 25 named + 5 specialists) plus locked risk + boss (**38 desks**). Direct ticker input (`AAPL`), not natural-language watchlists, unless you are specifically testing resolver #147.
- Full-roster shifts take a long time: data-provider **429** sleeps of 60–90s (#46) plus one LLM call per desk. Do not treat a quiet Live Wire as a hung run until `/hedge-fund/run` returns.
- Argument Room can log **Empty chamber** while T1 is still 0/25, then open a real 30-voice debate after legends finish (#167). Chair SPEAK only works in the later window.
- Default chair windows are **12s then 6s** (`src/agents/debate_chamber.py`). That is too short to type SPEAK (#168). Do **not** leave a longer `wait_seconds` committed; bump only in the working tree for a live SPEAK test, then revert.
- Vite SPA still renders the Floor on unknown paths such as `/nope` (#172). Use that tab if it is already open.
- After a shift, **MEMO** in the chrome reopens the boss overlay; it can be dismissed while Argument Room stays up.
- Rotate any OpenRouter key that was pasted into chat.
