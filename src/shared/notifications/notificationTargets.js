// ─────────────────────────────────────────────────────────────────────────────
// notificationTargets.js — turning a notification into a place to go.
//
// The server sends `metadata.screen` (+ usually `metadata.id`) as the routing
// contract. That name is written once, for every recipient of the event, and
// the recipients are in different workspaces: `LeaveRequestDetail` means the
// manager's approval queue to a manager and HR's leave requests to HR, and
// means nothing at all to the employee who raised it. So one screen name maps
// to a FUNCTION OF THE WORKSPACE, never to a URL.
//
// ─── THE RULES THIS FILE EXISTS TO KEEP (§2) ───────────────────────────────
// · NEVER LINK OUTSIDE THE VIEWER'S OWN WORKSPACE. The route gate is exact: an
//   HR admin sent to /dashboard/manager/* is bounced to their dashboard and
//   loses whatever they clicked the notification to read. A workspace with no
//   such page returns null and the UI shows no button — absent, not broken.
// · AN UNKNOWN SCREEN IS NORMAL, NOT A BUG. The catalog grows screens this
//   build has never heard of (33 events today, more later). Unknown resolves to
//   null; the row still opens its inspector, which shows the whole message.
//   Treating it as an error would break the app every time the backend ships.
// · THE `id` IS NOT RENDERED ANYWHERE (§4). It goes into a URL segment or a
//   query string and nowhere else — never a label, never a tooltip.
//
// ─── WHY `event_key` IS A SECOND SOURCE ────────────────────────────────────
// Only a handful of screen names are nailed down in the catalog; most events
// document their recipient and channels but leave the deep link implicit. The
// event key, though, is exhaustively listed and stable. So: match the screen
// name first (it is the stated contract), then fall back to the event key, then
// to the category. Three chances to land somewhere useful, and a null when none
// of them fits — rather than a guess that sends somebody to the wrong page.
//
// Catalog: public/ref docs/md_notifications/notification_event_catalog.md
// ─────────────────────────────────────────────────────────────────────────────

import {
  MY_DOCUMENT_PATHS, MY_PAY_PATHS, TASK_PATHS, selfServicePath,
} from "../attendance/paths";

/**
 * The approval and administration pages a notification can point at, per
 * workspace. These are NOT in paths.js on purpose: that file is the register of
 * pages mounted in every workspace, and every entry below is the opposite — a
 * page one or two roles have and the others do not. `null` is the answer for a
 * role that cannot see the queue, and it is the answer that keeps the link
 * inside the viewer's own workspace.
 */
const QUEUE_PATHS = {
  employee: {
    inbox: null,
    leaveRequests: null,
    regularizations: null,
    overtime: null,
    compOffs: null,
    anomalies: null,
    claims: null,
  },
  manager: {
    inbox: "/dashboard/manager/requests/inbox",
    leaveRequests: "/dashboard/manager/requests/leaves",
    regularizations: "/dashboard/manager/requests/regularizations",
    overtime: "/dashboard/manager/requests/overtime",
    compOffs: "/dashboard/manager/requests/comp-offs",
    anomalies: "/dashboard/manager/team/anomalies",
    claims: "/dashboard/manager/payroll/reimbursements",
  },
  hr: {
    inbox: "/dashboard/hr/inbox",
    leaveRequests: "/dashboard/hr/leaves/requests",
    regularizations: "/dashboard/hr/attendance/regularizations",
    // HR has no overtime queue of its own; overtime is decided by the manager,
    // so HR's honest destination is the inbox that lists what waits on them.
    overtime: "/dashboard/hr/inbox",
    compOffs: "/dashboard/hr/attendance/comp-offs",
    anomalies: "/dashboard/hr/inbox",
    claims: "/dashboard/hr/payroll/reimbursements",
  },
};

/** Self-service destinations, resolved for whichever workspace is asking. */
function selfService(workspace) {
  const pay = MY_PAY_PATHS[workspace] || {};
  const docs = MY_DOCUMENT_PATHS[workspace] || {};
  const tasks = TASK_PATHS[workspace] || {};
  return {
    attendance: selfServicePath(workspace, "history"),
    regularizations: selfServicePath(workspace, "regularizations"),
    anomalies: selfServicePath(workspace, "anomalies"),
    overtime: selfServicePath(workspace, "overtime"),
    compOffs: selfServicePath(workspace, "compOffs"),
    schedule: selfServicePath(workspace, "schedule"),
    locationChecks: selfServicePath(workspace, "locationChecks"),
    leaves: pay.leaves || null,
    salary: pay.salary || null,
    payslips: pay.payslips || null,
    claims: pay.claims || null,
    tax: pay.tax || null,
    documents: docs.documents || null,
    documentRequests: docs.requests || null,
    companyDocuments: docs.company || null,
    myTasks: tasks.mine || null,
    assignedTasks: tasks.assigned || null,
  };
}

