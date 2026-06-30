import type { CompletePayload, HedgeFundRequest, ResolveTickersRequest, ResolveTickersResponse } from "./types";

import type { PaperAccountSnapshot, PaperPosition } from "./types";

const LOCAL_API = "http://localhost:8000";

type TokenGetter = () => Promise<string | null>;

let authTokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null) {
  authTokenGetter = getter;
}

async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  if (authTokenGetter) {
    const token = await authTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Resolved at call time so deployed builds never pin localhost from stale bundles. */
export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured;

  if (typeof window !== "undefined") {
    return isLocalHostname(window.location.hostname) ? LOCAL_API : "";
  }

  return import.meta.env.DEV ? LOCAL_API : "";
}

/** @deprecated Prefer getApiBaseUrl() — evaluated per call in fetch helpers below. */
export const API_BASE_URL = "";

/** Prefix relative backend URLs (e.g. /artifacts/...) with the API base. */
export function resolveBackendUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function fetchPaperAccount(): Promise<{
  account: PaperAccountSnapshot;
  positions: PaperPosition[];
}> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/paper-account`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface StreamHandlers {
  onStart?: (runId: string | null) => void;
  onProgress: (e: {
    agent: string;
    ticker: string | null;
    status: string;
    analysis: string | null;
    timestamp: string | null;
    signal: string | null;
    confidence: number | null;
    thesis_summary: string | null;
  }) => void;
  onComplete: (data: CompletePayload) => void;
  onError: (message: string) => void;
}

export async function resolveTickers(
  req: ResolveTickersRequest,
): Promise<ResolveTickersResponse> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/resolve-tickers`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? text;
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<ResolveTickersResponse>;
}

export function runHedgeFund(req: HedgeFundRequest, handlers: StreamHandlers) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/hedge-fund/run`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        handlers.onError(`HTTP ${res.status} :: ${text || "request failed"}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError("no readable stream returned by backend");
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      let completed = false;
      let reading = true;

      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }
        buf += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          if (!chunk.trim()) continue;
          const evt = parseSse(chunk);
          if (!evt) continue;
          switch (evt.event) {
            case "start":
              handlers.onStart?.(
                evt.data.run_id == null ? null : String(evt.data.run_id),
              );
              break;
            case "progress":
              handlers.onProgress({
                agent: String(evt.data.agent ?? ""),
                ticker: evt.data.ticker == null ? null : String(evt.data.ticker),
                status: String(evt.data.status ?? ""),
                analysis:
                  evt.data.analysis == null ? null : String(evt.data.analysis),
                timestamp:
                  evt.data.timestamp == null ? null : String(evt.data.timestamp),
                signal:
                  evt.data.signal == null ? null : String(evt.data.signal),
                confidence:
                  evt.data.confidence == null
                    ? null
                    : Number(evt.data.confidence),
                thesis_summary:
                  evt.data.thesis_summary == null
                    ? null
                    : String(evt.data.thesis_summary),
              });
              break;
            case "complete":
              completed = true;
              handlers.onComplete(evt.data.data as CompletePayload);
              break;
            case "error":
              handlers.onError(
                String(evt.data.message ?? "unknown backend error"),
              );
              break;
          }
        }
      }

      if (!completed) {
        handlers.onError(
          "stream ended before shift completed (backend may have crashed — check terminal)",
        );
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== "AbortError") {
        handlers.onError(e.message || "stream failed");
      }
    }
  })();

  return () => controller.abort();
}

export interface BacktestHandlers {
  onStart?: () => void;
  onTick?: (info: { date: string; step: number; total: number }) => void;
  onDay?: (day: import("./types").BacktestDayResult) => void;
  onComplete: (data: import("./types").BacktestCompletePayload) => void;
  onError: (message: string) => void;
}

/** Stream a backtest run. Mirrors runHedgeFund's SSE handling. */
export function runBacktest(
  req: import("./types").BacktestRequest,
  handlers: BacktestHandlers,
) {
  const controller = new AbortController();
  const tickRe = /Processing\s+(\S+)\s+\((\d+)\/(\d+)\)/;

  (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/hedge-fund/backtest`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        handlers.onError(`HTTP ${res.status} :: ${text || "request failed"}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError("no readable stream returned by backend");
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      let completed = false;
      let reading = true;

      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }
        buf += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          if (!chunk.trim()) continue;
          const evt = parseSse(chunk);
          if (!evt) continue;
          switch (evt.event) {
            case "start":
              handlers.onStart?.();
              break;
            case "progress": {
              if (String(evt.data.agent ?? "") !== "backtest") break;
              const status = String(evt.data.status ?? "");
              const analysis = evt.data.analysis;
              if (analysis != null) {
                try {
                  handlers.onDay?.(
                    JSON.parse(
                      String(analysis),
                    ) as import("./types").BacktestDayResult,
                  );
                } catch {
                  /* ignore malformed day payloads */
                }
              } else {
                const m = tickRe.exec(status);
                if (m) {
                  handlers.onTick?.({
                    date: m[1],
                    step: Number(m[2]),
                    total: Number(m[3]),
                  });
                }
              }
              break;
            }
            case "complete":
              completed = true;
              handlers.onComplete(
                evt.data.data as import("./types").BacktestCompletePayload,
              );
              break;
            case "error":
              handlers.onError(
                String(evt.data.message ?? "unknown backend error"),
              );
              break;
          }
        }
      }

      if (!completed) {
        handlers.onError(
          "stream ended before backtest completed (backend may have crashed — check terminal)",
        );
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== "AbortError") {
        handlers.onError(e.message || "backtest stream failed");
      }
    }
  })();

  return () => controller.abort();
}

export async function postDebateInterjection(body: {
  run_id: string;
  ticker: string;
  message: string;
  chair_name?: string;
}): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/debate-interject`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

function parseSse(
  chunk: string,
): { event: string; data: Record<string, unknown> } | null {
  const lines = chunk.split("\n");
  let event = "message";
  let data = "";
  for (const ln of lines) {
    if (ln.startsWith("event:")) event = ln.slice(6).trim();
    else if (ln.startsWith("data:")) data += ln.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}
