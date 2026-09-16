// ─────────────────────────────────────────────────────────────────────────────
// hrInboxCounts.js — How many items wait on HR in each approval queue, for the
// HR Inbox page and its sidebar badge.
//
// One module-level cache keyed by the session token, so the sidebar and the
// page share a single round of requests and another login starts from zero.
// A queue that fails to load counts as `null` (shown as N/A), never as 0.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI, leaveAPI, payrollAPI, tokenHelper } from "../api";
import { normalizePaginated } from "../attendance/normalize";
import { currentFY } from "../../roles/hr/payroll/fyUtils";

// Nine queues cost ten requests, so this is deliberately long: the badge is a
// hint, not a live figure. Decisions refresh it through attendance events, and
// the HR Inbox has its own Refresh button.
const CACHE_MS = 5 * 60_000;

const total = (keys) => (res) => normalizePaginated(res, keys).total;

/** key → loader returning the number of pending items. */
export const HR_INBOX_QUEUES = [
  { key: "leaves", load: () => leaveAPI.getTeamPendingRequests().then(total(["requests", "leaves"])) },
  { key: "regularizations", load: () => attendanceAPI.getManagerPendingRegularizations().then(total(["requests", "regularizations"])) },
  { key: "overtime", load: () => attendanceAPI.getManagerPendingOvertime().then(total(["requests", "overtime"])) },
  { key: "compOffs", load: () => attendanceAPI.getManagerCompOffs().then(total(["comp_offs", "compOffs", "requests"])) },
  { key: "anomalies", load: () => attendanceAPI.getManagerAnomalies().then(total(["anomalies"])) },
  { key: "salaryApprovals", load: () => payrollAPI.getProposals({ status: "proposed" }).then(total(["proposals", "records"])) },
  {
    key: "claims",
    // Claims wait on HR both straight after submission and after a manager's review.
    load: () =>
      Promise.all([
        payrollAPI.getReimbursementClaims({ status: "submitted" }),
        payrollAPI.getReimbursementClaims({ status: "under_review" }),
      ]).then((results) => results.reduce((sum, res) => sum + total(["claims", "records"])(res), 0)),
  },
  { key: "loans", load: () => payrollAPI.getLoans({ status: "pending" }).then(total(["loans", "records"])) },
  {
    key: "declarations",
    load: () => payrollAPI.getDeclarationQueue({ financial_year: currentFY(), status: "submitted" }).then(total(["records", "declarations"])),
  },
];

let cache = { token: null, at: 0, counts: null, promise: null };

function syncToken() {
  const token = tokenHelper.get();
  if (cache.token !== token) cache = { token, at: 0, counts: null, promise: null };
  return token;
}

/** Last loaded counts for this session, without a request. */
export function peekHrInboxCounts() {
  syncToken();
  return cache.counts;
}

/** `{ [queueKey]: number | null }`. `force` skips the cache, e.g. after a decision. */
export function fetchHrInboxCounts(force = false) {
  const token = syncToken();
  if (!token) return Promise.resolve({});
  if (!force && cache.counts && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.counts);
  if (!force && cache.promise) return cache.promise;

  const promise = Promise.allSettled(HR_INBOX_QUEUES.map((q) => q.load())).then((results) => {
    const counts = {};
    results.forEach((r, i) => {
      counts[HR_INBOX_QUEUES[i].key] = r.status === "fulfilled" && Number.isFinite(r.value) ? r.value : null;
    });
    if (cache.token === token) cache = { token, at: Date.now(), counts, promise: null };
    return counts;
  });
  cache.promise = promise;
  return promise;
}

export const inboxTotal = (counts) => Object.values(counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