// A target is `{ path, label }`. The label is the wording on the button in the
// inspector footer: a sentence saying where it goes (§6), not "View".
const to = (path, label) => (path ? { path, label } : null);

/**
 * `screen` → target. Keys are lowercased so a casing change in the catalog
 * ("LeaveDetails" / "leaveDetails") cannot silently orphan a route.
 */
const SCREEN_TARGETS = {
  // Leave — two screens, and the difference is whose leave it is.
  leavedetails: (ws, mine) => to(mine.leaves, "Open my leave"),
  leaverequestdetail: (ws) => to(QUEUE_PATHS[ws]?.leaveRequests, "Open leave requests"),
  leaverequestdetails: (ws) => to(QUEUE_PATHS[ws]?.leaveRequests, "Open leave requests"),
  myleaves: (ws, mine) => to(mine.leaves, "Open my leave"),

  // Attendance
  attendanceanomalies: (ws) => to(QUEUE_PATHS[ws]?.anomalies, "Open attendance checks"),
  myanomalies: (ws, mine) => to(mine.anomalies, "Open my attendance checks"),
  regularizationdetail: (ws) => to(QUEUE_PATHS[ws]?.regularizations, "Open correction requests"),
  myregularizations: (ws, mine) => to(mine.regularizations, "Open my corrections"),
  overtimedetail: (ws, mine) => to(mine.overtime, "Open my extra hours"),
  compoffdetail: (ws, mine) => to(mine.compOffs, "Open my comp-offs"),
  attendancedetail: (ws, mine) => to(mine.attendance, "Open my attendance"),
  locationrequest: (ws, mine) => to(mine.locationChecks, "Open my location checks"),
  shiftdetail: (ws, mine) => to(mine.schedule, "Open my schedule"),

  // Pay
  payslipdetail: (ws, mine) => to(mine.payslips, "Open my payslips"),
  payslips: (ws, mine) => to(mine.payslips, "Open my payslips"),
  reimbursementdetail: (ws, mine) => to(mine.claims, "Open my claims"),
  bankaccount: (ws, mine) => to(mine.salary, "Open my pay details"),
  taxdeclaration: (ws, mine) => to(mine.tax, "Open my tax and investments"),

  // Tasks — the id matters here, so the page can open the one task.
  taskdetail: (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),
  taskdetails: (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),
  taskreview: (ws) => to(TASK_PATHS[ws]?.assigned, "Open tasks I assigned"),

  // Documents
  documentdetail: (ws, mine) => to(mine.documents, "Open my documents"),
  mydocuments: (ws, mine) => to(mine.documents, "Open my documents"),
  documentrequestdetail: (ws, mine) => to(mine.documentRequests, "Open my document requests"),
  companydocument: (ws, mine, id) => to(mine.companyDocuments && withId(mine.companyDocuments, id), "Open the document"),

  notificationinbox: () => null,
  notifications: () => null,
};

/**
 * `event_key` → target, for the events whose screen name the catalog leaves
 * implicit. Matched on the exact key first, then on the `domain.` prefix, so a
 * new `leave.something` still lands on leave rather than nowhere.
 */
