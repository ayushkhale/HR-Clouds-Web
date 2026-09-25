// ─────────────────────────────────────────────────────────────────────────────
// documents/requestMeta.js — Labels, tones and business rules for Phase 4:
// document requests (#80–#85, #93–#95, #97) and the required-document
// checklist (#86, #96, #98).
//
// Two ideas the screens lean on:
//
//   A request is a task, not a document. Somebody asked one person for one
//   kind of document by a date. It ends on its own: confirming a matching
//   upload fulfils it inside the same transaction, so no screen ever "closes"
//   one. The only manual endings are Cancel (with a reason) and, before that,
//   a Remind nudge that the server allows once a calendar day.
//
//   A checklist is derived, never stored. The server works out which kinds of
//   document this person must hold from their department, location, employment
//   type and job status, then classifies each one against what they actually
//   have. Every state here is the server's word; nothing is recomputed.
//
// Contract source: phase4_api_analysis-2.md §1.1–§1.2 and
// documents_phase4_requests_and_notifications_2026_09_25.md §1.
// ─────────────────────────────────────────────────────────────────────────────

import { groupLabel, humanizeCode } from "./documentMeta";

// ── Request status ──────────────────────────────────────────────────────────
// Tones are the app's purple-family TONE_CLASSES keys; rose stays rose, because
// an overdue request is the one state that needs somebody to move.
export const REQUEST_STATUS = {
  open: { label: "Waiting", short: "Waiting", tone: "amber", hint: "Asked for, and the due date hasn't passed yet." },
  overdue: { label: "Overdue", short: "Overdue", tone: "rose", hint: "The due date has passed and nothing has been uploaded." },
  fulfilled: { label: "Done", short: "Done", tone: "emerald", hint: "A matching document arrived, so this closed itself." },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "slate", hint: "Withdrawn, with a reason. Nothing is expected any more." },
};

export const requestStatusMeta = (status) =>
  REQUEST_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

/**
 * Filters above a request list. These are OUR values, not the server's statuses,
 * and `requestFilterQuery` turns each one into the query it needs — see the
 * comment there for why "Overdue" isn't `status=overdue`.
 */
export const OVERDUE_ONLY = "overdue_only";
export const OUTSTANDING = "outstanding";

