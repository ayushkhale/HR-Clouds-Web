// ─────────────────────────────────────────────────────────────────────────────
// taskMeta.js — Everything the Task Assignment screens know about the domain:
// the six lifecycle states, the four priorities, the five categories, the
// wording for each, and the small predicates that decide which buttons a role
// may see on a given task.
//
// Why it lives here rather than in the JSX (CLAUDE.md §1, §4): the same state
// machine is read by the employee's My Tasks page, the manager's review footer
// and HR's governance detail, and a divergence between three hand-written copies
// is how a role ends up offering a button that 403s.
//
// Contract traps baked in:
//
// • `is_overdue` IS COMPUTED BY THE SERVER PER REQUEST, not stored. List rows
//   carry it; a row we have just written locally may not. `isTaskOverdue()`
//   trusts the field when present and falls back to the same rule the server
//   uses (`due_date < now` and not finished) so a freshly-approved row doesn't
//   flash back to "overdue".
//
// • THE ASSIGNEE ONLY EVER MOVES BETWEEN "pending" AND "in_progress" (#251).
//   Everything else is the reviewer's doing or a submission (#252). A task in
//   `in_review` is frozen for the assignee — the server answers 409 — so the
//   screen must not offer them a status control there.
//
// • A MANAGER MAY NOT REOPEN A COMPLETED TASK; HR MAY (#260, EC-T8), and HR's
//   justification has to be 15 characters rather than 10. Both are encoded in
//   `reopenRule()` so the dialog and the button agree.
//
// • PRIORITY AND CATEGORY HAVE NO TONE OF THEIR OWN. Everything is purple
//   (CLAUDE.md §5); urgency is carried by the word and by the overdue chip,
//   which is the one rose thing on these screens because a missed deadline is
//   the module's only genuine error state.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeStatusKey, humanize } from "../attendance/enums";
import { personName } from "../attendance/normalize";

/**
 * A person summary (`{ id, name, email }`) as a name. The task endpoints embed
 * these, so no roster lookup is needed — but a trimmed list row can leave one
 * out, and an absent person is "N/A" rather than `personName`'s "Unknown
 * employee", which would claim the server told us about somebody it didn't (§4).
 */
export const personNameOrNA = (entity) => (entity ? personName(entity) : "N/A");

/**
 * The same person, for use INSIDE a sentence. "N/A" is right in a labelled
 * field and wrong in prose — "Approving closes the task for N/A" — so an
 * absent person reads as their role instead.
 */
export const personInSentence = (entity, fallback = "this person") => (entity ? personName(entity) : fallback);

