/** Parse agent analysis payloads for display — never show raw JSON blobs to users. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function unwrapTickerPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj);
  if (
    keys.length === 1 &&
    /^[A-Z][A-Z0-9.-]{0,9}$/.test(keys[0]!) &&
    isRecord(obj[keys[0]!])
  ) {
    return obj[keys[0]!] as Record<string, unknown>;
  }
  return obj;
}

function signalBlockText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.details === "string" && value.details.trim()) return value.details.trim();
  if (typeof value.signal === "string" && value.signal.trim()) return value.signal.trim();
  return null;
}

/** Turn structured agent JSON into readable prose for room panels and history. */
export function humanizeAnalysisText(raw: string | null): string {
  if (!raw?.trim()) return "";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return trimmed;
    const inner = unwrapTickerPayload(parsed);
    const parts: string[] = [];

    const thesis =
      (typeof inner.thesis_summary === "string" ? inner.thesis_summary : null) ||
      (typeof inner.thesisSummary === "string" ? inner.thesisSummary : null) ||
      (typeof parsed.thesis_summary === "string" ? parsed.thesis_summary : null) ||
      (typeof parsed.thesisSummary === "string" ? parsed.thesisSummary : null);
    if (thesis?.trim()) parts.push(thesis.trim());

    const reasoning = inner.reasoning ?? parsed.reasoning;
    if (typeof reasoning === "string" && reasoning.trim()) {
      parts.push(reasoning.trim());
    } else if (isRecord(reasoning)) {
      for (const [key, value] of Object.entries(reasoning)) {
        if (key === "artifacts" || key === "sec_earnings") continue;
        const text = signalBlockText(value);
        if (text) {
          parts.push(`${key.replace(/_/g, " ")}: ${text}`);
        } else if (typeof value === "string" && value.trim()) {
          parts.push(`${key.replace(/_/g, " ")}: ${value.trim()}`);
        }
      }
    }

    const summary =
      (typeof inner.summary === "string" ? inner.summary : null) ||
      (typeof parsed.summary === "string" ? parsed.summary : null);
    if (summary?.trim() && !parts.includes(summary.trim())) {
      parts.push(summary.trim());
    }

    if (typeof inner.signal === "string" && inner.signal.trim()) {
      parts.push(`Signal: ${inner.signal.trim()}`);
    }
    if (inner.confidence != null && !Number.isNaN(Number(inner.confidence))) {
      parts.push(`Confidence: ${inner.confidence}%`);
    }

    if (parts.length > 0) return parts.join("\n\n");
    return "Analysis recorded — see charts above or the live wire for details.";
  } catch {
    const match = trimmed.match(/"reasoning"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return "Analysis recorded — see charts above or the live wire for details.";
  }
}

export function displayThesisText(raw: string): string {
  return humanizeAnalysisText(raw);
}

export function extractSignal(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const p = JSON.parse(trimmed) as { signal?: string };
    return p.signal ?? null;
  } catch {
    const m = trimmed.match(/"signal"\s*:\s*"(bullish|bearish|neutral)"/i);
    return m?.[1]?.toLowerCase() ?? null;
  }
}

export function formatTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format arbitrary evidence / metric values without dumping JSON. */
export function formatEvidenceValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatEvidenceValue(item))
      .filter(Boolean)
      .join("; ");
  }
  if (isRecord(value)) {
    const text = signalBlockText(value);
    if (text) return text;
    const nested = Object.entries(value)
      .filter(([k]) => k !== "artifacts")
      .map(([k, v]) => {
        const inner = formatEvidenceValue(v);
        return inner ? `${k.replace(/_/g, " ")}: ${inner}` : "";
      })
      .filter(Boolean);
    if (nested.length) return nested.join(" · ");
  }
  return "—";
}