export const REQUEST_FILTERS = [
  { value: "", label: "All" },
  { value: OVERDUE_ONLY, label: "Overdue" },
  { value: OUTSTANDING, label: "Still open" },
  { value: "fulfilled", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * A filter value → the query parameters #82 / #94 / #97 need.
 *
 * "Overdue" deliberately does NOT send `status=overdue`. The open → overdue flip
 * is only written down by the 08:00 job, so a request that fell due overnight
 * still has `status: "open"` in the database and would be missed — while
 * `overdue_only` is judged against today's date on every read and is therefore
 * right at any hour. For the same reason "Still open" sends BOTH statuses rather
 * than just `open`: the two together are exactly "not yet settled", whichever
 * side of the nightly job you ask on.
 */
export function requestFilterQuery(filter) {
  if (filter === OVERDUE_ONLY) return { overdue_only: true };
  if (filter === OUTSTANDING) return { status: ["open", "overdue"] };
  return filter ? { status: filter } : {};
}

/** The filter values worth a headline tile, in the order they are shown. */
export const REQUEST_TALLIES = [OVERDUE_ONLY, OUTSTANDING, "fulfilled", "cancelled"];

// A request that still wants something. Both count as open for #8's deactivate
// guard, which is why deactivating a type can now fail on an overdue request.
const ACTIVE_STATUSES = ["open", "overdue"];
const isRequestActive = (req) => ACTIVE_STATUSES.includes(requestDisplayStatus(req));

/**
 * The status to show.
 *
 * `open → overdue` is persisted by the 08:00 IST job but derived on every read,
 * so a list can legitimately hand back `open` with a negative `days_until_due`
 * in the minutes before the job runs. Reading the countdown keeps the badge, the
 * tally and the server's own verdict in agreement instead of drifting for a day.
 */
export function requestDisplayStatus(req) {
  const status = req?.status;
  if (status !== "open") return status;
  const days = Number(req?.days_until_due);
  return Number.isFinite(days) && days < 0 ? "overdue" : "open";
}

// The server stops reminding after this many (DOCUMENT_REQUEST_MAX_REMINDERS),
// and #85 then answers `reminded: false` rather than an error.
export const REQUEST_MAX_REMINDERS = 5;

/** Cancel is legal from open and overdue only (#84 / #95 → 409 REQUEST_NOT_OPEN). */
export const canCancelRequest = (req) => isRequestActive(req);

/**
 * Remind is legal from open and overdue too, but it is only ever *useful* once
 * the due date has passed — before that the employee has time left, and the
 * server would happily burn one of their five reminders on a document that
 * isn't late. So the button is offered on overdue rows only.
 */
export const canRemindRequest = (req) => requestDisplayStatus(req) === "overdue";

/** Reminded already today, so #85 would answer `reminded: false`. */
export const remindedToday = (req, today) => !!req?.last_reminder_on && String(req.last_reminder_on).slice(0, 10) === today;

/** A type's category, for the second line of a request row. */
export const groupLabelOfType = (type) => (type?.group ? groupLabel(type.group) : "Document");

/** Who asked. `requested_by_role` is 'hr' or 'manager'. */
export const requesterRoleLabel = (role) => (role === "manager" ? "their manager" : role === "hr" ? "HR" : "someone");

/** Due-date bounds the server enforces on #80 / #93: today .. today + 365 (IST). */
export const REQUEST_DUE_MAX_DAYS = 365;
export const REQUEST_NOTE_MAX = 1000;
/**
 * The server accepts 1..500. One character is legal but useless on a record
 * somebody will read back in a year, so the dialog asks for a few more — this
 * is a quality gate of ours, not the contract's rule.
 */
export const CANCEL_REASON_MIN = 5;
export const CANCEL_REASON_MAX = 500;
/** #81 raises at most this many in one go (CHECKLIST_BULK_MAX). */
export const CHECKLIST_BULK_MAX = 50;

// ── Checklist item state ────────────────────────────────────────────────────
// Priority order is the server's (`classifyChecklistItem`): expired outranks
// satisfied, so a document past its date never reads as complete.
export const CHECKLIST_STATES = {
  satisfied: { label: "On file", short: "On file", tone: "emerald", counts: true, hint: "A valid document of this kind is on file." },
  expiring: { label: "Expiring soon", short: "Expiring soon", tone: "orange", counts: true, hint: "Still valid, but close to its expiry date. Upload the renewed copy." },
  expired: { label: "Expired", short: "Expired", tone: "rose", counts: false, hint: "The document on file is past its expiry date." },
  pending_upload: { label: "Upload not finished", short: "Not finished", tone: "slate", counts: false, hint: "An upload was started but the file never arrived." },
  requested: { label: "Asked for", short: "Asked for", tone: "amber", counts: false, hint: "A request is open for this. Waiting on the employee." },
  missing: { label: "Not provided", short: "Not provided", tone: "slate", counts: false, hint: "Nothing on file and nothing asked for yet." },
};

export const checklistStateMeta = (state) =>
  CHECKLIST_STATES[state] || { label: humanizeCode(state) || "N/A", short: humanizeCode(state) || "N/A", tone: "slate", counts: false, hint: "" };

/** Display order in the checklist: what needs doing first, then what is settled. */
export const CHECKLIST_STATE_ORDER = ["expired", "missing", "requested", "pending_upload", "expiring", "satisfied"];
const STATE_RANK = Object.fromEntries(CHECKLIST_STATE_ORDER.map((s, i) => [s, i]));

/** A checklist item that counts towards the completeness score (satisfied or expiring). */
const itemCounts = (item) => checklistStateMeta(item?.state).counts;

/** What #81 would raise a request for: missing or expired, in the server's own words. */
const BULK_REQUEST_STATES = ["missing", "expired"];
export const isOutstanding = (item) => BULK_REQUEST_STATES.includes(item?.state);

/** An item somebody still has to act on — wider than #81's set, for the "to do" tally. */
export const needsAction = (item) => !itemCounts(item);

// ── Payload readers ─────────────────────────────────────────────────────────
/**
 * `{ total, rows }` from a Phase 4 list, tolerating a bare array.
 * Shares the shape of `listPayload` but is kept separate so a change to one
 * plane's paging can't quietly alter the other's.
 */
export function requestListOf(res) {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return { rows: data, total: data.length };
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return { rows, total: Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length };
}

const EMPTY_COMPLETENESS = { required: 0, satisfied: 0, percent: null, threshold: null, meets_threshold: null };

/**
 * A checklist response, normalised so a screen never has to guard every field.
 *
 * `items` is sorted into what needs doing first — the server returns them in
 * type display order, which buries the one missing document under nine that are
 * already on file.
 *
 * `profile_incomplete` is only present when true: it means the employee's
 * department / location / employment type / job status are all still blank, so
 * the required set is the smallest safe one and will grow once the profile is
 * filled in. That is worth saying out loud rather than showing "100% complete".
 */
export function checklistOf(res) {
  const data = res?.data ?? res ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  const c = data.completeness || {};
  return {
    userId: data.user_id || "",
    profileIncomplete: data.profile_incomplete === true,
    completeness: {
      required: Number(c.required) || 0,
      satisfied: Number(c.satisfied) || 0,
      percent: Number.isFinite(Number(c.percent)) ? Number(c.percent) : EMPTY_COMPLETENESS.percent,
      threshold: Number.isFinite(Number(c.threshold)) ? Number(c.threshold) : EMPTY_COMPLETENESS.threshold,
      meets_threshold: typeof c.meets_threshold === "boolean" ? c.meets_threshold : null,
    },
    items: [...items].sort((a, b) => (STATE_RANK[a?.state] ?? 99) - (STATE_RANK[b?.state] ?? 99) || String(a?.name || "").localeCompare(String(b?.name || ""))),
  };
}

/** How many items sit in each state, for the tiles above a checklist. */
export function countByState(items = []) {
  const out = {};
  items.forEach((item) => { out[item?.state] = (out[item?.state] || 0) + 1; });
  return out;
}

/** `{ created, skipped }` from #81, whatever the server omitted. */
export function bulkResultOf(res) {
  const data = res?.data ?? res ?? {};
  return {
    created: Array.isArray(data.created) ? data.created : [],
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
  };
}

/** A sentence for what #81 just did. */
export function bulkResultMessage({ created, skipped }) {
  const made = created.length;
  const past = skipped.length;
  if (!made && !past) return "Nothing needed asking for.";
  const parts = [];
  if (made) parts.push(`Asked for ${made} ${made === 1 ? "document" : "documents"}`);
  if (past) parts.push(`${past} ${past === 1 ? "was" : "were"} already asked for`);
  return `${parts.join(" · ")}.`;
}

// ── "Required for" targeting on a document type (#4 / #7 `mandatory_for`) ───
// Phase 4 is the first reader of this field, and it is now validated strictly:
// an unknown key, or a person in both the include and exclude list, is a 400.
// The subtree deliberately opts out of the server's stripUnknown, because `{}`
// means "required of everyone" — a silently dropped typo would WIDEN the rule
// instead of narrowing it. So the form sends these six keys and nothing else.
const MANDATORY_DIMENSIONS = [
  { key: "target_departments", label: "Departments", kind: "department" },
  { key: "target_locations", label: "Locations", kind: "location" },
  { key: "target_employment_types", label: "Employment types", kind: "employment_type" },
  { key: "target_job_statuses", label: "Job statuses", kind: "job_status" },
  { key: "included_users", label: "Only these people", kind: "person" },
  { key: "excluded_users", label: "Except these people", kind: "person" },
];
const MANDATORY_KEYS = MANDATORY_DIMENSIONS.map((d) => d.key);

/** Every dimension is capped at 200 unique entries. */
export const MANDATORY_ARRAY_MAX = 200;

/**
 * The two enum dimensions are exact codes, not free text — the server rejects
 * anything else. They are listed here rather than read off the roster (which
 * only knows the values people happen to have) so a brand-new organisation can
 * still target a job status nobody holds yet.
 *
 * These are the same codes the invite form writes to a profile, which is what
 * makes the match work at all.
 */
export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];
export const JOB_STATUS_OPTIONS = [
  { value: "probation", label: "On probation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "notice_period", label: "On notice" },
  { value: "terminated", label: "Terminated" },
  { value: "trainee", label: "Trainee" },
  { value: "contract", label: "On contract" },
  { value: "temporary", label: "Temporary" },
];

const asList = (value) => (Array.isArray(value) ? [...new Set(value.filter(Boolean))] : []);

/** The six arrays of a stored `mandatory_for`, with anything unrecognised left behind. */
export function mandatoryCriteria(type) {
  const source = type?.mandatory_for && typeof type.mandatory_for === "object" ? type.mandatory_for : {};
  return Object.fromEntries(MANDATORY_DIMENSIONS.map((d) => [d.key, asList(source[d.key])]));
}

/** No dimension set at all: required of everyone. */
export const isRequiredOfEveryone = (criteria) => MANDATORY_KEYS.every((key) => asList(criteria?.[key]).length === 0);

/**
 * A `mandatory_for` object to send. Only the six keys, only non-empty arrays.
 *
 * An empty array and an absent key mean the same thing to the matcher ("don't
 * narrow on this dimension"), so empties are dropped: it keeps the stored
 * object small and keeps `{}` reading unambiguously as "everyone".
 */
export function buildMandatoryFor(criteria) {
  const out = {};
  MANDATORY_KEYS.forEach((key) => {
    const values = asList(criteria?.[key]).slice(0, MANDATORY_ARRAY_MAX);
    if (values.length) out[key] = values;
  });
  return out;
}

/** Why the server would refuse this targeting, or "" when it wouldn't. */
export function mandatoryForProblem(criteria) {
  const included = asList(criteria?.included_users);
  const excluded = new Set(asList(criteria?.excluded_users));
  const clash = included.filter((id) => excluded.has(id));
  if (clash.length) {
    return `${clash.length === 1 ? "One person is" : `${clash.length} people are`} in both “Only these people” and “Except these people”. Take them out of one of the two.`;
  }
  const over = MANDATORY_DIMENSIONS.find((d) => asList(criteria?.[d.key]).length > MANDATORY_ARRAY_MAX);
  if (over) return `${over.label} can hold at most ${MANDATORY_ARRAY_MAX} entries.`;
  // A row saved before Phase 4 validated this field may hold a free-text value
  // such as "Full-time" where the server now wants the exact code. Saying so
  // here beats letting the save fail on a rule the user can't see.
  const stale = [
    ["Employment types", asList(criteria?.target_employment_types), EMPLOYMENT_TYPE_OPTIONS],
    ["Job statuses", asList(criteria?.target_job_statuses), JOB_STATUS_OPTIONS],
  ].flatMap(([label, values, options]) => {
    const allowed = new Set(options.map((o) => o.value));
    return values.filter((v) => !allowed.has(v)).map((v) => `${label}: “${v}”`);
  });
  if (stale.length) {
    return `${stale.join(", ")} ${stale.length === 1 ? "isn’t" : "aren’t"} a value we recognise any more — most likely saved before this rule was tightened. Remove it and pick from the list.`;
  }
  return "";
}

/**
 * One line describing who a type is required of. `resolve(kind, id)` names a
 * department, location or person; anything it can't name is counted instead.
 */
export function describeRequiredFor(criteria, resolve) {
  if (isRequiredOfEveryone(criteria)) return "Required of everyone";
  const parts = [];
  MANDATORY_DIMENSIONS.forEach((d) => {
    const values = asList(criteria?.[d.key]);
    if (!values.length) return;
    const names = values.map((id) => {
      if (d.kind === "employment_type") return EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === id)?.label || humanizeCode(id);
      if (d.kind === "job_status") return JOB_STATUS_OPTIONS.find((o) => o.value === id)?.label || humanizeCode(id);
      return resolve?.(d.kind, id) || null;
    }).filter(Boolean);
    const shown = names.length === values.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "") : `${values.length}`;
    parts.push(`${d.label.toLowerCase()}: ${shown}`);
  });
  return parts.join(" · ");
}

