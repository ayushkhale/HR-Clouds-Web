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

// ── Route access tiers ───────────────────────────────────────────────────────
// Each dashboard workspace maps to the set of roles allowed to render it.
export const WORKSPACE_ROLES = {
  hr: ["super-admin", "admin", "hr"],
  manager: ["super-admin", "admin", "hr", "manager"],
  employee: ["super-admin", "admin", "hr", "manager", "employee"],
};

/** Is `role` allowed inside the given workspace ("hr" | "manager" | "employee")? */
export function canAccessWorkspace(role, workspace) {
  const allowed = WORKSPACE_ROLES[workspace];
  if (!allowed) return true; // shared pages — any authenticated user
  return allowed.includes(normalizeRole(role));
}

// ── Attendance capability helpers (mirror backend route authorisation) ─────
/** Self-service attendance (punch, history, regularization…) — all org roles. */
export function canSelfServeAttendance(role) {
  return WORKSPACE_ROLES.employee.includes(normalizeRole(role));
}

/** Team attendance reads and approvals (hierarchy-scoped server-side). */
export function canManageTeamAttendance(role) {
  return WORKSPACE_ROLES.manager.includes(normalizeRole(role));
}

/** Attendance configuration: policies, shifts, holidays, locks, reports. */
export function canConfigureAttendance(role) {
  return isHRAdmin(role);
}

/** Role-based home dashboard path (kept in sync with AuthContext.getDashboardPath). */
export function dashboardPathForRole(role) {
  switch (normalizeRole(role)) {
    case "super-admin":
    case "admin":
    case "hr":
      return "/dashboard/hr";
    case "manager":
      return "/dashboard/manager";
    case "employee":
      return "/dashboard/employee";
    case "guest":
      return "/dashboard/guest";
    default:
      return "/dashboard";
  }
}
