// ─────────────────────────────────────────────────────────────────────────────
// tasks.api.js — Task Assignment module (#249–#270).
//
// Contract source of truth: public/ref docs/md_task-assignment/
// combined_api_analysis.md plus phases/phase2_api_analysis.md,
// phases/phase3_api_analysis.md and phases/phase4_api_analysis.md.
//
// Three planes, mounted separately, which is what lets one screen serve a
// manager and HR alike (CLAUDE.md §2):
//   /tasks/me        — any org member, own rows only (#249–#252)
//   /tasks/manager   — manager/hr/admin, hierarchy-scoped (#255–#263)
//   /tasks/hr        — hr/admin only, whole organisation + audit (#265–#267)
//   /tasks/attachments — the two-mode S3 handshake, open to every member (#268–#270)
//
// Contract traps this file exists to absorb:
//
// • QUERY KEYS ARE ALLOW-LISTED. Every list endpoint validates its query with
//   Joi and answers 400 VALIDATION_ERROR on an unknown key, so a typo would
//   blank a screen instead of being ignored. Never send `org_id`.
//
// • `If-Match` IS THE CONCURRENCY TOKEN, NOT AN ETAG HEADER WE READ BACK. The
//   server accepts either `String(task.version)` or the exact ISO
//   `updated_at`, and answers 412 PRECONDITION_FAILED with
//   `details.current_version` when stale. Callers pass the task they are
//   looking at; `ifMatch()` below turns it into the header. It is optional on
//   every write, but we always send it: two reviewers approving the same
//   submission must not both win.
//
// • CREATION TAKES STAGED JWT TOKENS, NOT ATTACHMENT IDS (Mode A, #255/#265
//   §4.1). A file chosen before the task exists is uploaded to a staging key
//   and its signed token goes in `attachment_tokens`; the task transaction
//   binds and verifies them in S3, rolling the whole creation back if one is
//   missing. Files added to a task that already exists (Mode B) are confirmed
//   through #269 first and referenced by id.
//
// • `Idempotency-Key` on creation is a Redis guard with a 120s TTL that
//   replays the first response. It is per-creation, so a fresh uuid is minted
//   for each dialog submit, not per session.
//
// • COMMENTS TAKE NO `If-Match`, ON PURPOSE (#253/#254/#264, phase 4 §1.2). A
//   comment is an append-only child row; it never touches `tasks.version`. An
//   assignee and two reviewers can be typing at once and all three posts land.
//   Sending a stale version with one would turn a conversation into a 412.
//
// • THERE IS NO COMMENT ROUTE ON THE HR PLANE. The managerial routes are role-
//   gated to manager/hr/admin and let a global approver act anywhere in the
//   tenant, so HR posts and reads through `/tasks/manager/:id/comments` — the
//   same arrangement as #259–#263. Don't invent `/tasks/hr/:id/comments`.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

const seg = (value) => encodeURIComponent(String(value ?? ""));

/** Shared list filters (#249, #256, #257, #266). */
const LIST_FILTERS = ["status", "priority", "category", "is_overdue", "search", "page", "limit"];
const MY_FILTERS = [...LIST_FILTERS, "is_viewed"];
const ASSIGNED_BY_ME_FILTERS = [...LIST_FILTERS, "assignee_id"];
const TEAM_FILTERS = [...LIST_FILTERS, "subordinate_id"];
const ORG_FILTERS = [...LIST_FILTERS, "department_id", "assigner_id", "assignee_id"];

/**
 * The discussion feed's own query (#254). Deliberately NOT built on
 * LIST_FILTERS — the comment schema allow-lists these four keys and answers
 * 400 on anything else, so a stray `status` from a task list would blank the
 * thread.
 */
const COMMENT_FILTERS = ["page", "limit", "order", "is_progress_update"];

function query(params, allowed) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (!allowed.includes(key)) {
      if (import.meta.env?.DEV) console.warn(`[tasksAPI] "${key}" is not a supported filter here and was not sent.`);
      return;
    }
    search.append(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : "";
}

