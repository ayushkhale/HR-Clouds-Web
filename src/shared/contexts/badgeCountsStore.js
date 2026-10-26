// ─────────────────────────────────────────────────────────────────────────────
// badgeCountsStore.js — ONE source for every pending-work number in the app.
//
// The sidebar Inbox badge, the twelve HR inbox cards, the manager's six, the
// Bank Verification and Verification Queue badges and the verification tiles
// all read this store. Before it, each of those surfaces counted for itself:
// the HR sidebar alone fired thirteen `limit: 1` requests on mount, so the
// counts were cached for a minute, the sidebar and the Inbox page disagreed
// after a decision, and the Claims card counted a different set of claims from
// the list it opened.
//
// `GET /inbox/badges` (#278) answers all of it in one request, scoped to the
// caller by the server. One poller for the whole app, started by the first
// component that asks and stopped when the last one unmounts — so the employee
// workspace, which shows no badge, never sends a single request.
//
// ─── THE DECISIONS THAT MATTER ─────────────────────────────────────────────
// · NO PROVIDER. A module store with `useSyncExternalStore` (the shape
//   employeeDirectoryStore.js uses) means a badge works wherever it is mounted
//   — including inside a dialog portalled out of the tree — and costs nothing
//   on the pages that don't read it.
// · THE POLLER STOPS WHEN THE TAB IS HIDDEN (§7), and catches up the moment it
//   is looked at again. A background tab left over a weekend would otherwise
//   burn the endpoint's 240-reads-an-hour budget to learn nothing.
// · A DECISION REFRESHES THE COUNTS, DEBOUNCED. Every approve/reject emits on
//   the attendance bus (§7); a bulk approve emits once per row, so the reads
//   are coalesced and floored at MIN_GAP_MS. Without the floor a sixty-row
//   bulk approval would spend a quarter of the hourly budget in one second.
// · A 429 IS OBEYED, NOT RETRIED. The wait comes from the server; the last
//   numbers stay on screen meanwhile. A badge a minute old is not an incident.
//   The window is published, so a Refresh button can be disabled through it
//   rather than doing nothing when pressed (§11), and it announces its own end
//   — nothing else publishes while it is open.
// · AN OLDER SERVER COUNTS THE OLD WAY. A 404 latches `source: "legacy"` and
//   the per-queue fan-out in hrInboxCounts.js / managerInboxCounts.js takes
//   over for the rest of the session, polled a third as often because it costs
//   thirteen to fifteen requests instead of one — an un-upgraded server must
//   not be polled harder than it was before this file existed. Nothing is
//   hidden in that mode: the fan-out cannot tell "you may not see this" from
//   "this failed".
// · UNAVAILABLE IS NOT ZERO. `meta.unavailable_categories` names what this role
//   or this subscription cannot see; those keys are absent from `counts` and
//   the card or badge is HIDDEN rather than rendered as a confident 0 (§2).
//   A queue that merely failed to load is `null`, which reads N/A.
// · THE INBOX TOTAL IS SUMMED HERE, not taken from `sidebar.inbox_total`. The
//   badge has to equal the cards under it, and two of the twelve differ from
//   the server's `total` — see the comment on `inboxTotal` below.
// · THE BELL IS NOT OURS. `categories.notifications` is deliberately dropped:
//   NotificationsContext owns that badge and makes optimistic writes this
//   snapshot can't see, and two owners for one number is how the bell and the
//   sidebar entry end up disagreeing.
// · KEYED BY THE SESSION TOKEN. A logout, another login or an org switch wipes
//   the snapshot before the next paint, and a reply addressed to the previous
//   session is dropped on arrival.
//
// Contract: public/ref docs/md_updates/2026-10-25_badge_counts_and_pending_hr_api_changes.md
// ─────────────────────────────────────────────────────────────────────────────

import { badgeRetryAfterSeconds, isBadgeSummaryMissing } from "../api/inbox.api";
import { documentsAPI, inboxAPI, payrollAPI, tokenHelper } from "../api";
import { decodeJWT } from "../api/client";
import { workspaceForRole } from "../auth/permissions";
import { INBOX_EVENT_KINDS, subscribeAttendanceChanged } from "../attendance/events";
import { fetchHrInboxCounts } from "../utils/hrInboxCounts";
import { fetchManagerInboxCounts } from "../utils/managerInboxCounts";

