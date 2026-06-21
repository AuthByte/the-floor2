/** Parse agent analysis payloads for display. */

export function displayThesisText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.reasoning === "string") return parsed.reasoning;
    if (parsed.signal && typeof parsed === "object") {
      const parts: string[] = [];
      if (parsed.signal) parts.push(`Signal: ${String(parsed.signal)}`);
      if (parsed.confidence != null) parts.push(`Confidence: ${parsed.confidence}`);
      if (parsed.reasoning) parts.push(String(parsed.reasoning));
      return parts.join("\n\n");
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    const match = trimmed.match(/"reasoning"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return trimmed;
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
