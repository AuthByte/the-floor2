import type { CompletePayload, HedgeFundRequest, BacktestRequest, ResolveTickersRequest, ResolveTickersResponse, AlpacaStatus } from "./types";
import type { BacktestCompletePayload, BacktestDayResult } from "./backtest";

import type { PaperAccountSnapshot, PaperPosition, PaperOrder } from "./types";
import { floorClosedMessage, isFloorOpen } from "./floorHours";

const LOCAL_API = "http://localhost:8000";

type TokenGetter = () => Promise<string | null>;

let authTokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(getter: TokenGetter | null) {
  authTokenGetter = getter;
}

export async function authHeaders(
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
  orders?: PaperOrder[];
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

export async function fetchAlpacaStatus(
  apiKeys?: Record<string, string>,
): Promise<AlpacaStatus> {
  const hasClientKeys = Boolean(
    apiKeys?.ALPACA_API_KEY_ID?.trim() && apiKeys?.ALPACA_API_SECRET_KEY?.trim(),
  );
  const url = `${getApiBaseUrl()}/hedge-fund/alpaca/status`;
  const res = await fetch(url, {
    method: hasClientKeys ? "POST" : "GET",
    headers: await authHeaders(
      hasClientKeys ? { "Content-Type": "application/json" } : {},
    ),
    body: hasClientKeys ? JSON.stringify({ api_keys: apiKeys }) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAlpacaPortfolio(
  apiKeys?: Record<string, string>,
): Promise<{
  account: PaperAccountSnapshot;
  positions: PaperPosition[];
  orders: PaperOrder[];
}> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/alpaca/account`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ api_keys: apiKeys }),
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
  return res.json();
}

export async function executeAlpacaPaper(body: {
  decisions: Record<string, unknown>;
  current_prices?: Record<string, number> | null;
  shift_id?: string | null;
  api_keys?: Record<string, string>;
}): Promise<import("./types").PaperTradingResult> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/alpaca/execute`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      decisions: body.decisions,
      current_prices: body.current_prices ?? undefined,
      shift_id: body.shift_id ?? undefined,
      api_keys: body.api_keys,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string | { message?: string } };
      if (typeof parsed.detail === "string") detail = parsed.detail;
      else if (parsed.detail && typeof parsed.detail === "object" && parsed.detail.message) {
        detail = parsed.detail.message;
      }
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface StreamHandlers {
  onStart?: (runId: string | null) => void;
  onPaywall?: (payload: import("./entitlements").PaywallPayload) => void;
  onProgress: (e: {
    agent: string;
    ticker: string | null;
    status: string;
    analysis: string | null;
    timestamp: string | null;
    signal: string | null;
    confidence: number | null;
    thesis_summary: string | null;
    token_usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost?: number | null;
      calls?: number;
    } | null;
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
  let userCancelled = false;
  const CONNECT_TIMEOUT_MS = 25_000;
  const connectTimer = window.setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  (async () => {
    try {
      if (!isFloorOpen()) {
        window.clearTimeout(connectTimer);
        handlers.onError(floorClosedMessage());
        return;
      }
      const res = await fetch(`${getApiBaseUrl()}/hedge-fund/run`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      window.clearTimeout(connectTimer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 402) {
          const { parsePaywallDetail } = await import("./entitlements");
          let payload = null;
          try {
            const parsed = JSON.parse(text) as { detail?: unknown };
            payload = parsePaywallDetail(parsed.detail ?? parsed);
          } catch {
            /* ignore */
          }
          if (payload && handlers.onPaywall) {
            handlers.onPaywall(payload);
            return;
          }
        }
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
                token_usage:
                  evt.data.token_usage == null
                    ? null
                    : (evt.data.token_usage as {
                        prompt_tokens?: number;
                        completion_tokens?: number;
                        total_tokens?: number;
                        cost?: number | null;
                        calls?: number;
                      }),
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
      window.clearTimeout(connectTimer);
      const e = err as Error;
      if (e.name === "AbortError") {
        if (!userCancelled) {
          handlers.onError(
            `backend not responding at ${getApiBaseUrl() || "API URL"} — start uvicorn on port 8000`,
          );
        }
        return;
      }
      handlers.onError(e.message || "stream failed");
    }
  })();

  return () => {
    userCancelled = true;
    window.clearTimeout(connectTimer);
    controller.abort();
  };
}

export interface BacktestStreamHandlers {
  onStart?: () => void;
  onProgress?: (e: {
    currentDate: string;
    progress: number;
    dayResult?: BacktestDayResult;
    status?: string;
  }) => void;
  onComplete: (data: BacktestCompletePayload) => void;
  onError: (message: string) => void;
}

export function runBacktest(req: BacktestRequest, handlers: BacktestStreamHandlers) {
  const controller = new AbortController();

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
        handlers.onError(`HTTP ${res.status} :: ${text || "backtest request failed"}`);
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
              const agent = String(evt.data.agent ?? "");
              if (agent === "backtest") {
                let dayResult: BacktestDayResult | undefined;
                let progress = 0;
                const analysis = evt.data.analysis;
                if (typeof analysis === "string" && analysis.trim()) {
                  try {
                    const parsed = JSON.parse(analysis) as Record<string, unknown>;
                    if (typeof parsed.portfolio_value === "number") {
                      dayResult = parsed as unknown as BacktestDayResult;
                    } else if (typeof parsed.progress === "number") {
                      progress = parsed.progress;
                    }
                  } catch {
                    /* ignore malformed */
                  }
                }
                handlers.onProgress?.({
                  currentDate: String(evt.data.timestamp ?? ""),
                  progress,
                  dayResult,
                  status: String(evt.data.status ?? ""),
                });
              } else {
                handlers.onProgress?.({
                  currentDate: String(evt.data.timestamp ?? ""),
                  progress: Number(evt.data.progress ?? 0),
                  status: String(evt.data.status ?? agent),
                });
              }
              break;
            }
            case "complete":
              completed = true;
              handlers.onComplete(evt.data.data as BacktestCompletePayload);
              break;
            case "error":
              handlers.onError(String(evt.data.message ?? "unknown backend error"));
              break;
          }
        }
      }

      if (!completed) {
        handlers.onError("stream ended before backtest completed");
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

export async function postUserConsultation(body: {
  run_id: string;
  ticker: string;
  message: string;
  chair_name?: string;
}): Promise<{
  ok: boolean;
  agent_key?: string;
  material?: boolean;
  propagation_queued?: boolean;
  phase?: string;
  revision?: {
    reply_to_user?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    prompt?: string;
  };
}> {
  const res = await fetch(`${getApiBaseUrl()}/hedge-fund/user-consultation`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? text;
    } catch {
      /* keep */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
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

function parseSse(chunk: string): { event: string; data: any } | null {
  const lines = chunk.split("\n");
  let event = "message";
  let data = "";
  for (const ln of lines) {
    if (ln.startsWith("event:")) event = ln.slice(6).trim();
    else if (ln.startsWith("data:")) data += ln.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
