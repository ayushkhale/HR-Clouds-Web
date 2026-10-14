// ─────────────────────────────────────────────────────────────────────────────
// tasks/taskPlanes.js — One adapter per audience, so the shared task list,
// detail dialog and action dialogs ask "what can this viewer do?" rather than
// branching on role (CLAUDE.md §2).
//
//   me      — the caller's own tasks (#249–#252). Start work, hand in. Mounts
//             in all three workspaces, because every org role is assigned work.
//   manager — delegate inside the reporting line and review it (#255–#263)
//   hr      — the same screens, organisation-wide, plus the audit trail
//             (#265–#267) and the privileged reopen of a finished task
//
// A capability a plane lacks is `null`, and the UI hides that control instead
// of offering a button that 403s. That is the whole point: a manager is NOT
// shown "reopen" on a completed task (#260 refuses it for them), and nobody but
// HR is shown the audit log, because only #267 returns one.
//
// The discussion is the one capability every plane has, because every plane
// can talk: `comments`/`postComment` differ only in which route they go
// through. The `me` plane posts as the assignee (#253) and the two reviewing
// planes post as a reviewer (#264) — same thread, same feed, different author
// rights, which is exactly what the server distinguishes.
//
// `detail` matters more than it looks: on the `me` plane it is #250, which
// STAMPS the read receipt on first open, while the manager and HR reads are
// deliberately passive (#258/#267 leave `first_viewed_at` alone). Opening a
// row from a review list must never make it look as though the assignee had
// seen it — which is exactly what one shared "get task by id" would have done.
// ─────────────────────────────────────────────────────────────────────────────

import { tasksAPI as api } from "../api";

export const TASK_PLANES = {
  me: {
    key: "me",
    /** #250 — stamps `first_viewed_at` on the first open. Never prefetch it. */
    detail: (id) => api.getMyTask(id),
    list: (params) => api.getMyTasks(params),
    create: null,
    setStatus: (id, status, revision) => api.updateMyTaskStatus(id, status, revision),
    submit: (id, payload, revision) => api.submitMyTask(id, payload, revision),
    approve: null,
    reopen: null,
    reassign: null,
    cancel: null,
    extend: null,
    /** #254 / #253 — the assignee's own thread. */
    comments: (id, params) => api.getMyTaskComments(id, params),
    postComment: (id, payload) => api.postMyTaskComment(id, payload),
    showsAudit: false,
    showsNotifications: false,
    // Nobody picks their own work, so there is no roster read on this plane.
    assigneeScope: null,
  },
  manager: {
    key: "manager",
    /** #258 — read-only, by design. */
    detail: (id) => api.getManagerTask(id),
    list: (params) => api.getTasksAssignedByMe(params),
    /** #257 — everything the caller's reports are carrying, whoever assigned it. */
    teamList: (params) => api.getTeamTasks(params),
    create: (payload) => api.createManagerTask(payload),
    setStatus: null,
    submit: null,
    approve: (id, payload, revision) => api.approveTask(id, payload, revision),
    reopen: (id, payload, revision) => api.reopenTask(id, payload, revision),
    reassign: (id, payload, revision) => api.reassignTask(id, payload, revision),
    cancel: (id, payload, revision) => api.cancelTask(id, payload, revision),
    extend: (id, payload, revision) => api.extendTaskDueDate(id, payload, revision),
    /** #264 and its companion feed — a reviewer talking on a report's task. */
    comments: (id, params) => api.getManagerTaskComments(id, params),
    postComment: (id, payload) => api.postManagerTaskComment(id, payload),
    showsAudit: false,
    showsNotifications: false,
    // #255 refuses anyone outside the reporting line, and refuses HR and admins
    // even inside it, so the picker offers direct reports only.
    assigneeScope: "reports",
  },
  hr: {
    key: "hr",
    /** #267 — detail plus the audit and outbox history. */
    detail: (id) => api.getHrTask(id),
    list: (params) => api.getTasksAssignedByMe(params),
    /** #266 — the whole organisation, with department / assigner filtering. */
    teamList: (params) => api.getOrgTasks(params),
    create: (payload) => api.createHrTask(payload),
    setStatus: null,
    submit: null,
    // The review endpoints live on the manager plane for HR too: #259–#263 are
    // mounted once and let a global approver act anywhere in the tenant.
    approve: (id, payload, revision) => api.approveTask(id, payload, revision),
    reopen: (id, payload, revision) => api.reopenTask(id, payload, revision),
    reassign: (id, payload, revision) => api.reassignTask(id, payload, revision),
    cancel: (id, payload, revision) => api.cancelTask(id, payload, revision),
    extend: (id, payload, revision) => api.extendTaskDueDate(id, payload, revision),
    // Same route as the manager plane: there is no comment endpoint under
    // /tasks/hr, and #264 already lets a global approver post anywhere.
    comments: (id, params) => api.getManagerTaskComments(id, params),
    postComment: (id, payload) => api.postManagerTaskComment(id, payload),
    showsAudit: true,
    showsNotifications: true,
    assigneeScope: "organisation",
  },
};

/** The adapter for a viewer, defaulting to the narrowest one. */
export const taskPlaneFor = (viewer) => TASK_PLANES[viewer] || TASK_PLANES.me;

/**
 * Which plane a workspace's review screens run on. `employee` has none: an
 * employee never reviews anyone, so those screens are not mounted there at all
 * rather than mounted and empty.
 */
export const REVIEW_PLANE_FOR_WORKSPACE = { manager: "manager", hr: "hr" };
