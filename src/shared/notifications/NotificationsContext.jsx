// ─────────────────────────────────────────────────────────────────────────────
// NotificationsContext — the one place the app knows about notifications.
//
// It owns three things and nothing else: the unread badge, the first page of
// the feed (what the bell panel shows), and every write. Screens read from it;
// no component calls the notification API directly.
//
// ─── WHY A STORE AND NOT A FETCH PER COMPONENT ─────────────────────────────
// The badge is on every signed-in screen, the panel can be opened from every
// one of them, and the full page is mounted in three workspaces. Without a
// single owner that is three pollers racing each other, three badges that
// disagree after a read, and a mark-all-read on the page that leaves the bell
// still showing 7. There is no query cache in this app (§7), so the owner is
// explicit.
//
// ─── THE DECISIONS THAT MATTER ─────────────────────────────────────────────
// · POLLING, NOT SOCKETS, AND THAT IS PERMANENT. nginx here buffers and auth is
//   Bearer-only, so SSE can't carry the token and a socket can't get through.
//   `unread-count` is a capped index-only scan built to be polled; the feed is
//   not, and is read only when somebody opens it.
// · THE POLLER STOPS WHEN THE TAB IS HIDDEN (§7). A background tab left open
//   over a weekend would otherwise make ~2 900 requests to learn nothing. It
//   catches up the moment the tab is looked at again.
// · THE KILL SWITCH LATCHES. One 503 FEATURE_DISABLED and the bell, the sidebar
//   entry and the page disappear for the rest of the session — no retry loop,
//   no toast, no error screen. Ops turning the engine off is not an incident
//   the user needs to hear about, and a toast once a minute forever is worse
//   than silence. A reload is what picks the feature back up.
// · WRITES ARE OPTIMISTIC AND ROLL BACK. Marking read is the single most
//   frequent interaction in a notification panel and it must feel instant. The
//   server call is idempotent, so a double-fire is harmless; a genuine failure
//   puts the row back the way it was.
// · A DISMISS THAT 404s COUNTS AS DONE. The row is gone either way, and the
//   user's intent was that it should be.
// · EVERY CHANGE IS BROADCAST. The bell panel and the full page hold separate
//   lists of the same rows; `subscribeChange` lets the one that did not make
//   the change apply it locally instead of re-reading the feed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { notificationsAPI } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { isNotificationMissing, isNotificationsDisabled } from "./notificationErrors";
import { normalizeNotification } from "./notificationMeta";

const NotificationsContext = createContext(null);

/** How often the badge is re-read while the tab is in front. */
const POLL_MS = 60_000;
/** On returning to the tab, a count older than this is re-read at once. */
const STALE_MS = 30_000;
/** The panel is a glance, not an archive — the page is where everything lives. */
export const PANEL_PAGE_SIZE = 12;

const EMPTY_FEED = { rows: [], total: 0, loaded: false, loading: false, error: null };

