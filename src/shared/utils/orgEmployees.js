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
// organisation. Results are now shared through a short in-memory cache, keyed
// by session token so another login never sees them, and dropped when the tab
// closes. `clearOrgEmployeesCache()` forces the next read to refetch.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI, tokenHelper } from "../api";
import { normalizePaginated } from "../attendance/normalize";

const PAGE_LIMIT = 100; // backend maximum
const MAX_PAGES = 50; // 5,000 people; a safety stop, not an expected size
const KEYS = ["employees", "records"];
const CACHE_MS = 5 * 60_000;

let cache = { token: null, entries: new Map() };

function entryFor(includeInactive) {
  const token = tokenHelper.get();
  if (cache.token !== token) cache = { token, entries: new Map() };
  return { token, key: includeInactive ? "with-inactive" : "active-only" };
}

async function loadAllPages(includeInactive) {
  const base = { purpose: "emp_report", limit: PAGE_LIMIT };
  if (includeInactive) base.include_inactive = true;

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

/**
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {Promise<object[]>} every employee row, unique by `user_id`
 */
export function fetchAllOrgEmployees({ includeInactive = true } = {}) {
  const { token, key } = entryFor(includeInactive);
  const hit = cache.entries.get(key);
  if (hit?.rows && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.rows);
  // A second screen mounting while the first is still loading shares the request.
  if (hit?.promise) return hit.promise;

  const promise = loadAllPages(includeInactive)
    .then((rows) => {
      if (cache.token === token) cache.entries.set(key, { at: Date.now(), rows, promise: null });
      return rows;
    })
    .catch((err) => {
      if (cache.token === token) cache.entries.delete(key);
      throw err;
    });

  cache.entries.set(key, { at: 0, rows: hit?.rows || null, promise });
  return promise;
}

/** Drop the cached roster, e.g. after inviting or deactivating someone. */
export function clearOrgEmployeesCache() {
  cache = { token: null, entries: new Map() };
}