const EVENT_TARGETS = {
  "leave.applied": (ws) => to(QUEUE_PATHS[ws]?.leaveRequests, "Open leave requests"),
  "leave.approved": (ws, mine) => to(mine.leaves, "Open my leave"),
  "leave.rejected": (ws, mine) => to(mine.leaves, "Open my leave"),
  "leave.cancellation_requested": (ws) => to(QUEUE_PATHS[ws]?.leaveRequests, "Open leave requests"),
  "leave.cancelled": (ws, mine) => to(mine.leaves, "Open my leave"),
  "leave.policy_assigned": (ws, mine) => to(mine.leaves, "Open my leave"),

  "attendance.regularization_requested": (ws) => to(QUEUE_PATHS[ws]?.regularizations, "Open correction requests"),
  "attendance.regularization_approved": (ws, mine) => to(mine.regularizations, "Open my corrections"),
  "attendance.regularization_rejected": (ws, mine) => to(mine.regularizations, "Open my corrections"),
  "attendance.anomaly_flagged": (ws) => to(QUEUE_PATHS[ws]?.anomalies, "Open attendance checks"),
  "attendance.location_requested": (ws, mine) => to(mine.locationChecks, "Open my location checks"),
  "attendance.overtime_approved": (ws, mine) => to(mine.overtime, "Open my extra hours"),
  "attendance.overtime_rejected": (ws, mine) => to(mine.overtime, "Open my extra hours"),
  "attendance.comp_off_approved": (ws, mine) => to(mine.compOffs, "Open my comp-offs"),
  "attendance.comp_off_rejected": (ws, mine) => to(mine.compOffs, "Open my comp-offs"),
  "attendance.comp_off_expiring": (ws, mine) => to(mine.compOffs, "Open my comp-offs"),
  "attendance.shift_start_reminder": (ws, mine) => to(mine.attendance, "Open my attendance"),
  "attendance.missing_clock_out_reminder": (ws, mine) => to(mine.attendance, "Open my attendance"),

  "task.assigned": (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),
  "task.submitted_for_review": (ws) => to(TASK_PATHS[ws]?.assigned, "Open tasks I assigned"),
  "task.reopened": (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),
  "task.approved": (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),
  "task.reassigned": (ws, mine, id) => to(mine.myTasks && withId(mine.myTasks, id), "Open the task"),

  "payroll.payslip_published": (ws, mine) => to(mine.payslips, "Open my payslips"),
  "payroll.reimbursement_approved": (ws, mine) => to(mine.claims, "Open my claims"),
  "payroll.reimbursement_rejected": (ws, mine) => to(mine.claims, "Open my claims"),
  "payroll.declaration_window_reminder": (ws, mine) => to(mine.tax, "Open my tax and investments"),

  "employee.bank_account_verified": (ws, mine) => to(mine.salary, "Open my pay details"),

  "shift.assigned": (ws, mine) => to(mine.schedule, "Open my schedule"),
  "shift.assignment_ended": (ws, mine) => to(mine.schedule, "Open my schedule"),

  "document.expiring_soon": (ws, mine) => to(mine.documents, "Open my documents"),
  "document.acknowledgement_pending": (ws, mine) => to(mine.companyDocuments, "Open company documents"),
  "document.request_overdue": (ws, mine) => to(mine.documentRequests, "Open my document requests"),
};

/** Last resort: the domain's own home, for an event key this build has never seen. */
const CATEGORY_TARGETS = {
  leave: (ws, mine) => to(mine.leaves, "Open my leave"),
  attendance: (ws, mine) => to(mine.attendance, "Open my attendance"),
  payroll: (ws, mine) => to(mine.payslips, "Open my payslips"),
  task: (ws, mine) => to(mine.myTasks, "Open my tasks"),
  document: (ws, mine) => to(mine.documents, "Open my documents"),
  shift: (ws, mine) => to(mine.schedule, "Open my schedule"),
};

/** `/base` + an id, only when there is one — never a trailing slash. */
function withId(base, id) {
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

const normaliseScreen = (screen) => String(screen || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Where this notification goes in the viewer's workspace, or null.
 *
 * @param {{ eventKey?: string, category?: string, metadata?: object }} notification
 * @param {"employee"|"manager"|"hr"|"guest"} workspace
 * @returns {{ path: string, label: string } | null}
 */
export function resolveNotificationTarget(notification, workspace) {
  if (!notification || !workspace) return null;
  const mine = selfService(workspace);
  const meta = notification.metadata || {};
  const id = meta.id || meta.entity_id || null;

  const byScreen = SCREEN_TARGETS[normaliseScreen(meta.screen)];
  if (byScreen) {
    const target = byScreen(workspace, mine, id);
    if (target) return target;
  }

  const key = notification.eventKey || meta.event_key || "";
  const byEvent = EVENT_TARGETS[key];
  if (byEvent) {
    const target = byEvent(workspace, mine, id);
    if (target) return target;
  }

  const domain = key.includes(".") ? key.slice(0, key.indexOf(".")) : "";
  const byCategory = CATEGORY_TARGETS[notification.category] || CATEGORY_TARGETS[domain];
  return byCategory ? byCategory(workspace, mine, id) : null;
}

/** Where the Notifications page itself lives, per workspace. */
export const NOTIFICATION_PATHS = {
  employee: "/dashboard/employee/notifications",
  manager: "/dashboard/manager/notifications",
  hr: "/dashboard/hr/notifications",
};