// ── Lifecycle ────────────────────────────────────────────────────────────────
// Labels say where the task stands for the person reading them, not the enum
// (§6). "in_review" is the one that needed the most care: to the assignee it
// means "waiting on your reviewer", to the reviewer "waiting on you", so the
// neutral "Waiting for review" is used in both and the footer says who acts.
export const TASK_STATUS = {
  pending: { label: "Not started", tone: "slate" },
  in_progress: { label: "Being worked on", short: "In progress", tone: "blue" },
  in_review: { label: "Waiting for review", short: "In review", tone: "amber" },
  reopened: { label: "Changes requested", tone: "orange" },
  completed: { label: "Done", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const TASK_STATUS_VALUES = Object.keys(TASK_STATUS);

/** Tabs for a task list. "" is every status, including the finished ones. */
export const TASK_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Not started" },
  { value: "in_progress", label: "Being worked on" },
  { value: "in_review", label: "Waiting for review" },
  { value: "reopened", label: "Changes requested" },
  { value: "completed", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

/** Statuses nobody can act on any more. */
export const TERMINAL_TASK_STATUSES = ["completed", "cancelled"];

// ── Priority ─────────────────────────────────────────────────────────────────
export const TASK_PRIORITY = {
  low: { label: "Low" },
  medium: { label: "Medium" },
  high: { label: "High" },
  urgent: { label: "Urgent" },
};
export const TASK_PRIORITY_VALUES = Object.keys(TASK_PRIORITY);
export const TASK_PRIORITY_OPTIONS = TASK_PRIORITY_VALUES.map((value) => ({ value, label: TASK_PRIORITY[value].label }));
export const TASK_PRIORITY_FILTERS = [{ value: "", label: "Any priority" }, ...TASK_PRIORITY_OPTIONS];

// ── Category ─────────────────────────────────────────────────────────────────
// "operational" and "administrative" are the API's words, not words anybody
// says out loud, so the screen shows what the category is for instead (§6).
export const TASK_CATEGORY = {
  operational: { label: "Day-to-day work" },
  compliance: { label: "Rules & compliance" },
  onboarding: { label: "Joining a new person" },
  administrative: { label: "Office admin" },
  general: { label: "Anything else" },
};
export const TASK_CATEGORY_VALUES = Object.keys(TASK_CATEGORY);
export const TASK_CATEGORY_OPTIONS = TASK_CATEGORY_VALUES.map((value) => ({ value, label: TASK_CATEGORY[value].label }));
export const TASK_CATEGORY_FILTERS = [{ value: "", label: "Any kind" }, ...TASK_CATEGORY_OPTIONS];

// ── Labels ───────────────────────────────────────────────────────────────────

/** `{ key, label, longLabel, tone }` for a task status, with a safe fallback. */
export function taskStatusMeta(status) {
  const key = normalizeStatusKey(status);
  const meta = TASK_STATUS[key];
  if (meta) return { key, label: meta.short || meta.label, longLabel: meta.label, tone: meta.tone };
  return { key, label: humanize(key) || "N/A", longLabel: humanize(key) || "N/A", tone: "slate" };
}

export const taskStatusLabel = (status) => taskStatusMeta(status).longLabel;
export const taskPriorityLabel = (priority) =>
  TASK_PRIORITY[normalizeStatusKey(priority)]?.label || humanize(priority) || "N/A";
export const taskCategoryLabel = (category) =>
  TASK_CATEGORY[normalizeStatusKey(category)]?.label || humanize(category) || "N/A";

// ── State questions ──────────────────────────────────────────────────────────

export const isTaskTerminal = (task) => TERMINAL_TASK_STATUSES.includes(normalizeStatusKey(task?.status));

/**
 * Past its deadline and not finished. The server sends `is_overdue` on every
 * list row and detail; this recomputes it only when the field is absent (a row
 * we just wrote, or a trimmed response), using the server's own rule.
 */
export function isTaskOverdue(task) {
  if (typeof task?.is_overdue === "boolean") return task.is_overdue;
  if (!task?.due_date || isTaskTerminal(task)) return false;
  const due = new Date(task.due_date).getTime();
  return Number.isFinite(due) && due < Date.now();
}

/** The deadline has been moved at least once (#263 keeps the original). */
export const wasTaskExtended = (task) =>
  Number(task?.extension_count || 0) > 0
  && !!task?.original_due_date
  && task.original_due_date !== task.due_date;

/** The assignee may flip between "not started" and "being worked on" (#251). */
export const canChangeOwnStatus = (task) => ["pending", "in_progress"].includes(normalizeStatusKey(task?.status));

/** The status the assignee's one button moves the task to, or null. */
export function nextOwnStatus(task) {
  const key = normalizeStatusKey(task?.status);
  if (key === "pending") return "in_progress";
  if (key === "in_progress") return "pending";
  return null;
}

/** Deliverables may be handed over from "being worked on" or "changes requested" (#252). */
export const canSubmitTask = (task) => ["in_progress", "reopened"].includes(normalizeStatusKey(task?.status));

/** Waiting on a reviewer (#259/#260). */
export const isAwaitingReview = (task) => normalizeStatusKey(task?.status) === "in_review";

/**
 * Whether this viewer may send the task back, and on what terms (#260, EC-T8).
 *  • in_review  → anyone who can review it, 10 characters of feedback
 *  • completed  → HR only, and the server insists on 15 characters
 *  • cancelled  → never
 * @param {object} task
 * @param {"manager"|"hr"} viewer
 */
export function reopenRule(task, viewer) {
  const key = normalizeStatusKey(task?.status);
  if (key === "in_review") return { allowed: true, minLength: 10, privileged: false };
  if (key === "completed" && viewer === "hr") return { allowed: true, minLength: 15, privileged: true };
  return { allowed: false, minLength: 10, privileged: false };
}

/** Rework has gone round enough times to be worth saying out loud (#260). */
export const EXCESSIVE_REWORK_CYCLES = 5;
export const hasExcessiveRework = (task) => Number(task?.rework_count || 0) >= EXCESSIVE_REWORK_CYCLES;

// ── The discussion (#253 / #254 / #264) ──────────────────────────────────────

/**
 * Whether anything more can be said on this task (EC-T23).
 *
 * CANCELLED IS THE ONLY LOCK, and it is not the same as `isTaskTerminal`: a
 * COMPLETED task stays open to comment on purpose, so a handover note or a
 * "how did this land?" can still be written after sign-off. Reading the thread
 * is never blocked — a cancelled task's history is exactly what somebody comes
 * looking for a year later.
 */
export const canCommentOnTask = (task) => normalizeStatusKey(task?.status) !== "cancelled";

/**
 * The automated notes #260/#261/#262 write into the thread, keyed by the exact
 * prefix the server stamps on them. The prefixes are machine shouting — a
 * screen never shows "REWORK REQUESTED:" (§4, §6), it shows the same words the
 * audit trail uses for the same event, with the human part underneath.
 *
 * The prefixes are part of the contract and are asserted by the backend's own
 * phase 3 tests, so they are safe to match on; an unrecognised one still
 * renders, as a plain system note, rather than disappearing.
 *
 * The labels are written out rather than read from TASK_AUDIT_ACTIONS below:
 * this list is evaluated at module load and that map is declared after it. The
 * wording is deliberately the same — one event, one name, whether a reader
 * meets it in the thread or in HR's audit table.
 */
const SYSTEM_COMMENT_PREFIXES = [
  { prefix: "REWORK REQUESTED:", label: "Sent back for changes" },
  { prefix: "TASK REASSIGNED:", label: "Handed to someone else" },
  { prefix: "TASK CANCELLED:", label: "Called off" },
];

/**
 * A system note split into what happened and what was said about it.
 * @param {string} message
 * @returns {{ label: string, body: string }}
 */
export function parseSystemComment(message) {
  const text = String(message || "").trim();
  const match = SYSTEM_COMMENT_PREFIXES.find((entry) => text.toUpperCase().startsWith(entry.prefix));
  if (!match) return { label: "System note", body: text };
  return { label: match.label, body: text.slice(match.prefix.length).trim() };
}

// ── Limits the server enforces, so the form can enforce them first ───────────
export const TASK_LIMITS = Object.freeze({
  TITLE_MAX: 200,
  DESCRIPTION_MAX: 5000,
  SUBMISSION_NOTE_MIN: 10,
  SUBMISSION_NOTE_MAX: 2000,
  REASON_MIN: 10,
  REASON_MAX: 500,
  REOPEN_REASON_MAX: 2000,
  APPROVAL_NOTE_MAX: 1000,
  LINK_LABEL_MAX: 100,
  LINK_URL_MAX: 1000,
  LINKS_MAX: 10,
  SUBMISSION_LINKS_MAX: 5,
  ATTACHMENTS_PER_TASK: 20,
  ATTACHMENTS_PER_WRITE: 10,
  COMMENT_MIN: 1,
  COMMENT_MAX: 2000,
  COMMENT_LINKS_MAX: 5,
  // EC-T12: 30 per person per task per UTC hour, then 429 TOO_MANY_COMMENTS.
  // Here only so the screen can say the number in the error; never counted
  // locally, because the window is the server's and it is shared with any
  // other tab the same person has open.
  COMMENTS_PER_HOUR: 30,
  // One page of the feed. The server caps `limit` at 100.
  COMMENTS_PER_PAGE: 50,
  // EC-T6: the server refuses a deadline inside the next quarter of an hour.
  DUE_DATE_MIN_MINUTES: 15,
});

/** The earliest deadline the server will accept, as a Date. */
export const earliestDueDate = () => new Date(Date.now() + TASK_LIMITS.DUE_DATE_MIN_MINUTES * 60_000);

/**
 * Why this deadline can't be used, or "" when it's fine. Mirrors EC-T6 and
 * #263's "strictly after the current deadline" rule so the user hears it before
 * the request goes out.
 */
export function dueDateProblem(iso, { after } = {}) {
  if (!iso) return "Choose a deadline.";
  const when = new Date(iso).getTime();
  if (!Number.isFinite(when)) return "That date can’t be read. Check the day, month and time.";
  if (when < earliestDueDate().getTime()) return "The deadline has to be at least 15 minutes from now.";
  if (after) {
    const current = new Date(after).getTime();
    if (Number.isFinite(current) && when <= current) return "The new deadline has to be later than the one already set.";
  }
  return "";
}

/** An external link row the server will accept, or a reason it won't. */
export function linkProblem({ label, url }) {
  const name = String(label || "").trim();
  const href = String(url || "").trim();
  if (!name && !href) return "";
  if (!name) return "Give the link a name.";
  if (!href) return "Paste the link’s address.";
  if (!/^https:\/\/\S+$/i.test(href)) return "Links have to start with https://";
  if (href.length > TASK_LIMITS.LINK_URL_MAX) return "That address is too long.";
  if (name.length > TASK_LIMITS.LINK_LABEL_MAX) return "That name is too long.";
  return "";
}

/** Drop the blank rows and trim what's left — what the API wants to receive. */
export const cleanLinks = (rows) => (rows || [])
  .map(({ label, url }) => ({ label: String(label || "").trim(), url: String(url || "").trim() }))
  .filter((row) => row.label && row.url);

/** A readable file size for an attachment row. */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * Where an attachment came from (#269 `attachment_context`). All three are
 * written now: "comment" is what the discussion composer stages its files
 * under, so a file posted in the thread is distinguishable from one that came
 * with the brief or with the submission.
 */
export const ATTACHMENT_CONTEXT_LABELS = {
  briefing: "From the brief",
  submission: "Handed in",
  comment: "From the discussion",
};
export const attachmentContextLabel = (context) =>
  ATTACHMENT_CONTEXT_LABELS[normalizeStatusKey(context)] || humanize(context) || "Attached";

/**
 * The audit actions #267 returns, in the words of what happened. Unknown
 * actions fall back to `humanize()` rather than showing the raw enum (§4).
 */
export const TASK_AUDIT_ACTIONS = {
  created: "Task given out",
  first_viewed: "Opened by the assignee",
  status_changed: "Progress updated",
  submitted: "Handed in for review",
  completed: "Approved and closed",
  reopened: "Sent back for changes",
  privileged_reopen: "Reopened by HR after completion",
  reassigned: "Handed to someone else",
  cancelled: "Called off",
  due_date_extended: "Deadline moved",
};
export const taskAuditActionLabel = (action) =>
  TASK_AUDIT_ACTIONS[normalizeStatusKey(action)] || humanize(action) || "Change";

/**
 * The outbox states #267 reports for a queued email. Phase 5 runs the sender,
 * so until it ships every row reads "Queued" — which is honest, not a bug.
 */
export const TASK_NOTIFICATION_STATUS = {
  pending: "Queued to send",
  sent: "Sent",
  failed: "Couldn’t be sent",
  cancelled: "Not sent",
};
export const taskNotificationStatusLabel = (status) =>
  TASK_NOTIFICATION_STATUS[normalizeStatusKey(status)] || humanize(status) || "N/A";

export const TASK_NOTIFICATION_EVENTS = {
  task_assigned: "Told them about the task",
  task_submitted: "Told the reviewer it was handed in",
  task_reopened: "Told them changes were needed",
  task_completed: "Told them it was approved",
  task_cancelled: "Told them it was called off",
  task_due_date_extended: "Told them the deadline moved",
  task_overdue: "Reminded them it’s past the deadline",
};
export const taskNotificationEventLabel = (event) =>
  TASK_NOTIFICATION_EVENTS[normalizeStatusKey(event)] || humanize(event) || "Notice";
