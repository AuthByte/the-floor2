import { useEffect, useState } from "react";

export const PRESENCE_OPT_IN_STORAGE = "floor.presenceOptIn";

export function readPresenceOptIn(): boolean {
  try {
    return localStorage.getItem(PRESENCE_OPT_IN_STORAGE) === "1";
  } catch {
    return false;
  }
}

export function writePresenceOptIn(enabled: boolean): void {
  try {
    localStorage.setItem(PRESENCE_OPT_IN_STORAGE, enabled ? "1" : "0");
  } catch {
    /* ignore quota errors */
  }
}

interface Props {
  checked?: boolean;
  onChange?: (visible: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Opt-in toggle — show live desk on the social feed while a shift runs. */
export function PresenceOptIn({
  checked: controlledChecked,
  onChange,
  disabled = false,
  className = "",
}: Props) {
  const [internal, setInternal] = useState(() => readPresenceOptIn());
  const checked = controlledChecked ?? internal;

  useEffect(() => {
    if (controlledChecked == null) writePresenceOptIn(internal);
  }, [controlledChecked, internal]);

  function handleToggle(next: boolean) {
    if (controlledChecked == null) {
      setInternal(next);
      writePresenceOptIn(next);
    }
    onChange?.(next);
  }

  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded border border-wire-800/80 bg-ink-900/40 px-3 py-2 transition hover:border-wire-700 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    >
      <span className="min-w-0">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-wire-300">
          Show desk as active on feed
        </span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-wire-600">
          Others see your tickers while a shift runs. Stale after 90s idle.
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => handleToggle(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 shrink-0 accent-brass disabled:cursor-not-allowed"
        aria-label="Show desk as active on feed"
      />
    </label>
  );
}
