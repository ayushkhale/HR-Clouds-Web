// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDirectoryContext.jsx — the app-wide people list, in React terms.
//
// THE RULE: no screen fetches `/organizations/employees` itself. Everything
// that needs people — a dropdown, a name for a `user_id`, an avatar, a roster
// table — reads this. One read per session serves all of them, so the list in
// one dropdown is the same list as in every other, photos included.
//
// The read, the caching and the presigned-photo refresh live in
// employeeDirectoryStore.js; this file is the React face of it. The provider
// sits at the app root, but nothing is requested until a screen actually asks:
// the marketing site and the employee workspace (which may not read the
// endpoint at all) never fire it.
//
//   const { options, activeOptions, nameOf, status } = useEmployeeDirectory();
//
// `status` — "idle" before the first ask · "loading" · "ready" · "error" ·
// "unavailable" when this role may not read the roster (an employee or guest).
// A name that hasn't arrived yet reads "Loading…", never an id and never
// "not found" (§4).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  deriveEmployeeDirectory,
  ensureEmployeeDirectory,
  getEmployeeDirectorySnapshot,
  markDirectoryPhotosStale,
  refreshEmployeeDirectory,
  subscribeToEmployeeDirectory,
} from "./employeeDirectoryStore";

export { markDirectoryPhotosStale, refreshEmployeeDirectory };

const EmployeeDirectoryContext = createContext(null);

/** Subscribe to the store. Used by the provider, and directly by a hook used
 *  outside it (a dialog portalled from a tree that has no provider). */
function useDirectorySnapshot() {
  return useSyncExternalStore(subscribeToEmployeeDirectory, getEmployeeDirectorySnapshot, getEmployeeDirectorySnapshot);
}

export function EmployeeDirectoryProvider({ children }) {
  const snapshot = useDirectorySnapshot();
  return <EmployeeDirectoryContext.Provider value={snapshot}>{children}</EmployeeDirectoryContext.Provider>;
}

/**
 * The organisation's people.
 *
 * @param {{ enabled?: boolean }} [options] `enabled: false` asks for nothing —
 *   for a screen whose rows already carry names, or a dialog that is closed.
 * @returns {{
 *   rows: object[], activeRows: object[],
 *   options: object[], activeOptions: object[],
 *   byId: Map<string, object>, status: string, loading: boolean, error: unknown,
 *   nameOf: (id: string, fallback?: string) => string,
 *   entryOf: (key: string) => object|null,
 *   reload: () => void,
 * }}
 */
export function useEmployeeDirectory({ enabled = true } = {}) {
  const fallback = useDirectorySnapshot();
  const fromContext = useContext(EmployeeDirectoryContext);
  const snapshot = fromContext || fallback;

  useEffect(() => {
    if (enabled) ensureEmployeeDirectory();
  }, [enabled]);

  const { options, activeOptions, byId, byKey } = useMemo(
    () => deriveEmployeeDirectory(snapshot.rows),
    [snapshot.rows]
  );

  const status = enabled ? snapshot.status : "idle";

  const nameOf = useCallback((id, fallbackName) => {
    if (!id) return fallbackName ?? "N/A";
    const hit = byId.get(id) || byKey.get(String(id).toLowerCase());
    if (hit) return hit.name;
    if (status === "loading" || status === "idle") return "Loading…";
    if (status === "error") return "Name unavailable";
    // This role can't read the roster, so the id simply cannot be resolved here.
    if (status === "unavailable") return fallbackName ?? "A colleague";
    return fallbackName ?? "Unknown user";
  }, [byId, byKey, status]);

  const entryOf = useCallback(
    (key) => (key ? byKey.get(String(key).toLowerCase()) || byId.get(key) || null : null),
    [byId, byKey]
  );

  const activeRows = useMemo(
    () => snapshot.rows.filter((r) => r?.is_active !== false && r?.status !== "inactive"),
    [snapshot.rows]
  );

  return {
    rows: snapshot.rows,
    activeRows,
    options,
    activeOptions,
    byId,
    status,
    loading: status === "loading",
    refreshing: snapshot.refreshing,
    error: snapshot.error,
    nameOf,
    entryOf,
    reload: refreshEmployeeDirectory,
  };
}

/**
 * The directory entry for the first of `keys` (user ids or emails) it knows, or
 * null — what GenderAvatar uses to find a photo for a row that doesn't carry
 * one. Asks for nothing unless `enabled`.
 */
export function useDirectoryEntry(keys, enabled) {
  const fallback = useDirectorySnapshot();
  const fromContext = useContext(EmployeeDirectoryContext);
  const snapshot = fromContext || fallback;

  useEffect(() => {
    if (enabled) ensureEmployeeDirectory();
  }, [enabled]);

  if (!enabled || snapshot.status !== "ready") return null;
  const { byKey } = deriveEmployeeDirectory(snapshot.rows);
  for (const key of keys) {
    const hit = byKey.get(String(key).toLowerCase());
    if (hit) return hit;
  }
  return null;
}