/** How often the counts are re-read while the tab is in front. */
const POLL_MS = 60_000;
/** The same, on a server still answering through the per-queue fan-out. */
const LEGACY_POLL_MS = 180_000;
/** On returning to the tab, a snapshot older than this is re-read at once. */
const STALE_MS = 30_000;
/** Floor between reads, so a bulk approval cannot spend the hourly budget. */
const MIN_GAP_MS = 5_000;
/** A burst of decisions is one read, not one per row. */
const EVENT_DEBOUNCE_MS = 600;

// ── Shaping the response ────────────────────────────────────────────────────

/**
 * The twelve inbox categories, in the API's names, mapped to the keys the
 * cards and the sidebar have always used.
 *
 * `read` says which figure the card shows. It is `total` everywhere except tax
 * declarations: the API's total is `submitted + under_review`, but the page the
 * card opens lists `submitted` only (it has one status filter, not two), and
 * the rule here is that A CARD COUNTS EXACTLY WHAT ITS PANEL LISTS. Widen one
 * and the other has to widen with it.
 */
const INBOX_CATEGORIES = [
  { api: "leaves", key: "leaves" },
  { api: "regularizations", key: "regularizations" },
  { api: "overtime", key: "overtime" },
  { api: "comp_offs", key: "compOffs" },
  { api: "anomalies", key: "anomalies" },
  { api: "tasks", key: "tasks" },
  { api: "salary_proposals", key: "salaryApprovals" },
  { api: "claims", key: "claims" },
  { api: "loans", key: "loans" },
  { api: "tax_declarations", key: "declarations", read: (c) => num(c.submitted) },
  { api: "devices", key: "devices" },
  { api: "letter_proposals", key: "letterProposals" },
];

/** UI key → the dotted name the server uses in `meta.unavailable_categories`. */
export const INBOX_CATEGORY_PATHS = Object.freeze({
  ...Object.fromEntries(INBOX_CATEGORIES.map((c) => [c.key, `inbox.${c.api}`])),
  myTasks: "tasks",
  myTasksOverdue: "tasks",
  myDocumentRequests: "document_requests",
  myDocumentRequestsOverdue: "document_requests",
  documentRequests: "document_requests",
  documentRequestsOverdue: "document_requests",
});

// Postgres hands `COUNT(*)` back as a string through the driver. The server
// coerces, but a count that arrived as "3" would silently concatenate rather
// than add, so every leaf is forced to a non-negative integer here as well.
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

const EMPTY_COUNTS = Object.freeze({});

/** Reshape the payload into what the screens read. Pure; no network, no state. */
export function shapeBadgeSummary(payload) {
  const data = payload?.data ?? payload ?? {};
  const categories = data.categories || {};
  const inbox = categories.inbox || {};
  const unavailable = new Set(
    Array.isArray(data.meta?.unavailable_categories) ? data.meta.unavailable_categories : [],
  );

  const counts = {};
  INBOX_CATEGORIES.forEach(({ api, key, read }) => {
    // Absent from `counts` means "hide it", which is not the same as 0.
    if (unavailable.has(`inbox.${api}`)) return;
    const category = inbox[api];
    if (!category) return;
    counts[key] = read ? read(category) : num(category.total);
  });

  // Self-service tasks (available across employee workspace and ME dropdowns)
  if (!unavailable.has("tasks") && categories.tasks?.mine) {
    counts.myTasks = num(categories.tasks.mine.open);
    counts.myTasksOverdue = num(categories.tasks.mine.overdue);
  }

  // Document requests:
  // In HR & Manager workspaces (plane === "org" or role hr/admin), `categories.document_requests`
  // represents the organisation-wide collection queue under "DOCUMENTS WE COLLECT > Document Requests".
  // Self-service "My Document Requests" under ME reads from `categories.document_requests.mine` if provided,
  // or `categories.document_requests` when scoped to self (employee).
  if (!unavailable.has("document_requests") && categories.document_requests) {
    const isOrgPlane = data.scope?.plane === "org" || data.scope?.role === "hr" || data.scope?.role === "admin";
    if (isOrgPlane) {
      counts.documentRequests = num(categories.document_requests.outstanding);
      counts.documentRequestsOverdue = num(categories.document_requests.overdue);
      if (categories.document_requests.mine) {
        counts.myDocumentRequests = num(categories.document_requests.mine.outstanding ?? categories.document_requests.mine.open);
        counts.myDocumentRequestsOverdue = num(categories.document_requests.mine.overdue);
      }
    } else {
      counts.myDocumentRequests = num(categories.document_requests.outstanding);
      counts.myDocumentRequestsOverdue = num(categories.document_requests.overdue);
    }
  }

  const group = (name, shape) => (unavailable.has(name) || !categories[name] ? null : shape(categories[name]));

  return {
    counts,
    unavailable,
    plane: data.scope?.plane || null,
    // `null` when the caller sees the whole organisation. 0 is a real answer:
    // a manager with nobody reporting to them, whose empty inbox is correct.
    teamSize: data.scope?.plane === "team" ? num(data.scope?.team_size) : null,
    sidebar: {
      // Summed here rather than taken from `data.sidebar.inbox_total`, which
      // is the server's sum of the twelve `total`s (D-8). Two of those are not
      // what the Inbox shows: tax declarations counts `submitted` to match the
      // list its card opens, and a category in `unavailable_categories` is not
      // on screen at all. The badge has to equal the cards under it, so it is
      // the same arithmetic over the same numbers — and the legacy path sums
      // the same way, so both sources agree too.
      inboxTotal: sumCounts(counts),
      unverifiedBanks: unavailable.has("bank_verification") ? null : num(data.sidebar?.unverified_banks),
      documentVerificationQueue: unavailable.has("document_verification")
        ? null
        : num(data.sidebar?.document_verification_queue),
    },
    groups: {
      documentVerification: group("document_verification", (g) => ({
        waitingDecision: num(g.waiting_decision),
        managerApproved: num(g.manager_approved),
        managerRejected: num(g.manager_rejected),
        noRecommendation: num(g.no_recommendation),
      })),
      bankVerification: group("bank_verification", (g) => ({
        unverified: num(g.unverified),
        verified: num(g.verified),
        missingAccount: num(g.missing_account),
      })),
      documentRequests: group("document_requests", (g) => ({
        outstanding: num(g.outstanding),
        overdue: num(g.overdue),
        fulfilled: num(g.fulfilled),
      })),
    },
    syncedAt: typeof data.synced_at === "string" ? data.synced_at : null,
  };
}

