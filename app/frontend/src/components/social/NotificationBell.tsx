import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import {
  fetchNotifications,
  markNotificationsRead,
} from "../../lib/floorSocial/apiExtended";
import { getSupabase } from "../../lib/supabase";
import type { AppNotification } from "../../lib/floorSocial/types";
import { AuthorChip } from "./AuthorChip";

interface Props {
  notifications?: AppNotification[];
  onOpenPost?: (postId: string) => void;
  onOpenProfile?: (handle: string) => void;
  onRefresh?: () => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function kindLabel(kind: AppNotification["kind"]): string {
  switch (kind) {
    case "like":
      return "liked";
    case "comment":
      return "commented";
    case "reaction":
      return "reacted";
    case "follow":
      return "followed";
    case "score_milestone":
      return "score";
    case "digest_published":
      return "digest";
    case "watchlist_digest":
      return "digest rollup";
    default:
      return kind;
  }
}

export function NotificationBell({
  notifications: notificationsProp,
  onOpenPost,
  onOpenProfile,
  onRefresh,
}: Props) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(notificationsProp ?? []);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (notificationsProp) setNotifications(notificationsProp);
  }, [notificationsProp]);

  useEffect(() => {
    if (!open || notificationsProp) return;
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId) return;

    setLoading(true);
    void fetchNotifications(supabase, userId)
      .then(setNotifications)
      .finally(() => setLoading(false));
  }, [open, notificationsProp, session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function handleMarkRead(ids: string[]) {
    const supabase = getSupabase();
    const userId = session?.user?.id;
    if (!supabase || !userId || !ids.length) return;

    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    try {
      await markNotificationsRead(supabase, userId, ids);
      onRefresh?.();
    } catch {
      /* revert on next open */
    }
  }

  function handleItemClick(n: AppNotification) {
    if (!n.readAt) void handleMarkRead([n.id]);
    if (n.postId) onOpenPost?.(n.postId);
    else if (n.actor?.handle) onOpenProfile?.(n.actor.handle);
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded border border-wire-800 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wire-400 transition hover:border-brass/40 hover:text-brass"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-siren px-1 font-mono text-[8px] font-bold text-ink-950">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-wire-800 bg-ink-950 shadow-float">
          <div className="flex items-center justify-between border-b border-wire-800 px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-brass/70">
              Wire alerts
            </span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() =>
                  void handleMarkRead(notifications.filter((n) => !n.readAt).map((n) => n.id))
                }
                className="font-mono text-[8px] uppercase tracking-[0.16em] text-wire-500 hover:text-brass"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {loading ? (
              <li className="px-3 py-6 text-center font-mono text-[10px] text-wire-600">
                Loading…
              </li>
            ) : notifications.length === 0 ? (
              <li className="px-3 py-6 text-center font-mono text-[10px] text-wire-600">
                No notifications
              </li>
            ) : (
              notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full gap-2 border-b border-wire-800/60 px-3 py-2.5 text-left transition hover:bg-ink-900/60 ${
                      n.readAt ? "opacity-70" : "bg-brass/5"
                    }`}
                  >
                    {n.actor ? (
                      <AuthorChip author={n.actor} />
                    ) : (
                      <span className="font-mono text-[10px] text-wire-500">System</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-wire-300">
                        <span className="font-mono text-[9px] uppercase text-wire-500">
                          {kindLabel(n.kind)}
                        </span>
                        {n.body ? ` — ${n.body}` : null}
                      </p>
                      <span className="font-mono text-[8px] text-wire-700">
                        {formatWhen(n.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
