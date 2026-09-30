// ─────────────────────────────────────────────────────────────────────────────
// orgEmployees.js — The whole organisation employee list, for resolving the
// `user_id`s payroll and attendance responses carry into names.
//
// `GET /organizations/employees` is paginated (max 100 per page) and hides
// inactive people by default. A leaver who is still in last month's payroll run
// must resolve too, so name lookups load every page with inactive people
// included. The rows carry PII (PAN, addresses): keep them in memory only —
// never cache them in storage or log them.
//
// A dozen screens need this list, and every mount used to re-page the whole
// organisation. There is now ONE cached copy — keyed by session token so
// another login never sees it, dropped when the tab closes, and shared even
// with callers whose request is still in flight.
// `clearOrgEmployeesCache()` forces the next read to refetch.
//
// It is one copy on purpose: asking for current employees only used to be a
// SECOND cache entry and a second trip through every page, and the two copies
// were read at different moments, so the same person could carry a live photo
// link on one screen and an expired one on the next. Hiding leavers is a
// filter over the one list now, never another read.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI, tokenHelper } from "../api";
import { normalizePaginated } from "../attendance/normalize";

const PAGE_LIMIT = 100; // backend maximum
const MAX_PAGES = 50; // 5,000 people; a safety stop, not an expected size
const KEYS = ["employees", "records"];
const CACHE_MS = 5 * 60_000;

let cache = { token: null, at: 0, rows: null, promise: null };

function sameSession() {
  const token = tokenHelper.get();
  if (cache.token !== token) cache = { token, at: 0, rows: null, promise: null };
  return token;
}

async function loadAllPages() {
  // ALWAYS the superset: leavers included, widest projection. One read serves
  // both kinds of caller, so a picker that hides leavers can never cost a
  // second trip to the server.
  const base = { purpose: "emp_report", limit: PAGE_LIMIT, include_inactive: true };

  const first = await organizationAPI.getEmployees({ ...base, page: 1 });
  const firstPage = normalizePaginated(first, KEYS, { page: 1, limit: PAGE_LIMIT });
  const pages = Math.min(MAX_PAGES, firstPage.totalPages);

  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => organizationAPI.getEmployees({ ...base, page: i + 2 })))
    : [];

  // Someone joining mid-load can shift a row onto the next page; keep it once.
  const seen = new Set();
  const all = [];
  for (const row of [firstPage.items, ...rest.map((res) => normalizePaginated(res, KEYS).items)].flat()) {
    const key = row?.user_id ?? row?.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    all.push(row);
  }
  return all;
}

const isActive = (row) => row?.is_active !== false && row?.status !== "inactive";

/**
 * The organisation's people. Screens don't call this — they read
 * `useEmployeeDirectory()` (shared/contexts/EmployeeDirectoryContext), which is
 * built on it; this is the network layer underneath.
 *
 * @param {{ includeInactive?: boolean, maxAgeMs?: number }} [options]
 *   `includeInactive: false` FILTERS the one list, it never asks for a
 *   different one. `maxAgeMs` — accept a cached copy only this fresh: the rows'
 *   `avatar_url`s are presigned links that expire ~5 minutes after the read
 *   (30 Sep 2026), so a caller that keeps photos asks for a younger copy than
 *   the default.
 * @returns {Promise<object[]>} every employee row, unique by `user_id`
 */
export function fetchAllOrgEmployees({ includeInactive = true, maxAgeMs = CACHE_MS } = {}) {
  const token = sameSession();
  const pick = (rows) => (includeInactive ? rows : rows.filter(isActive));

  if (cache.rows && Date.now() - cache.at < Math.min(maxAgeMs, CACHE_MS)) return Promise.resolve(pick(cache.rows));
  // A second screen mounting while the first is still loading shares the request.
  if (cache.promise) return cache.promise.then(pick);

  const promise = loadAllPages()
    .then((rows) => {
      if (cache.token === token) cache = { token, at: Date.now(), rows, promise: null };
      return rows;
    })
    .catch((err) => {
      if (cache.token === token) cache = { token, at: 0, rows: null, promise: null };
      throw err;
    });

  cache = { token, at: 0, rows: cache.rows, promise };
  return promise.then(pick);
}

/** Drop the cached roster, e.g. after inviting or deactivating someone. */
export function clearOrgEmployeesCache() {
  cache = { token: null, at: 0, rows: null, promise: null };
}