export function NotificationsProvider({ children }) {
  const { isAuthenticated, orgId, role } = useAuth();
  // Platform-plane roles authenticate fine and own no tenant data, so their
  // feed is empty by construction. A guest is outside every organisation.
  const enabled = Boolean(isAuthenticated && orgId && role !== "guest");

  const [disabled, setDisabled] = useState(false);
  const [unread, setUnread] = useState({ count: 0, capped: false });
  const [feed, setFeed] = useState(EMPTY_FEED);

  // Guards a late response from overwriting a newer one (§7). Bumped by every
  // reset, so a reply addressed to the previous session is dropped on arrival.
  const epochRef = useRef(0);
  const lastCountAtRef = useRef(0);
  const listenersRef = useRef(new Set());

  const notifyChange = useCallback((change) => {
    listenersRef.current.forEach((fn) => {
      try {
        fn(change);
      } catch (err) {
        if (import.meta.env.DEV) console.error("notification change listener failed", err);
      }
    });
  }, []);

  /** Lets a list elsewhere apply a change it did not make, without a refetch. */
  const subscribeChange = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  // Signing out, signing in and switching organisation all land here. Leaving
  // the previous person's notifications on screen for even one frame is not an
  // option, so the reset is immediate and the epoch invalidates their replies.
  useEffect(() => {
    epochRef.current += 1;
    lastCountAtRef.current = 0;
    setUnread({ count: 0, capped: false });
    setFeed(EMPTY_FEED);
    setDisabled(false);
  }, [orgId, isAuthenticated]);

  const refreshUnread = useCallback(async () => {
    if (!enabled || disabled) return;
    const epoch = epochRef.current;
    try {
      const res = await notificationsAPI.getUnreadCount();
      if (epoch !== epochRef.current) return;
      const data = res?.data || {};
      lastCountAtRef.current = Date.now();
      setUnread({ count: Number(data.unread_count) || 0, capped: data.is_capped === true });
    } catch (err) {
      if (epoch !== epochRef.current) return;
      if (isNotificationsDisabled(err)) setDisabled(true);
      // Any other failure is left silent on purpose: this runs once a minute in
      // the background and a badge that failed to refresh is not news.
    }
  }, [enabled, disabled]);

  const refreshFeed = useCallback(async () => {
    if (!enabled || disabled) return;
    const epoch = epochRef.current;
    setFeed((f) => ({ ...f, loading: true, error: null }));
    try {
      const res = await notificationsAPI.listNotifications({ page: 1, limit: PANEL_PAGE_SIZE });
      if (epoch !== epochRef.current) return;
      const data = res?.data || {};
      setFeed({
        rows: (data.items || []).map(normalizeNotification).filter(Boolean),
        total: Number(data.pagination?.total) || 0,
        loaded: true,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (epoch !== epochRef.current) return;
      if (isNotificationsDisabled(err)) {
        setDisabled(true);
        setFeed(EMPTY_FEED);
        return;
      }
      setFeed((f) => ({ ...f, loading: false, error: err }));
    }
  }, [enabled, disabled]);

  // First read, then once a minute while the tab is in front. `visibilitychange`
  // both pauses the timer and catches up on return, so a laptop that slept for
  // an hour shows a current badge as soon as it is looked at.
  useEffect(() => {
    if (!enabled || disabled) return undefined;
    let timer = null;

    const tick = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(tick, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        clearInterval(timer);
        timer = null;
        return;
      }
      if (Date.now() - lastCountAtRef.current > STALE_MS) refreshUnread();
      start();
    };

    refreshUnread();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, disabled, refreshUnread]);

  // A push is a nudge, not the record: the payload is deliberately thinner than
  // the row (no reason text, no amounts), so the service worker tells us one
  // arrived and we re-read the real thing.
  useEffect(() => {
    if (!enabled || disabled || !("serviceWorker" in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== "NOTIFICATION_RECEIVED") return;
      refreshUnread();
      refreshFeed();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [enabled, disabled, refreshUnread, refreshFeed]);

  /** Local patch applied to the panel's copy of the feed. */
  const patchFeed = useCallback((fn) => setFeed((f) => ({ ...f, rows: fn(f.rows) })), []);

  const markRead = useCallback(async (id) => {
    if (!id || disabled) return false;
    const targetRow = feed.rows.find((r) => r.id === id);
    const wasAlreadyRead = targetRow ? targetRow.isRead : false;
    const readAt = new Date().toISOString();
    patchFeed((rows) => rows.map((r) => (r.id === id ? { ...r, isRead: true, readAt: r.readAt || readAt } : r)));
    if (!wasAlreadyRead) {
      setUnread((u) => ({ ...u, count: Math.max(0, u.count - 1) }));
    }
    notifyChange({ kind: "read", id, readAt });
    try {
      await notificationsAPI.markRead(id);
      // The count was capped or estimated locally; settle it against the server.
      refreshUnread();
      return true;
    } catch (err) {
      if (isNotificationsDisabled(err)) { setDisabled(true); return false; }
      // Already gone is still "no longer unread" — leave the optimistic state.
      if (isNotificationMissing(err)) return true;
      if (!wasAlreadyRead) {
        patchFeed((rows) => rows.map((r) => (r.id === id ? { ...r, isRead: false, readAt: null } : r)));
        notifyChange({ kind: "unread", id });
        refreshUnread();
      }
      return false;
    }
  }, [disabled, feed.rows, patchFeed, notifyChange, refreshUnread]);

  const markAllRead = useCallback(async () => {
    if (disabled) return false;
    const readAt = new Date().toISOString();
    const before = unread;
    patchFeed((rows) => rows.map((r) => (r.isRead ? r : { ...r, isRead: true, readAt })));
    setUnread({ count: 0, capped: false });
    notifyChange({ kind: "read_all", readAt });
    try {
      await notificationsAPI.markAllRead();
      // The server watermarks to the request moment, so anything that arrived
      // while it ran is still unread. Re-read rather than trust the zero.
      refreshUnread();
      return true;
    } catch (err) {
      if (isNotificationsDisabled(err)) { setDisabled(true); return false; }
      setUnread(before);
      refreshFeed();
      refreshUnread();
      return false;
    }
  }, [disabled, unread, patchFeed, notifyChange, refreshUnread, refreshFeed]);

  const dismiss = useCallback(async (id) => {
    if (!id || disabled) return false;
    const removed = feed.rows.find((r) => r.id === id) || null;
    patchFeed((rows) => rows.filter((r) => r.id !== id));
    if (removed && !removed.isRead) setUnread((u) => ({ ...u, count: Math.max(0, u.count - 1) }));
    notifyChange({ kind: "dismiss", id });
    try {
      await notificationsAPI.dismissNotification(id);
      refreshUnread();
      return true;
    } catch (err) {
      if (isNotificationsDisabled(err)) { setDisabled(true); return false; }
      // A second DELETE of the same id answers 404. The row is gone; that is
      // what was asked for, so it is a success, not something to undo.
      if (isNotificationMissing(err)) return true;
      refreshFeed();
      refreshUnread();
      return false;
    }
  }, [disabled, feed.rows, patchFeed, notifyChange, refreshUnread, refreshFeed]);

  const value = useMemo(() => ({
    /** False while the engine's kill switch is off, or for a guest / signed-out visitor. */
    available: enabled && !disabled,
    unreadCount: unread.count,
    unreadCapped: unread.capped,
    feed,
    refreshUnread,
    refreshFeed,
    markRead,
    markAllRead,
    dismiss,
    subscribeChange,
  }), [enabled, disabled, unread, feed, refreshUnread, refreshFeed, markRead, markAllRead, dismiss, subscribeChange]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/**
 * Safe outside the provider (the marketing site, the auth screens): everything
 * is off and every write is a no-op, so a component never has to ask whether it
 * is inside a session before rendering.
 */
const OFFLINE = {
  available: false,
  unreadCount: 0,
  unreadCapped: false,
  feed: EMPTY_FEED,
  refreshUnread: () => {},
  refreshFeed: () => {},
  markRead: async () => false,
  markAllRead: async () => false,
  dismiss: async () => false,
  subscribeChange: () => () => {},
};

export function useNotifications() {
  return useContext(NotificationsContext) || OFFLINE;
}

export default NotificationsContext;