/** Sum of the queue counts on screen. `null` (couldn't load) counts as nothing. */
export function sumCounts(counts) {
  return INBOX_CATEGORIES.reduce((sum, { key }) => sum + (Number(counts?.[key]) || 0), 0);
}

// ── The store ───────────────────────────────────────────────────────────────

const IDLE = Object.freeze({
  token: null,
  /** "idle" before the first read · "loading" · "ready" · "error" ·
   *  "unavailable" for a workspace that shows no badge, which asks for nothing */
  status: "idle",
  /** "badges" once the unified endpoint has answered · "legacy" on an older server */
  source: null,
  counts: EMPTY_COUNTS,
  unavailable: null,
  plane: null,
  teamSize: null,
  sidebar: { inboxTotal: 0, unverifiedBanks: null, documentVerificationQueue: null },
  groups: { documentVerification: null, bankVerification: null, documentRequests: null },
  syncedAt: null,
  error: null,
  loadedAt: 0,
  /** Epoch ms until which the server has told us to stop asking (429). Until
   *  then every read is a no-op, which is the one case where a Refresh button
   *  must be disabled rather than silently doing nothing (§11). */
  cooldownUntil: 0,
});

let snapshot = IDLE;
let inflight = null;
let generation = 0;
let cooldownUntil = 0;
let cooldownTimer = null;
let lastReadAt = 0;
// A decision that arrived while a read was already on the wire: that
// reply was composed before the decision, so it cannot show the result.
let refreshQueued = false;

const listeners = new Set();
let pollTimer = null;
let eventTimer = null;
let unsubscribeEvents = null;
let watchingDocument = false;

export function getBadgeCountsSnapshot() {
  return snapshot;
}

function publish(patch) {
  const next = { ...snapshot, ...patch };
  if (Object.keys(patch).every((k) => Object.is(snapshot[k], next[k]))) return;
  snapshot = next;
  listeners.forEach((notify) => notify());
}

/** Two count maps with the same keys and numbers — don't wake the app for them. */
function sameCounts(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
}

/** Who the signed-in person is, straight from the token the request will carry. */
function session() {
  const token = tokenHelper.get();
  if (!token) return { token: null, workspace: null };
  const claims = decodeJWT(token) || {};
  const orgId = claims.orgId || claims.org_id || null;
  // No organisation means no counts to read: a platform user would get
  // 400 MISSING_ORG_CONTEXT, which is not an error worth showing anybody.
  if (!orgId) return { token, workspace: null };
  return { token, workspace: workspaceForRole(claims.role) };
}

