/** After-hours API window — matches ECS scheduled scaling in scripts/aws-schedule-ecs.ps1 */

const TZ = "America/New_York";
const OPEN_HOUR = 7; // 7:00 AM inclusive
const CLOSE_HOUR = 18; // 6:00 PM exclusive

function easternMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Skip schedule in local dev or when explicitly overridden. */
export function floorHoursEnforced(): boolean {
  if (import.meta.env.VITE_FLOOR_ALWAYS_OPEN === "true") return false;
  if (import.meta.env.DEV) return false;
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return false;
  }
  return true;
}

export function isFloorOpen(now = new Date()): boolean {
  if (!floorHoursEnforced()) return true;
  const mins = easternMinutes(now);
  return mins >= OPEN_HOUR * 60 && mins < CLOSE_HOUR * 60;
}

export function floorHoursLabel(): string {
  return "7:00 AM – 6:00 PM Eastern";
}

export function floorClosedMessage(): string {
  return `The trading floor is closed. Shifts run ${floorHoursLabel()}. The API restarts around 7:00 AM ET (a few minutes to warm up).`;
}
