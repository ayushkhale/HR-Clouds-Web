// ─────────────────────────────────────────────────────────────────────────────
// permissions.js — Central role & permission helpers for the Organization module
//
// Single source of truth for:
//   • Role priority (privilege-escalation guard, mirrors backend checkInvitationPolicy)
//   • Which roles a given inviter may invite
//   • Route-level access tiers (HR / Manager / Employee workspaces)
//   • Whether a role may act as a Head of Department / reporting manager
//
// The backend remains the authority; these helpers keep the UI from OFFERING
// actions the backend will reject, and gate whole workspaces client-side.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize any role string coming from JWT / API into a lowercase key. */
export function normalizeRole(role) {
  return (role || "").toString().trim().toLowerCase();
}

// Lower number = higher privilege. Mirrors the backend role hierarchy.
export const ROLE_PRIORITY = {
  "super-admin": 0,
  admin: 1,
  hr: 2,
  manager: 3,
  employee: 4,
  guest: 9,
};

// Roles that administer the organization (the "HR / administration" dashboard).
export const HR_TIER_ROLES = ["super-admin", "admin", "hr"];

const ROLE_LABELS = { "super-admin": "Super Admin", admin: "Admin", hr: "HR", manager: "Manager", employee: "Employee", guest: "Guest" };

/** Display name for a role, whatever casing the API sent ("employee", "Employee" → "Employee"). */
export function roleLabel(role) {
  const r = normalizeRole(role);
  return ROLE_LABELS[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : "");
}

/** Is this role part of the HR/admin administration tier? */
export function isHRAdmin(role) {
  return HR_TIER_ROLES.includes(normalizeRole(role));
}

/** Roles that can be invited through the UI (backend enum: hr | manager | employee). */
export const INVITABLE_ROLES = ["hr", "manager", "employee"];

/**
 * Which roles the current inviter is allowed to assign.
 * Backend policy: an inviter cannot grant a role of higher-or-equal priority to
 * one above their own (a manager cannot invite an HR). We allow assigning roles
 * strictly lower in privilege than the inviter, plus the inviter's own tier for
 * HR/admins (so HR can invite HR).
 */
export function getInvitableRoles(inviterRole) {
  const r = normalizeRole(inviterRole);
  const inviterPriority = ROLE_PRIORITY[r] ?? 99;

  if (isHRAdmin(r)) {
    // HR / admin / super-admin may invite hr, manager, employee.
    return [...INVITABLE_ROLES];
  }
  if (r === "manager") {
    // Managers may only invite employees (cannot invite HR or other managers).
    return ["employee"];
  }
  // Everyone else cannot invite.
  return INVITABLE_ROLES.filter(
    (target) => (ROLE_PRIORITY[target] ?? 99) > inviterPriority
  );
}

/** Can `inviterRole` invite someone as `targetRole`? */
export function canInviteRole(inviterRole, targetRole) {
  return getInvitableRoles(inviterRole).includes(normalizeRole(targetRole));
}

/**
 * Only manager / hr / admin / super-admin roles may be a Head of Department or a
 * reporting manager. Backend throws INVALID_HOD_ROLE otherwise.
 */
export function canBeHOD(role) {
  const r = normalizeRole(role);
  return r === "manager" || isHRAdmin(r);
}
export const canBeReportingManager = canBeHOD;

// ── Workspaces: one role, one workspace ──────────────────────────────────────
// Every signed-in role has exactly ONE workspace, and the route gate admits a
// role to that workspace and no other. HR never renders /dashboard/manager/* or
// /dashboard/employee/*, a manager never renders /dashboard/employee/*.
//
// This used to be cumulative (HR listed in the manager and employee workspaces,
// "because HR can do everything an employee can"). That let an HR user land in
// the employee workspace from a stray link (My Profile → organisation name went
// to /dashboard/employee/company) and then walk its tabs, because the
// self-service endpoints behind them accept any tenant role. Things HR does for
// themselves are already mounted inside the HR workspace (SELF_SERVICE_BASE,
// MY_PAY_PATHS, MY_DOCUMENT_PATHS, ORG_PATHS in shared/attendance/paths.js) —
// a missing self-service page is fixed by mounting it there, never by widening
// this gate. CLAUDE.md §2 records the rule.
export const WORKSPACES = ["hr", "manager", "employee", "guest"];

const WORKSPACE_OF_ROLE = {
  "super-admin": "hr",
  admin: "hr",
  hr: "hr",
  manager: "manager",
  employee: "employee",
  guest: "guest",
};

/** The one workspace a role belongs to, or null for a role the app doesn't know. */
export function workspaceForRole(role) {
  return WORKSPACE_OF_ROLE[normalizeRole(role)] || null;
}

/**
 * May `role` render `workspace`? Exact match only. Anything that isn't a
 * workspace (the shared /dashboard/profile-style pages) is open to any
 * signed-in user. An unknown role is refused: the gate fails closed.
 */
export function canAccessWorkspace(role, workspace) {
  if (!WORKSPACES.includes(workspace)) return true;
  const own = workspaceForRole(role);
  return own !== null && own === workspace;
}

// ── API capability tiers (NOT route access) ─────────────────────────────────
// Which roles the backend lets call an endpoint family. These are cumulative on
// purpose — HR may punch in like anyone — and decide whether a control is
// offered inside a page. They must never decide which workspace renders.
const ORG_MEMBER_ROLES = ["super-admin", "admin", "hr", "manager", "employee"];
const TEAM_LEAD_ROLES = ["super-admin", "admin", "hr", "manager"];

// ── Attendance capability helpers (mirror backend route authorisation) ─────
/** Self-service attendance (punch, history, regularization…) — all org roles. */
export function canSelfServeAttendance(role) {
  return ORG_MEMBER_ROLES.includes(normalizeRole(role));
}

/** Team attendance reads and approvals (hierarchy-scoped server-side). */
export function canManageTeamAttendance(role) {
  return TEAM_LEAD_ROLES.includes(normalizeRole(role));
}

/** Attendance configuration: policies, shifts, holidays, locks, reports. */
export function canConfigureAttendance(role) {
  return isHRAdmin(role);
}

/**
 * Role-based home dashboard path. The only copy: AuthContext.getDashboardPath
 * delegates here (a second switch in AuthContext once forgot admin/super-admin
 * and left them on the /dashboard spinner). "/dashboard" means "no workspace".
 */
export function dashboardPathForRole(role) {
  const workspace = workspaceForRole(role);
  return workspace ? `/dashboard/${workspace}` : "/dashboard";
}