/** Wipe everything the moment the session changes; drop the old replies. */
function resetFor(token) {
  generation += 1;
  inflight = null;
  refreshQueued = false;
  clearTimeout(cooldownTimer);
  cooldownTimer = null;
  cooldownUntil = 0;
  lastReadAt = 0;
  snapshot = { ...IDLE, token };
  listeners.forEach((notify) => notify());
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * The per-queue fan-out, for a server that has no badge endpoint. Thirteen
 * requests for HR, six for a manager — the cost this feature exists to remove,
 * kept only so an un-deployed backend leaves the badges working rather than
 * blank. Nothing is ever hidden here: these reads cannot tell a queue this role
 * may not see from one that failed, and both come back `null` (N/A).
 */
async function readLegacy(workspace, force) {
  if (workspace === "manager") {
    const counts = await fetchManagerInboxCounts(force);
    return { counts, sidebar: { inboxTotal: sumCounts(counts), unverifiedBanks: null, documentVerificationQueue: null } };
  }
  if (workspace === "employee") {
    return { counts: {}, sidebar: { inboxTotal: 0, unverifiedBanks: null, documentVerificationQueue: null } };
  }

  const [queues, docs, banks] = await Promise.allSettled([
    fetchHrInboxCounts(force),
    documentsAPI.getVerificationQueue({ limit: 1 }),
    // Capped at the first page, and so wrong past 100 people — which is one of
    // the reasons the unified endpoint was asked for. Left exactly as it was,
    // because changing an emergency path nobody can test is worse than a known
    // ceiling on a server that is about to be upgraded anyway.
    payrollAPI.getBankAccounts({ page: 1, limit: 100 }),
  ]);

  const counts = queues.status === "fulfilled" ? queues.value : {};
  const docTotal = docs.status === "fulfilled" ? (docs.value?.data?.total ?? docs.value?.total ?? 0) : null;
  let unverified = null;
  if (banks.status === "fulfilled") {
    const res = banks.value;
    const list = res?.data?.items || res?.data?.accounts || res?.data?.bank_accounts || res?.items || [];
    unverified = list.filter((a) => !a.is_verified).length;
  }

  return {
    counts,
    sidebar: {
      inboxTotal: sumCounts(counts),
      unverifiedBanks: unverified,
      documentVerificationQueue: docTotal == null ? null : num(docTotal),
    },
  };
}

async function read({ force = false } = {}) {
  const { token, workspace } = session();

  if (snapshot.token !== token) resetFor(token);
  // Signed out, or a workspace with no badges of its own (a guest,
  // a platform user with no organisation). Nothing is ever requested
  // for them, and nothing waits on a read that will not happen.
  if (!token || !workspace || workspace === "guest") {
    publish({ status: "unavailable" });
    return snapshot;
  }

  const now = Date.now();
  // The cooldown is the server's instruction and outranks a button press; the
  // floor only guards against storms, so a deliberate Refresh ignores it.
  if (now < cooldownUntil) return snapshot;
  if (!force && now - lastReadAt < MIN_GAP_MS) return snapshot;
  if (inflight) {
    if (force) refreshQueued = true;
    return inflight;
  }

  const epoch = generation;
  publish({ status: snapshot.status === "ready" ? "ready" : "loading", error: null });

  inflight = (async () => {
    // Two passes at most: the second only ever happens when the first proves
    // this server has no badge endpoint, so the badges fill in on this paint
    // rather than staying empty until the next poll.
    let legacy = snapshot.source === "legacy";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const shaped = legacy
          ? { ...(await readLegacy(workspace, force)), unavailable: null, source: "legacy" }
          : { ...shapeBadgeSummary(await inboxAPI.getBadgeSummary()), source: "badges" };
        if (epoch !== generation) return snapshot;
        lastReadAt = Date.now();
        publish({
          status: "ready",
          source: shaped.source,
          counts: sameCounts(shaped.counts, snapshot.counts) ? snapshot.counts : shaped.counts,
          unavailable: shaped.unavailable ?? null,
          plane: shaped.plane ?? null,
          teamSize: shaped.teamSize ?? null,
          sidebar: shaped.sidebar,
          groups: shaped.groups || IDLE.groups,
          syncedAt: shaped.syncedAt ?? new Date().toISOString(),
          error: null,
          loadedAt: lastReadAt,
          cooldownUntil: 0,
        });
        return snapshot;
      } catch (err) {
        if (epoch !== generation) return snapshot;
        if (!legacy && isBadgeSummaryMissing(err)) {
          legacy = true;
          publish({ source: "legacy" });
          continue;
        }
        if (err?.status === 429) {
          cooldownUntil = Date.now() + badgeRetryAfterSeconds(err) * 1000;
          // Nothing else will publish before the window closes — the poll is a
          // no-op throughout it — so the end of the cooldown has to announce
          // itself, or a Refresh button disabled on it never comes back.
          clearTimeout(cooldownTimer);
          cooldownTimer = setTimeout(() => {
            cooldownTimer = null;
            if (epoch === generation) publish({ cooldownUntil: 0 });
          }, Math.max(0, cooldownUntil - Date.now()) + 250);
          // Whatever is already on screen stays: a rate limit is not a failure
          // the person reading a sidebar needs to be told about. With nothing
          // read yet there is nothing honest to show but N/A.
          publish(snapshot.loadedAt ? { status: "ready", cooldownUntil } : { status: "error", error: err, cooldownUntil });
          return snapshot;
        }
        lastReadAt = Date.now();
        publish({ status: "error", error: err });
        return snapshot;
      }
    }
    return snapshot;
  })().finally(() => {
    if (epoch !== generation) return;
    inflight = null;
    if (refreshQueued) {
      refreshQueued = false;
      read({ force: true });
    }
  });

  return inflight;
}