// ── Notification outbox (#87) ───────────────────────────────────────────────
export const NOTIFICATION_EVENTS = {
  document_uploaded: { label: "Document uploaded", blurb: "Tells HR that somebody has added a document to review." },
  document_expiring: { label: "Document expiring", blurb: "Warns the employee before one of their documents runs out." },
  acknowledgement_pending: { label: "Policy waiting to be read", blurb: "Daily nudge while a company document still needs acknowledging or signing." },
  document_request_raised: { label: "Document asked for", blurb: "Tells the employee what has been asked of them and by when." },
  document_request_overdue: { label: "Document overdue", blurb: "Daily nudge once a requested document passes its due date." },
};
export const notificationEventMeta = (event) =>
  NOTIFICATION_EVENTS[event] || { label: humanizeCode(event) || "N/A", blurb: "" };

export const NOTIFICATION_EVENT_ORDER = Object.keys(NOTIFICATION_EVENTS);

export const NOTIFICATION_STATUS = {
  pending: { label: "Waiting to send", short: "Waiting", tone: "amber", hint: "In the queue. The sender runs every 15 minutes." },
  sending: { label: "Sending", short: "Sending", tone: "blue", hint: "Picked up by the sender right now." },
  sent: { label: "Sent", short: "Sent", tone: "emerald", hint: "Handed to the email service." },
  failed: { label: "Failed", short: "Failed", tone: "rose", hint: "Gave up after five tries. Kept for the record." },
  skipped: { label: "Not sent", short: "Not sent", tone: "slate", hint: "Deliberately skipped — the setting was off, or there was nobody to send to." },
};
export const notificationStatusMeta = (status) =>
  NOTIFICATION_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