/**
 * The `If-Match` header for a task, from the row the user is looking at.
 * Accepts a task object, a version number or an ISO timestamp.
 */
export function ifMatch(revision) {
  if (revision === undefined || revision === null) return {};
  const value = typeof revision === "object"
    ? (revision.version ?? revision.updated_at)
    : revision;
  if (value === undefined || value === null || value === "") return {};
  return { "If-Match": String(value) };
}

/** A fresh idempotency key for one creation attempt. */
const newIdempotencyKey = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const write = (path, method, payload, headers) => request(path, {
  method,
  ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  ...(headers ? { headers } : {}),
});

export const tasksAPI = {
  // ═══════════════════════════════════════════════════════════════════════════
  //  SELF-SERVICE — /tasks/me (#249–#252)
  //  Every org role may call these, which is why the My Tasks screen mounts in
  //  all three workspaces under each one's own prefix (CLAUDE.md §2).
  // ═══════════════════════════════════════════════════════════════════════════

  /** #249 GET /tasks/me — my work queue. */
  getMyTasks: (params = {}) => request(`/tasks/me${query(params, MY_FILTERS)}`),

  /**
   * #250 GET /tasks/me/:id — full briefing.
   * NOT a plain read: the first call stamps `first_viewed_at` and writes a
   * FIRST_VIEWED audit line, so the assigner can see the task was opened.
   * Never call it to prefetch or to refresh a list row.
   */
  getMyTask: (taskId) => request(`/tasks/me/${seg(taskId)}`),

  /** #251 PATCH /tasks/me/:id/status — only "pending" ⇄ "in_progress". */
  updateMyTaskStatus: (taskId, status, revision) =>
    write(`/tasks/me/${seg(taskId)}/status`, "PATCH", { status }, ifMatch(revision)),

  /** #252 POST /tasks/me/:id/submit — hand deliverables to the reviewer. */
  submitMyTask: (taskId, payload, revision) =>
    write(`/tasks/me/${seg(taskId)}/submit`, "POST", payload, ifMatch(revision)),

  /**
   * #253 POST /tasks/me/:id/comments — the assignee says something on their
   * own task. Assignee only: the assigner reading the same thread posts
   * through the managerial route instead.
   */
  postMyTaskComment: (taskId, payload) =>
    write(`/tasks/me/${seg(taskId)}/comments`, "POST", payload, { "Idempotency-Key": newIdempotencyKey() }),

  /**
   * #254 GET /tasks/me/:id/comments — the thread, oldest first by default.
   * Readable by the assignee, the assigner, the line manager and HR; a
   * stranger gets the same 404 the task itself gives them.
   */
  getMyTaskComments: (taskId, params = {}) =>
    request(`/tasks/me/${seg(taskId)}/comments${query(params, COMMENT_FILTERS)}`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  DELEGATION & REVIEW — /tasks/manager (#255–#263)
  //  Open to manager, hr and admin. A manager is held to their own reporting
  //  line; HR is not, so the same screens serve both.
  // ═══════════════════════════════════════════════════════════════════════════

  /** #255 POST /tasks/manager — delegate to a direct report. */
  createManagerTask: (payload) =>
    write("/tasks/manager", "POST", payload, { "Idempotency-Key": newIdempotencyKey() }),

  /** #256 GET /tasks/manager/assigned-by-me — what I handed out. */
  getTasksAssignedByMe: (params = {}) =>
    request(`/tasks/manager/assigned-by-me${query(params, ASSIGNED_BY_ME_FILTERS)}`),

  /**
   * #257 GET /tasks/manager/team-tasks — everything my reports are carrying,
   * whoever assigned it. An HR caller is not hierarchy-filtered, so this
   * answers organisation-wide for them.
   */
  getTeamTasks: (params = {}) =>
    request(`/tasks/manager/team-tasks${query(params, TEAM_FILTERS)}`),

  /** #258 GET /tasks/manager/:id — read-only; leaves the read receipt alone. */
  getManagerTask: (taskId) => request(`/tasks/manager/${seg(taskId)}`),

  /** #259 POST /tasks/manager/:id/approve — accept the work and close it. */
  approveTask: (taskId, payload, revision) =>
    write(`/tasks/manager/${seg(taskId)}/approve`, "POST", payload, ifMatch(revision)),

  /**
   * #260 POST /tasks/manager/:id/reopen — send it back for changes.
   * Also HR's privileged reopen of an already-completed task, which the server
   * holds to a 15-character justification instead of 10.
   */
  reopenTask: (taskId, payload, revision) =>
    write(`/tasks/manager/${seg(taskId)}/reopen`, "POST", payload, ifMatch(revision)),

  /** #261 POST /tasks/manager/:id/reassign — hand it to someone else. */
  reassignTask: (taskId, payload, revision) =>
    write(`/tasks/manager/${seg(taskId)}/reassign`, "POST", payload, ifMatch(revision)),

  /** #262 POST /tasks/manager/:id/cancel — call it off for good. */
  cancelTask: (taskId, payload, revision) =>
    write(`/tasks/manager/${seg(taskId)}/cancel`, "POST", payload, ifMatch(revision)),

  /** #263 PATCH /tasks/manager/:id/extend-due-date — move the deadline out. */
  extendTaskDueDate: (taskId, payload, revision) =>
    write(`/tasks/manager/${seg(taskId)}/extend-due-date`, "PATCH", payload, ifMatch(revision)),

  /** #264 POST /tasks/manager/:id/comments — a reviewer's guidance on the thread. */
  postManagerTaskComment: (taskId, payload) =>
    write(`/tasks/manager/${seg(taskId)}/comments`, "POST", payload, { "Idempotency-Key": newIdempotencyKey() }),

  /**
   * GET /tasks/manager/:id/comments — the same feed as #254, mounted on the
   * managerial plane so a reviewer never has to call a `/me` URL for somebody
   * else's task. Identical contract and pagination.
   */
  getManagerTaskComments: (taskId, params = {}) =>
    request(`/tasks/manager/${seg(taskId)}/comments${query(params, COMMENT_FILTERS)}`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  GOVERNANCE — /tasks/hr (#265–#267). hr / admin / super-admin only.
  // ═══════════════════════════════════════════════════════════════════════════

  /** #265 POST /tasks/hr — assign to anyone in the organisation. */
  createHrTask: (payload) =>
    write("/tasks/hr", "POST", payload, { "Idempotency-Key": newIdempotencyKey() }),

  /** #266 GET /tasks/hr — the whole organisation, with department filtering. */
  getOrgTasks: (params = {}) => request(`/tasks/hr${query(params, ORG_FILTERS)}`),

  /** #267 GET /tasks/hr/:id — detail plus the full audit and notification log. */
  getHrTask: (taskId) => request(`/tasks/hr/${seg(taskId)}`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  ATTACHMENTS — /tasks/attachments (#268–#270). Any org member.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * #268 POST /tasks/attachments/upload-url — presigned PUT + staging token.
   * Pass `task_id` for a task that already exists (Mode B); omit it while
   * creating one (Mode A) and the token goes into `attachment_tokens`.
   */
  getTaskUploadUrl: (payload) => write("/tasks/attachments/upload-url", "POST", payload),

  /** #269 POST /tasks/attachments/confirm — commit one uploaded file. */
  confirmTaskAttachment: (attachmentToken) =>
    write("/tasks/attachments/confirm", "POST", { attachment_token: attachmentToken }),

  /** #270 GET /tasks/attachments/:id/download-url — short-lived (15 min) link. */
  getTaskAttachmentDownloadUrl: (attachmentId) =>
    request(`/tasks/attachments/${seg(attachmentId)}/download-url`),
};