/** Read now. `force` skips the floor between reads (the Refresh button). */
export function refreshBadgeCounts({ force = true } = {}) {
  return read({ force });
}

/** First read for a component that has just mounted; cheap if one is current. */
export function ensureBadgeCounts() {
  const { token } = session();
  if (snapshot.token !== token) resetFor(token);
  if (snapshot.status === "unavailable") return;
  if (snapshot.status === "idle" || Date.now() - snapshot.loadedAt > freshMs()) read({ force: false });
}

// ── Lifecycle: nothing runs unless a badge is on screen ─────────────────────

/**
 * How long a snapshot stays good. One request may be re-read every minute; the
 * fallback costs thirteen to fifteen and is read a third as often, or an
 * un-upgraded server would be polled harder than it was before this change.
 */
function freshMs() {
  return snapshot.source === "legacy" ? LEGACY_POLL_MS : POLL_MS;
}

function onVisibility() {
  if (document.visibilityState !== "visible") {
    clearInterval(pollTimer);
    pollTimer = null;
    return;
  }
  // Coming back to the tab is worth a read on its own, but not fifteen
  // requests' worth: on the fallback, the snapshot has to be stale by that
  // path's slower standard first.
  const threshold = snapshot.source === "legacy" ? LEGACY_POLL_MS : STALE_MS;
  if (Date.now() - snapshot.loadedAt > threshold) read({ force: false });
  startPolling();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    // The tick is always a minute; how many ticks are skipped depends on what
    // a read costs on this server. The second of slack absorbs timer drift,
    // which would otherwise turn "every third tick" into every fourth.
    if (Date.now() - snapshot.loadedAt < freshMs() - 1_000) return;
    read({ force: false });
  }, POLL_MS);
}

function startWatching() {
  if (watchingDocument) return;
  watchingDocument = true;
  startPolling();
  document.addEventListener("visibilitychange", onVisibility);
  // Every approve, reject and cancel in the app lands here. Coalesced, because
  // a bulk decision emits once per row.
  unsubscribeEvents = subscribeAttendanceChanged((kind) => {
    if (!INBOX_EVENT_KINDS.includes(kind)) return;
    clearTimeout(eventTimer);
    // Forced, because a decision is the one moment we know the numbers on
    // screen are wrong — dropping it on the floor between reads would leave a
    // badge counting an item the person just cleared, for up to a minute. The
    // floor is honoured by waiting it out instead, so a burst still costs one
    // request and the budget stays intact.
    const wait = Math.max(EVENT_DEBOUNCE_MS, MIN_GAP_MS - (Date.now() - lastReadAt));
    eventTimer = setTimeout(() => read({ force: true }), wait);
  });
}

function stopWatching() {
  watchingDocument = false;
  clearInterval(pollTimer);
  pollTimer = null;
  clearTimeout(eventTimer);
  eventTimer = null;
  clearTimeout(cooldownTimer);
  cooldownTimer = null;
  document.removeEventListener("visibilitychange", onVisibility);
  unsubscribeEvents?.();
  unsubscribeEvents = null;
}

export function subscribeToBadgeCounts(listener) {
  listeners.add(listener);
  if (listeners.size === 1) startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopWatching();
  };
}
