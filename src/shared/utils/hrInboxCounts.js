// ─────────────────────────────────────────────────────────────────────────────
// hrInboxCounts.js — How many items wait on HR in each approval queue.
//
// ─── THIS IS THE FALLBACK, NOT THE WAY ─────────────────────────────────────
// `GET /inbox/badges` (#278) answers all of this in ONE request, and
// badgeCountsStore.js is what every screen reads. The fan-out below — thirteen
// requests for thirteen numbers — only runs on a server that has no badge
// endpoint yet, so that an un-deployed backend leaves the badges working
// rather than blank. Nothing new should be added here: a queue added to the
// Inbox belongs in the badge endpoint and in the store's category list.
//
// It is also why the counts could only be read once a minute, and why the
// sidebar and the page it links to drifted apart after a decision.
//
// One module-level cache keyed by the session token, so the sidebar and the
// page share a single round of requests and another login starts from zero.
// A queue that fails to load counts as `null` (shown as N/A), never as 0.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI, documentsAPI, leaveAPI, payrollAPI, tasksAPI, tokenHelper } from "../api";
import { normalizePaginated } from "../attendance/normalize";
import { isProposalQueueMissing } from "./documentErrors";
import { currentFY } from "../../roles/hr/payroll/fyUtils";

// Ten queues cost eleven requests, so this is deliberately long: the badge is a
// hint, not a live figure. Decisions refresh it through attendance events, and
// the HR Inbox has its own Refresh button.
const CACHE_MS = 60_000;

const total = (keys) => (res) => normalizePaginated(res, keys).total;

/** key → loader returning the number of pending items. */
export const HR_INBOX_QUEUES = [
  { key: "leaves", load: () => leaveAPI.getTeamPendingRequests().then(total(["requests", "leaves"])) },
  { key: "regularizations", load: () => attendanceAPI.getManagerPendingRegularizations().then(total(["requests", "regularizations"])) },
  { key: "overtime", load: () => attendanceAPI.getManagerPendingOvertime().then(total(["requests", "overtime"])) },
  { key: "compOffs", load: () => attendanceAPI.getManagerCompOffs().then(total(["comp_offs", "compOffs", "requests"])) },
  { key: "anomalies", load: () => attendanceAPI.getManagerAnomalies().then(total(["anomalies"])) },
  {
    // Deliverables handed in and waiting on a reviewer (Task Phase 3, #259).
    // `team-tasks` is the shared read on purpose: it hierarchy-filters a
    // manager to their own reports and returns the whole organisation for HR
    // (#257), which is exactly the scope each of them may approve.
    key: "tasks",
    load: () => tasksAPI.getTeamTasks({ status: "in_review", limit: 1 }).then(total(["tasks"])),
  },
  { key: "salaryApprovals", load: () => payrollAPI.getProposals({ status: "proposed" }).then(total(["proposals", "records"])) },
  {
    key: "claims",
    // Only the claims a manager passed up. The ones that come straight to HR
    // on a single-approval chain need `pending_hr=true`, which a server
    // without the badge endpoint does not have — and would strip in silence,
    // returning every claim ever filed. Narrow and right beats wide and wrong.
    load: () => payrollAPI.getReimbursementClaims({ status: "under_review", limit: 1 }).then(total(["claims", "records"])),
  },
  { key: "loans", load: () => payrollAPI.getLoans({ status: "pending" }).then(total(["loans", "records"])) },
  {
    key: "declarations",
    load: () => payrollAPI.getDeclarationQueue({ financial_year: currentFY(), status: "submitted" }).then(total(["records", "declarations"])),
  },
  {
    // Devices waiting on HR, which only exist where the device-trust policy is
    // set to "HR approves each device" (Device Trust, 15 Oct 2026, #8).
    key: "devices",
    load: () =>
      attendanceAPI.getTrustedDevices({ status: "pending", limit: 1 })
        .then(total(["items", "devices"]))
        // A server without device trust answers 404/403/501 here. That is "no
        // such queue on this server", which is honestly zero — not the `null`
        // that would leave N/A on the badge for ever (see letterProposals).
        .catch((err) => {
          const status = err?.status;
          if (status === 400 || status === 403 || status === 404 || status === 501) return 0;
          throw err;
        }),
  },
  {
    // Letters a manager has asked HR to issue (PDF Phase 4, #148).
    key: "letterProposals",
    load: () =>
      documentsAPI.getLetterProposals({ status: "pending", limit: 1, offset: 0 })
        .then(total(["proposals", "records"]))
        // A server from before Phase 4 reads "proposals" as a letter id and
        // answers 400 or 404. That is "this server has no such queue", which is
        // honestly zero — not the `null` that would put N/A on the badge for
        // ever on every server that hasn't been updated yet.
        .catch((err) => {
          if (isProposalQueueMissing(err)) return 0;
          throw err;
        }),
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

// `inboxTotal` moved to badgeCountsStore.js as `sumCounts`: the total has to be
// the same arithmetic whichever way the counts were read.