export const NOTIFICATION_STATUS_ORDER = ["pending", "sending", "sent", "failed", "skipped"];

/** Who the notice went to: a named person, or a role like "every HR administrator". */
export function recipientLabel(row, nameOf) {
  if (row?.recipient_user_id) return nameOf?.(row.recipient_user_id, "A colleague") || "A colleague";
  if (row?.recipient_role) return `Everyone in ${humanizeCode(row.recipient_role)}`;
  return "N/A";
}

// ── The nightly jobs (#88–#92, and #125/#129 from Phase 5) ──────────────────
// Each answers 200 even when part of it failed, with the failures in `errors[]`,
// so a screen must read `ok` and `errors` rather than trusting the status code.
// `counters` are the job-specific numbers merged into the same object; they are
// listed so a run can be reported in plain words instead of raw keys.
//
// `destructive` means files are deleted for good. `confirmMessage` means the run
// changes records that can't be put back, without deleting anything — the
// offboarding sweep archives leavers' files, which is not the same as clearing
// out storage but is still worth asking about.
export const DOCUMENT_JOBS = [
  {
    key: "expiry_sweep",
    call: "runExpirySweep",
    title: "Mark expired documents",
    blurb: "Moves documents whose expiry date has passed to Expired. Lists already show them as expired — this writes it down.",
    schedule: "Every night at 00:30",
    counters: [["flipped", "marked expired"]],
    destructive: false,
  },
  {
    key: "document_reminders",
    call: "runDocumentReminders",
    title: "Send reminders",
    blurb: "Marks requests whose due date has passed as overdue, then queues the expiry, policy and overdue-request notices for today.",
    schedule: "Every morning at 08:00",
    counters: [
      ["overdue_flipped", "requests marked overdue"],
      ["expiry", "expiry reminders"],
      ["acknowledgement", "policy reminders"],
      ["request_overdue", "overdue-document reminders"],
    ],
    destructive: false,
  },
  {
    key: "notification_dispatch",
    call: "runNotificationDispatch",
    title: "Send queued emails",
    blurb: "Empties the outbox by handing everything waiting to the email service. Anything that fails is retried later, up to five times.",
    schedule: "Every 15 minutes",
    counters: [["claimed", "picked up"], ["sent", "sent"], ["failed", "failed"], ["skipped", "skipped"]],
    destructive: false,
  },
  {
    key: "recipient_topup",
    call: "runRecipientTopup",
    title: "Give new joiners company documents",
    blurb: "Adds people who joined recently to the company documents already published to people like them. Their deadline starts today, so nobody joins already overdue.",
    schedule: "Every night at 01:00",
    counters: [["documents", "documents checked"], ["recipients", "people added"]],
    destructive: false,
  },
  {
    key: "offboarding_archive",
    call: "runOffboardingArchive",
    title: "Close down leavers' paperwork",
    blurb: "Finds everybody whose last working day has passed and closes their file down: documents archived, unsigned policies excused, open requests withdrawn and queued emails stopped. People already removed from the organisation are swept up too.",
    schedule: "Every night at 02:10",
    counters: [["exits", "leavers closed down"], ["removed", "removed members tidied up"]],
    destructive: false,
    confirmMessage:
      "Close down the paperwork of everyone who has already left?\n\nTheir documents are archived (not deleted), policies they never signed are excused, open requests are withdrawn and queued emails to them are stopped. Anything they did sign is untouched.\n\nThis runs tonight anyway — running it now just does it early. It can't be undone.",
  },
  {
    key: "publish_materialisation",
    call: "runPublishMaterialisation",
    title: "Finish a very large publish",
    blurb: "When a company document goes to more people than can be handed out in one go, the rest are filled in by this. It runs by itself every few minutes; there is rarely any reason to press it.",
    schedule: "Every 5 minutes",
    counters: [["documents", "documents worked on"], ["recipients", "people added"]],
    destructive: false,
  },
  {
    key: "document_sweeper",
    call: "runDocumentSweeper",
    title: "Clear out old files",
    blurb: "Deletes uploads abandoned more than a day ago, permanently removes deleted documents past their retention period, and trims sent email records older than 90 days.",
    schedule: "Every night at 03:30",
    counters: [["abandoned", "abandoned uploads cleared"], ["purged", "documents permanently removed"], ["outbox_purged", "old email records trimmed"]],
    destructive: true,
  },
];

/** A run result (#88–#92), normalised. `ok: false` or a non-empty `errors` is a partial failure. */
export function jobResultOf(res) {
  const data = res?.data ?? res ?? {};
  const errors = Array.isArray(data.errors) ? data.errors : [];
  return {
    job: data.job || "",
    ok: data.ok !== false && errors.length === 0,
    durationMs: Number.isFinite(Number(data.duration_ms)) ? Number(data.duration_ms) : null,
    errors,
    raw: data,
  };
}

/** "3 marked expired" / "Nothing needed doing", from a job's own counters. */
export function jobResultSummary(job, result) {
  const parts = (job?.counters || [])
    .map(([key, noun]) => [Number(result?.raw?.[key]) || 0, noun])
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n.toLocaleString("en-IN")} ${noun}`);
  if (!parts.length) return "Nothing needed doing.";
  return `${parts.join(" · ")}.`;
}
