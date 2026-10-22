// ─────────────────────────────────────────────────────────────────────────────
// hooks/useDirectory.js — the ONE place people come from in this app.
//
// READ THIS BEFORE ADDING ANY PEOPLE LOOKUP.
//
// The web app has `useEmployeeDirectory()` over `GET /organizations/employees`.
// That endpoint is HR/manager only: an employee gets a 403. Porting that store
// would mean a screen full of "Loading…" that never resolves. So this app uses
// `GET /organizations/directory` — the public-safe roster, open to every role —
// and nothing else. Do not add a second roster fetch (CLAUDE.md §7).
//
// TWO CONSUMERS, TWO SHAPES:
//   • a SCREEN that lists people (Team, Org chart, "who's on leave") →
//     useDirectorySearch(), which pages and debounces server-side search
//   • a NAME for an id that a payload didn't embed → useNameOf(), backed by
//     one lazily-loaded cache shared across the app
//
// NEVER render an id (CLAUDE.md §4). An id we haven't resolved yet reads
// "Loading…"; one we tried and failed to resolve reads "Unknown employee".
// Those are different strings on purpose — "Unknown" on a name that is merely
// in flight is how a directory blip turns into a support ticket.
//
// `avatar_url` is a presigned link that expires in ~5 minutes. The cache below
// holds names, codes and departments and DROPS the avatar on purpose: a cached
// avatar URL renders as a broken image a few minutes later. Avatars come from
// the payload that is on screen now, and initials are the fallback — see
// ui/Avatar.jsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { organizationAPI } from '../api';
import { departmentName, employeeCode, entityId, normalizePaginated, personName } from '../lib/normalize';

/* ─── The shared name cache ───────────────────────────────────────────────────
   Module-level, so ten screens asking for the same colleague cost one request.
   It is NOT a roster: nothing walks it, nothing counts it, and it never
   pre-fetches. It fills in only with the people the UI has actually asked
   about. Cleared on sign-out by state/session.js. */

const LOADING = Symbol('loading');
const UNRESOLVED = Symbol('unresolved'); // tried and failed — NOT the same as absent

const cache = new Map(); // id → entry | LOADING | UNRESOLVED
const subscribers = new Set();
let pending = new Set();
let flushTimer = null;

function notify() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // A faulty subscriber must never break a fetch.
    }
  });
}

/** Wipe the cache. Called from clearSession() — one person's roster is not another's. */
export function clearDirectoryCache() {
  cache.clear();
  pending = new Set();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  notify();
}

const entryFrom = (row) => ({
  id: entityId(row),
  name: personName(row, ''),
  code: employeeCode(row) || null,
  department: departmentName(row) || null,
  // avatar_url deliberately omitted — see the file header.
});

/**
 * Resolve a batch of ids in ONE pass.
 *
 * The directory has no "ids in" filter, so this pages it and keeps what it
 * finds. It happens at most once per session per unresolved id, and the
 * alternative — a request per row — is explicitly banned (CLAUDE.md §7).
 */
async function flush() {
  flushTimer = null;
  const wanted = pending;
  pending = new Set();
  if (!wanted.size) return;

  try {
    let page = 1;
    let pages = 1;
    const seen = new Set();
    // Hard stop at 10 pages (1,000 people). Past that an unresolved name is
    // better than a minute of requests on somebody's mobile data.
    while (page <= pages && page <= 10) {
      const res = await organizationAPI.getDirectory({ page, limit: 100 });
      const norm = normalizePaginated(res, ['employees', 'directory', 'users'], { page, limit: 100 });
      norm.items.forEach((row) => {
        const entry = entryFrom(row);
        if (entry.id) {
          cache.set(entry.id, entry);
          seen.add(entry.id);
        }
      });
      pages = norm.totalPages;
      page += 1;
      if (norm.items.length === 0) break;
      // Everything asked for has turned up — stop paging.
      let done = true;
      wanted.forEach((id) => {
        if (!seen.has(id)) done = false;
      });
      if (done) break;
    }
    // Anything still missing is genuinely not in the directory (a leaver, a
    // deleted account, the system itself). Mark it so we never ask again.
    wanted.forEach((id) => {
      if (!cache.has(id) || cache.get(id) === LOADING) cache.set(id, UNRESOLVED);
    });
  } catch {
    // A failed read is NOT "not found" (CLAUDE.md §7). Drop these back to
    // absent so a later render retries, rather than burning them as UNRESOLVED
    // and reading "Unknown employee" for the rest of the session.
    wanted.forEach((id) => {
      if (cache.get(id) === LOADING) cache.delete(id);
    });
  }
  notify();
}

