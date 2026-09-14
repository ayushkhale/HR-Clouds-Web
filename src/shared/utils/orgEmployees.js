// ─────────────────────────────────────────────────────────────────────────────
// orgEmployees.js — The whole organisation employee list, for resolving the
// `user_id`s payroll and attendance responses carry into names.
//
// `GET /organizations/employees` is paginated (max 100 per page) and hides
// inactive people by default. A leaver who is still in last month's payroll run
// must resolve too, so name lookups load every page with inactive people
// included. The rows carry PII (PAN, addresses): keep them in memory only —
// never cache them in storage or log them.
// ─────────────────────────────────────────────────────────────────────────────

import { organizationAPI } from "../api";
import { normalizePaginated } from "../attendance/normalize";

const PAGE_LIMIT = 100; // backend maximum
const MAX_PAGES = 50; // 5,000 people; a safety stop, not an expected size
const KEYS = ["employees", "records"];

/**
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {Promise<object[]>} every employee row, unique by `user_id`
 */
export async function fetchAllOrgEmployees({ includeInactive = true } = {}) {
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
