// ─────────────────────────────────────────────────────────────────────────────
// useBadgeCounts — every pending-work number on screen, from one request.
//
// THE RULE: no screen counts a queue for itself. The sidebar badges, the inbox
// cards and the verification tiles all read this; the single poll, the 429
// cooldown and the fallback for an older server live in badgeCountsStore.js.
//
//   const { counts, sidebar, isUnavailable, loading, refresh } = useBadgeCounts();
//
// · `counts[key]` — a number, or `null` when the queue could not be read
//   (render N/A, never 0). A queue this role may not see is NOT in the map at
//   all: ask `isUnavailable(key)` and leave the card out (§2 — absent, not
//   broken). `null` and "absent" are different answers and look different.
// · `supported` — the unified endpoint answered. It is the one gate for the
//   list filters that shipped with it (`pending_hr`), because a server that
//   has no badge endpoint has no such filter either and would silently ignore
//   it rather than refuse it.
// · Nothing is requested until a component calls this, and the poller stops
//   when the last one unmounts — the employee workspace shows no badge and so
//   sends no request.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  INBOX_CATEGORY_PATHS,
  ensureBadgeCounts,
  getBadgeCountsSnapshot,
  refreshBadgeCounts,
  subscribeToBadgeCounts,
} from "../contexts/badgeCountsStore";

/**
 * @param {{ enabled?: boolean }} [options] `enabled: false` asks for nothing —
 *   for a workspace that renders no badge at all.
 */
export function useBadgeCounts({ enabled = true } = {}) {
  const snapshot = useSyncExternalStore(subscribeToBadgeCounts, getBadgeCountsSnapshot, getBadgeCountsSnapshot);

  // A press belongs to the button that was pressed. The store has one read
  // in flight for the whole app, so spinning on that would spin every Refresh
  // button in the tree once a minute, on its own, and swallow a press that
  // landed in the window — the poll is not something the person asked for.
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (enabled) ensureBadgeCounts();
  }, [enabled]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshBadgeCounts();
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);

  /** True only when the server said so — never while counts are still unknown. */
  const isUnavailable = useCallback((key) => {
    if (!snapshot.unavailable) return false;
    return snapshot.unavailable.has(INBOX_CATEGORY_PATHS[key] || key);
  }, [snapshot.unavailable]);

  return {
    counts: snapshot.counts,
    isUnavailable,
    sidebar: snapshot.sidebar,
    groups: snapshot.groups,
    plane: snapshot.plane,
    /** Direct reports a manager's counts cover; `null` for an org-wide view. */
    teamSize: snapshot.teamSize,
    syncedAt: snapshot.syncedAt,
    /** When these numbers were read, for a screen holding a newer local count
     *  of its own: once this passes the moment that count was taken, it is the
     *  stale one and the snapshot wins again. */
    loadedAt: snapshot.loadedAt,
    /** The first read, before there is anything to show. */
    loading: enabled && (snapshot.status === "loading" || snapshot.status === "idle"),
    /** This component's own Refresh, in flight. */
    refreshing,
    /** The server has asked us to stop for now, so pressing Refresh can do
     *  nothing — the one case where the button is disabled rather than live. */
    rateLimited: snapshot.cooldownUntil > Date.now(),
    error: snapshot.status === "error" ? snapshot.error : null,
    supported: snapshot.source === "badges",
    refresh,
  };
}

export default useBadgeCounts;