function want(id) {
  if (!id || cache.has(id)) return;
  cache.set(id, LOADING);
  pending.add(id);
  // Coalesce every id a screen asks for in one render pass into one flush.
  if (!flushTimer) flushTimer = setTimeout(flush, 50);
}

/**
 * `nameOf(id)` for the whole app.
 *
 * Returns "Loading…" while in flight and "Unknown employee" once we know it
 * cannot be resolved — never the id itself, never a dash.
 *
 * Prefer `personName(row)` whenever the row you already have embeds the person.
 * This hook is for a bare `user_id`: an approver on an old request, an
 * `acted_by` in an audit line.
 */
export function useNameOf() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }, []);

  const nameOf = useCallback((id, { fallback = 'Unknown employee', loading = 'Loading…' } = {}) => {
    if (!id) return fallback;
    const hit = cache.get(id);
    if (hit === undefined) {
      want(id);
      return loading;
    }
    if (hit === LOADING) return loading;
    if (hit === UNRESOLVED) return fallback;
    return hit.name || fallback;
  }, []);

  const entryOf = useCallback((id) => {
    if (!id) return null;
    const hit = cache.get(id);
    if (hit === undefined) {
      want(id);
      return null;
    }
    return hit === LOADING || hit === UNRESOLVED ? null : hit;
  }, []);

  /** Warm several ids at once — call it from a list's effect, not per row. */
  const prime = useCallback((ids) => (ids || []).forEach(want), []);

  return { nameOf, entryOf, prime };
}

/* ─── A people LIST ───────────────────────────────────────────────────────── */

/**
 * The paged, searchable directory for a screen that shows people.
 *
 * Search is sent to the SERVER (the roster can be thousands of rows, and
 * filtering page 1 of 100 client-side finds nobody past the first page) and
 * debounced by 300ms, so typing "priya" is one request and not five.
 *
 * Rows accumulate, for the infinite list every people screen on a phone is.
 */
export function useDirectorySearch({ limit = 30, department } = {}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState({
    rows: [], total: 0, page: 1, totalPages: 1, loading: true, error: null,
  });
  const req = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (page, { append } = {}) => {
    const id = ++req.current;
    setState((s) => ({ ...s, loading: true, error: append ? s.error : null }));
    try {
      const params = { page, limit };
      if (debounced) params.search = debounced;
      if (department) params.department = department;
      const res = await organizationAPI.getDirectory(params);
      const norm = normalizePaginated(res, ['employees', 'directory', 'users'], params);
      if (id !== req.current) return;
      const rows = norm.items.map(entryFrom).filter((r) => r.id);
      // Fill the shared cache from a read we were making anyway.
      rows.forEach((r) => cache.set(r.id, r));
      setState((s) => ({
        rows: append ? [...s.rows, ...rows] : rows,
        total: norm.total,
        page: norm.page,
        totalPages: norm.totalPages,
        loading: false,
        error: null,
      }));
    } catch (error) {
      if (id !== req.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [limit, department, debounced]);

  useEffect(() => {
    load(1);
  }, [load]);

  const canLoadMore = state.page < state.totalPages && !state.loading;
  const loadMore = useCallback(() => {
    if (state.page < state.totalPages && !state.loading) load(state.page + 1, { append: true });
  }, [state.page, state.totalPages, state.loading, load]);

  const byDepartment = useMemo(() => {
    const out = new Map();
    state.rows.forEach((r) => {
      const key = r.department || 'Not set';
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(r);
    });
    return out;
  }, [state.rows]);

  return { ...state, search, setSearch, reload: () => load(1), loadMore, canLoadMore, byDepartment };
}
