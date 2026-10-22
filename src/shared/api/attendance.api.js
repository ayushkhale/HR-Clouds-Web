// ─────────────────────────────────────────────────────────────────────────────
// attendance.api.js — All attendance endpoints
//
// Organized by role hierarchy: HR → Manager → Employee
// Within each role, APIs are grouped by sub-module (e.g. Policies, Shifts, etc.)
//
// Contract source of truth: public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md
// (supersedes 3..6_*.md). Every query string goes through `qs()` so empty
// filters are never sent as literal values (e.g. `status=` or `date=undefined`).
// Only endpoints and parameters that exist in the backend validators are
// exposed — unknown keys are silently stripped server-side (§1.8).
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";
import { organizationAPI } from "./organization.api.js";

/**
 * Build a query string from a params object, dropping undefined / null / ""
 * values. Returns "" or "?a=1&b=2".
 * @param {Record<string, unknown>} [params]
 */
export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "number" && Number.isNaN(value)) return;
    search.append(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : "";
}

// Path params are URI-encoded: a malformed id (e.g. from a hand-edited
// /employees/:userId URL) must not change which endpoint is called.
const seg = (value) => encodeURIComponent(String(value ?? ""));

const post = (path, payload) =>
  request(path, payload === undefined
    ? { method: "POST" }
    : { method: "POST", body: JSON.stringify(payload) });

const put = (path, payload) => request(path, { method: "PUT", body: JSON.stringify(payload) });
const del = (path) => request(path, { method: "DELETE" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHIFT_FILTERS = ["type", "is_active", "policy_id"];
const ASSIGNMENT_FILTERS = ["user_id", "shift_id", "rotation_pattern_id"];

const invalidFilter = (key) => {
  const message = `"${key}" filter is not valid.`;
  return Object.assign(new Error(message), { status: 400, data: { success: false, message, errorCode: "INVALID_FILTER", code: "INVALID_FILTER" } });
};

/**
 * GET /shifts and GET /shifts/assignments allow-list their filters
 * (update_shift_templates_2026_09_14.md §4). Any other key is ignored and the
 * FULL list comes back, so it is dropped here instead of silently widening the
 * result; a malformed `is_active` or UUID is a 400 INVALID_FILTER, so it is
 * rejected before the request with the same error shape. Never send `org_id`.
 * @returns {Promise<unknown>}
 */
function withShiftFilters(params, allowed, send) {
  const out = {};
  for (const [key, raw] of Object.entries(params || {})) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (!allowed.includes(key)) {
      if (import.meta.env?.DEV) console.warn(`[attendanceAPI] "${key}" is not a supported filter here and was not sent.`);
      continue;
    }
    const value = String(raw).trim();
    if (key === "is_active") {
      const flag = value.toLowerCase();
      if (!["true", "false", "1", "0"].includes(flag)) return Promise.reject(invalidFilter(key));
      out[key] = flag === "1" || flag === "true" ? "true" : "false";
    } else if (key === "type") {
      out[key] = value;
    } else if (UUID_RE.test(value)) {
      out[key] = value;
    } else {
      return Promise.reject(invalidFilter(key));
    }
  }
  return send(qs(out));
}

// Decision bodies: `remarks` is only sent when the user actually typed one.
const decisionBody = (payload) => {
  const remarks = typeof payload?.remarks === "string" ? payload.remarks.trim() : "";
  return remarks ? { remarks } : undefined;
};

export const attendanceAPI = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  HR
  //  All admin-level APIs for configuring and monitoring attendance
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR › Dashboard (H59–H63) ───────────────────────────────────────────────
  // §6.4: on the five dashboard endpoints `month`/`year` are regex-matched
  // strings; qs() stringifies numbers, so 9 → "9" satisfies ^(0?[1-9]|1[012])$.
  /** @param {string} [date] YYYY-MM-DD — pass it explicitly (server "today" is IST, §8.6). */
  getLiveDashboard: (date) => request(`/attendance/hr/dashboard/live${qs({ date })}`),
  getDashboardGraphData: (month, year) => request(`/attendance/hr/dashboard/graph-data${qs({ month, year })}`),
  /** @param {string} [date] YYYY-MM-DD (local) */
  getDepartmentSummary: (date) => request(`/attendance/hr/dashboard/department-summary${qs({ date })}`),
  /** Always grouped: `{ most_absent: [...], most_late: [...] }`. `limit` 1–50. */
  getTopDefaulters: (month, year, limit) => request(`/attendance/hr/dashboard/top-defaulters${qs({ month, year, limit })}`),
  /** @param {string} [date] YYYY-MM-DD (local) */
  getWorkModeDistribution: (date) => request(`/attendance/hr/dashboard/work-mode-distribution${qs({ date })}`),

  // ── HR › Policies (H1–H5) ──────────────────────────────────────────────────
  getPolicies: () => request("/attendance/hr/policies"),
  getPolicy: (id) => request(`/attendance/hr/policies/${seg(id)}`),
  createPolicy: (payload) => post("/attendance/hr/policies", payload),
  updatePolicy: (id, payload) => put(`/attendance/hr/policies/${seg(id)}`, payload),
  deactivatePolicy: (id) => request(`/attendance/hr/policies/${seg(id)}/deactivate`, { method: "PATCH" }),

  // ── HR › Shifts (H10–H14) ──────────────────────────────────────────────────
  /** Not paginated. Filters: `type`, `is_active`, `policy_id` only. */
  getShifts: (params = {}) => withShiftFilters(params, SHIFT_FILTERS, (query) => request(`/attendance/hr/shifts${query}`)),
  getShift: (id) => request(`/attendance/hr/shifts/${seg(id)}`),
  createShift: (payload) => post("/attendance/hr/shifts", payload),
  /** Partial update. The backend skips the per-type time check here and refuses inactive shifts (SHIFT_DEACTIVATED). */
  updateShift: (id, payload) => put(`/attendance/hr/shifts/${seg(id)}`, payload),
  /** Deactivates (is_active → false); the shift stays in the list. There is no reactivation. */
  deleteShift: (id) => del(`/attendance/hr/shifts/${seg(id)}`),

  // ── HR › Shift Management / Assignments (H6–H9) ────────────────────────────
  /** Not paginated. Filters: `user_id`, `shift_id`, `rotation_pattern_id` (UUIDs) only. */
  getAssignments: (params = {}) => withShiftFilters(params, ASSIGNMENT_FILTERS, (query) => request(`/attendance/hr/shifts/assignments${query}`)),
  /** body: { user_id, (shift_id XOR rotation_pattern_id), effective_from, effective_to? } — no update route exists (§2 C2). */
  assignShift: (payload) => post("/attendance/hr/shifts/assign", payload),
  /** body: { effective_to: "YYYY-MM-DD" } */
  endShiftAssignment: (id, payload) => post(`/attendance/hr/shifts/assignments/${seg(id)}/end`, payload),
  deleteShiftAssignment: (id) => del(`/attendance/hr/shifts/assignments/${seg(id)}`),

  // ── HR › Rotations (H15–H17) ───────────────────────────────────────────────
  getRotations: () => request("/attendance/hr/rotations"),
  createRotation: (payload) => post("/attendance/hr/rotations", payload),
  deleteRotation: (id) => del(`/attendance/hr/rotations/${seg(id)}`),

  // ── HR › Holidays (H18–H21) ────────────────────────────────────────────────
  getHolidays: (year = new Date().getFullYear()) => request(`/attendance/hr/holidays${qs({ year })}`),
  createHoliday: (payload) => post("/attendance/hr/holidays", payload),
  updateHoliday: (id, payload) => put(`/attendance/hr/holidays/${seg(id)}`, payload),
  deleteHoliday: (id) => del(`/attendance/hr/holidays/${seg(id)}`),

  // ── HR › Weekly Offs (H22–H25) ─────────────────────────────────────────────
  getWeeklyOffs: () => request("/attendance/hr/weekly-offs"),
  createWeeklyOff: (payload) => post("/attendance/hr/weekly-offs", payload),
  updateWeeklyOff: (id, payload) => put(`/attendance/hr/weekly-offs/${seg(id)}`, payload),
  deleteWeeklyOff: (id) => del(`/attendance/hr/weekly-offs/${seg(id)}`),

  // ── HR › Regularizations ───────────────────────────────────────────────────
  // There is no /hr/regularizations route (§2 C1). HR reads and decides through
  // /manager/regularizations/* — for HR the hierarchy filter is null, so the
  // pending queue is org-wide and HIERARCHY_VIOLATION is unreachable.

  // ── HR › Comp-Off Management (H37–H39) ─────────────────────────────────────
  /** @param {{status?: "earned"|"approved"|"used"|"expired"|"cancelled", page?: number, limit?: number}} params */
  getCompOffs: (params = {}) => request(`/attendance/hr/comp-offs${qs(params)}`),
  // Body `{ remarks? ≤1000 }` (§2 C10). Reject writes status `cancelled` (§2 C11).
  approveCompOff: (id, payload) => post(`/attendance/hr/comp-offs/${seg(id)}/approve`, decisionBody(payload)),
  rejectCompOff: (id, payload) => post(`/attendance/hr/comp-offs/${seg(id)}/reject`, decisionBody(payload)),

  // ── HR › Comp-Off Policies (H33–H36) ───────────────────────────────────────
  getCompOffPolicies: () => request("/attendance/hr/comp-off-policies"),
  createCompOffPolicy: (payload) => post("/attendance/hr/comp-off-policies", payload),
  updateCompOffPolicy: (id, payload) => put(`/attendance/hr/comp-off-policies/${seg(id)}`, payload),
  deleteCompOffPolicy: (id) => del(`/attendance/hr/comp-off-policies/${seg(id)}`),

  // ── HR › Lock Periods (H40–H42) ────────────────────────────────────────────
  getLockPeriods: () => request("/attendance/hr/locks"),
  /** body: { start_date, end_date, reason? } — violations raise PERIOD_LOCKED (403). */
  createLockPeriod: (payload) => post("/attendance/hr/locks", payload),
  deleteLockPeriod: (id) => del(`/attendance/hr/locks/${seg(id)}`),

  // ── HR › Employee Attendance Records (H47–H58) ─────────────────────────────
  getAllEmployeesAttendance: (params = {}) => request(`/attendance/hr/employees/attendance${qs(params)}`),
  getIndividualEmployeeAttendanceDetail: (userId, params = {}) => request(`/attendance/hr/employees/${seg(userId)}/attendance${qs(params)}`),
  getIndividualEmployeeMonthlySummary: (userId, month, year) => request(`/attendance/hr/employees/${seg(userId)}/summary${qs({ month, year })}`),
  getEmployeeDailyLog: (userId, date) => request(`/attendance/hr/employees/${seg(userId)}/daily-log${qs({ date })}`),

  getAllManagersAttendance: (params = {}) => request(`/attendance/hr/managers/attendance${qs(params)}`),
  getIndividualManagerAttendanceDetail: (userId, params = {}) => request(`/attendance/hr/managers/${seg(userId)}/attendance${qs(params)}`),
  getIndividualManagerMonthlySummary: (userId, month, year) => request(`/attendance/hr/managers/${seg(userId)}/summary${qs({ month, year })}`),
  getManagerDailyLog: (userId, date) => request(`/attendance/hr/managers/${seg(userId)}/daily-log${qs({ date })}`),

  getAllHRsAttendance: (params = {}) => request(`/attendance/hr/hrs/attendance${qs(params)}`),
  getIndividualHRAttendanceDetail: (userId, params = {}) => request(`/attendance/hr/hrs/${seg(userId)}/attendance${qs(params)}`),
  getIndividualHRMonthlySummary: (userId, month, year) => request(`/attendance/hr/hrs/${seg(userId)}/summary${qs({ month, year })}`),
  getHRDailyLog: (userId, date) => request(`/attendance/hr/hrs/${seg(userId)}/daily-log${qs({ date })}`),

  // ── HR › Reports & Analytics (H44–H46) ─────────────────────────────────────
  getDailyReport: (params = {}) => request(`/attendance/hr/reports/daily${qs(params)}`),
  getMonthlyReport: (params = {}) => request(`/attendance/hr/reports/monthly${qs(params)}`),
  getEmployeeReport: (userId, params = {}) => request(`/attendance/hr/reports/employee/${seg(userId)}${qs(params)}`),

  // ── HR › Devices (Biometric) (H26–H32) ─────────────────────────────────────
  getDevices: () => request("/attendance/hr/devices"),
  createDevice: (payload) => post("/attendance/hr/devices", payload),
  updateDevice: (id, payload) => put(`/attendance/hr/devices/${seg(id)}`, payload),
  deleteDevice: (id) => del(`/attendance/hr/devices/${seg(id)}`),
  getDeviceMappings: (id) => request(`/attendance/hr/devices/${seg(id)}/mappings`),
  createDeviceMapping: (id, payload) => post(`/attendance/hr/devices/${seg(id)}/mappings`, payload),
  deleteDeviceMapping: (id, mappingId) => del(`/attendance/hr/devices/${seg(id)}/mappings/${seg(mappingId)}`),

  // ── HR › Device trust (D8–D17) ─────────────────────────────────────────────
  //    Nothing to do with the biometric terminals above. These are the
  //    employees' OWN phones and laptops, proving at punch time that a punch
  //    came from a device the organisation knows about.
  //    Contract: md_attendance/8_device_trust_api_analysis.md §6.
  /**
   * The org-wide device inventory — one row per DEVICE.
   *
   * Rows carry `user_id` (= `users.id`) and `last_user_agent` as of the backend
   * delivery of 22 Oct 2026 (md_updates/2026-10-22_device_trust_frontend_delivery.md
   * §2); the original contract in §6 of the analysis doc omitted both. Names,
   * emails, departments and photos are deliberately NOT denormalised onto these
   * rows — resolve them from `useEmployeeDirectory()` via `user_id` (§7).
   *
   * For "who has a device and who hasn't", use `getDeviceTrustPeople` instead:
   * a list of devices can never show somebody who has none.
   * @param {{user_id?: string, status?: "pending"|"active"|"suspended"|"revoked", platform?: string, device_bound?: boolean, page?: number, limit?: number}} params
   */
  getTrustedDevices: (params = {}) => request(`/attendance/hr/trusted-devices${qs(params)}`),
  /** `pending` → `active`. No body. A second decision is 409 DEVICE_INVALID_STATE_TRANSITION. */
  approveTrustedDevice: (id) => post(`/attendance/hr/trusted-devices/${seg(id)}/approve`),
  /** `pending` → `revoked`. body: { reason } — required, 3–500 chars. */
  rejectTrustedDevice: (id, payload) => post(`/attendance/hr/trusted-devices/${seg(id)}/reject`, payload),
  /** `active`|`pending`|`suspended` → `revoked`. Terminal. body: { reason } required. */
  revokeTrustedDeviceAsHR: (id, payload) => post(`/attendance/hr/trusted-devices/${seg(id)}/revoke`, payload),
  /** `active` → `suspended`, reversible. body: { reason } required. */
  suspendTrustedDevice: (id, payload) => post(`/attendance/hr/trusted-devices/${seg(id)}/suspend`, payload),
  /** `suspended` → `active` ONLY — a revoked device never comes back. No body. */
  reinstateTrustedDevice: (id) => post(`/attendance/hr/trusted-devices/${seg(id)}/reinstate`),

  /** The org's one policy row. `data.updated_at` is the If-Match token for the PUT. */
  getDeviceTrustPolicy: () => request("/attendance/hr/device-trust/policy"),
  /**
   * `If-Match` is MANDATORY: without it 428 IF_MATCH_REQUIRED, stale 412
   * PRECONDITION_FAILED, `*` 400 IF_MATCH_INVALID. The server accepts the bare
   * `updated_at` ISO string as well as a quoted ETag, which is why the token is
   * read from the GET body — `request()` cannot see response headers.
   * A 412 is never retried blindly: re-read, reconcile, resubmit.
   * @param {Record<string, unknown>} payload at least one policy field
   * @param {string} updatedAt `updated_at` from the last successful read
   */
  updateDeviceTrustPolicy: (payload, updatedAt) => request("/attendance/hr/device-trust/policy", {
    method: "PUT",
    headers: { "If-Match": String(updatedAt ?? "") },
    body: JSON.stringify(payload),
  }),
  /** Verification failures + lifecycle audit. @param {{action?: string, user_id?: string, page?: number, limit?: number}} params */
  getDeviceTrustEvents: (params = {}) => request(`/attendance/hr/device-trust/events${qs(params)}`),
  /**
   * Org-wide readiness, read before switching the mode to Required.
   * `{ enrolled_users, active_members, coverage_percentage, uncovered_users,
   *    pending_users, pending_devices, suspended_users, by_group[] }`
   * — everything after `coverage_percentage` arrived 22 Oct 2026, so treat each
   * as absent-until-proven (§7) rather than assuming a number is there.
   *
   * `active_members` counts `user_roles.is_active = true`, the same population
   * `getDeviceTrustPeople` left-joins against, so the two always agree.
   */
  getDeviceTrustCoverage: () => request("/attendance/hr/device-trust/coverage"),
  /**
   * WHO has a device and who hasn't — one row per PERSON, pre-aggregated
   * server-side, including everybody with zero devices. This is the read the
   * Registered Devices people list is built on; the device inventory can only
   * ever list devices, so a person with none is invisible to it.
   *
   * Rows are `{ user_id, device_count, active_count, pending_count,
   * suspended_count, revoked_count, covered, last_used_at }` and carry NO
   * display data by design — join names and photos from the directory (§7).
   *
   * `coverage` is a true partition (`covered` | `pending` | `blocked` | `none`),
   * mirrored client-side by `coverageStateOf()` so a server-filtered page and a
   * client-filtered one can never disagree.
   * @param {{coverage?: "none"|"pending"|"covered"|"blocked", role?: "employee"|"manager"|"hr", search?: string, page?: number, limit?: number}} params
   */
  getDeviceTrustPeople: (params = {}) => request(`/attendance/hr/device-trust/people${qs(params)}`),

  // ── HR › Locations (Geofencing) ────────────────────────────────────────────
  //    Delegates to organizationAPI for location management
  getLocations: (params) => organizationAPI.getLocations(params),
  createLocation: (payload) => organizationAPI.createLocation(payload),
  updateLocation: (id, payload) => organizationAPI.updateLocation(id, payload),

  // ── HR › Maintenance (H43) ─────────────────────────────────────────────────
  /** @param {{date?: string}} [params] optional YYYY-MM-DD; omitted = full sweep */
  recomputeStaleRecords: ({ date } = {}) => post("/attendance/hr/records/recompute-stale", date ? { date } : undefined),


  // ═══════════════════════════════════════════════════════════════════════════
  //  MANAGER (hierarchy-scoped server-side)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Manager › Team Overview (M1, M2, M14, M17) ─────────────────────────────
  /** No query accepted; server computes "today" in UTC (§8.2). */
  getManagerTeamToday: () => request("/attendance/manager/team/today"),
  // GET /manager/team/history is intentionally NOT exposed: it ignores every
  // query parameter and returns all records ever for the team, unbounded
  // (§2 C15, §8.1). Team history is read per member via getTeamMemberHistory.
  /** @param {string} [date] YYYY-MM-DD (local) */
  getTeamSummary: (date) => request(`/attendance/manager/team/summary${qs({ date })}`),
  getTeamGraphData: (month, year) => request(`/attendance/manager/team/graph-data${qs({ month, year })}`),

  // ── Manager › Team Member Drill-Down (M15, M16) ────────────────────────────
  /** Filtered + paginated (`total_pages`). @param {{from?: string, to?: string, page?: number, limit?: number}} params */
  getTeamMemberHistory: (userId, params = {}) => request(`/attendance/manager/team/member/${seg(userId)}/history${qs(params)}`),
  getTeamMemberSummary: (userId, month, year) => request(`/attendance/manager/team/member/${seg(userId)}/summary${qs({ month, year })}`),
  /**
   * One report's day, enriched (sessions, breaks, shift) — the manager-plane twin
   * of the HR daily-log reads, same shape. `date` defaults to today in IST.
   * 403 EMPLOYEE_NOT_IN_TEAM outside the manager's team.
   */
  getTeamMemberDailyLog: (userId, date) => request(`/attendance/manager/team/member/${seg(userId)}/daily-log${qs({ date })}`),

  // ── Manager › Anomalies (M3, M4) ───────────────────────────────────────────
  getManagerAnomalies: () => request("/attendance/manager/team/anomalies"),
  resolveManagerAnomaly: (id, payload) => post(`/attendance/manager/anomalies/${seg(id)}/resolve`, decisionBody(payload)),

  // ── Manager › Regularization Approvals (M5–M7) ─────────────────────────────
  getManagerPendingRegularizations: () => request("/attendance/manager/regularizations/pending"),
  approveManagerRegularization: (id, payload) => post(`/attendance/manager/regularizations/${seg(id)}/approve`, decisionBody(payload)),
  rejectManagerRegularization: (id, payload) => post(`/attendance/manager/regularizations/${seg(id)}/reject`, decisionBody(payload)),

  // ── Manager › Overtime Approvals (M8–M10) ──────────────────────────────────
  getManagerPendingOvertime: () => request("/attendance/manager/overtime/pending"),
  approveManagerOvertime: (id, payload) => post(`/attendance/manager/overtime/${seg(id)}/approve`, decisionBody(payload)),
  rejectManagerOvertime: (id, payload) => post(`/attendance/manager/overtime/${seg(id)}/reject`, decisionBody(payload)),

  // ── Manager › Comp-Off Approvals (M11–M13) ─────────────────────────────────
  /** Returns comp-offs with status `earned`. */
  getManagerCompOffs: () => request("/attendance/manager/comp-offs/pending"),
  // Body `{ remarks? ≤1000 }` (§6.3); reject writes status `cancelled`.
  approveManagerCompOff: (id, payload) => post(`/attendance/manager/comp-offs/${seg(id)}/approve`, decisionBody(payload)),
  rejectManagerCompOff: (id, payload) => post(`/attendance/manager/comp-offs/${seg(id)}/reject`, decisionBody(payload)),


  // ═══════════════════════════════════════════════════════════════════════════
  //  SELF-SERVICE (all org roles)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Clock In / Out (U1, U2) ────────────────────────────────────────────────
  /** body: { source, latitude?, longitude?, client_timestamp?, notes?, work_mode?, metadata? } */
  clockIn: (payload) => post("/attendance/clock-in", payload),
  /** body: { source, latitude?, longitude?, client_timestamp?, notes?, metadata? } — NO work_mode (§2 C18). */
  clockOut: (payload) => post("/attendance/clock-out", payload),

  // ── Breaks (U3, U4) — body { source, notes? } ──────────────────────────────
  breakStart: (payload = { source: "web" }) => post("/attendance/break/start", payload),
  breakEnd: (payload = { source: "web" }) => post("/attendance/break/end", payload),

  // ── Today & History (U5, U11, U12) ─────────────────────────────────────────
  getToday: () => request("/attendance/today"),
  /** @param {{from?: string, to?: string, page?: number, limit?: number}} params */
  getHistory: (params = {}) => request(`/attendance/history${qs(params)}`),
  getSummary: (month, year) => request(`/attendance/summary${qs({ month, year })}`),

  // ── Daily Log & Insights (U16–U19) ─────────────────────────────────────────
  getDailyLog: (date) => request(`/attendance/daily-log${qs({ date })}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${qs({ month, year })}`),
  /** @param {string} [date] YYYY-MM-DD — week containing this date */
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${qs({ date })}`),
  /** @param {number} [months] 1–12 (backend default 3) */
  getTrends: (months) => request(`/attendance/trends${qs({ months })}`),

  // ── Field locations & assignments (2026-10-05) ─────────────────────────────
  // Mounted at IDENTICAL paths on the HR and manager routers — same payloads,
  // same responses, only the authorization scope differs. So these take a
  // `plane` ("hr" | "manager") rather than existing twice; see FIELD_PLANES in
  // `shared/attendance/fieldPlanes.js` for which role may do what.
  //
  // A created site is visible org-wide ON PURPOSE, so managers reuse "Tata
  // Steel Pune" instead of each adding their own copy.
  /** @param {{search?: string, include_inactive?: boolean, page?: number, limit?: number}} params */
  getFieldLocations: (plane, params = {}) => request(`/attendance/${seg(plane)}/field-locations${qs(params)}`),
  /** Returns { location, assigned_user_count, can_modify, assignments[] }. */
  getFieldLocation: (plane, id) => request(`/attendance/${seg(plane)}/field-locations/${seg(id)}`),
  /** body: { name, latitude, longitude, client_name?, geofence_radius_meters?, address?, city?, state?, country?, pincode?, timezone? } */
  createFieldLocation: (plane, payload) => post(`/attendance/${seg(plane)}/field-locations`, payload),
  /** `is_active` is NOT accepted here — retiring must cascade, which only DELETE does. */
  updateFieldLocation: (plane, id, payload) => put(`/attendance/${seg(plane)}/field-locations/${seg(id)}`, payload),
  /** Soft-retires the site AND deactivates its assignments in one transaction. */
  deleteFieldLocation: (plane, id) => del(`/attendance/${seg(plane)}/field-locations/${seg(id)}`),

  /**
   * body: { user_id, field_location_id, effective_from?, effective_to?,
   *         set_work_mode_to_field? }
   *
   * Dates MUST be plain `YYYY-MM-DD` strings — an ISO timestamp is a 400,
   * because at IST a midnight-UTC instant lands on the previous calendar day
   * and would silently shift the window. Use `ymdOnly()`, never `toISOString()`.
   *
   * `set_work_mode_to_field` (2026-10-07) flips the assignee to `field` in the
   * SAME transaction as the assignment — but only from on-site/office/unset.
   * A `remote` or `hybrid` contract is refused and left alone: those are tied
   * to allowances and payroll, so only HR may move them. The refusal does NOT
   * fail the call — you get 201 with `work_mode_changed: false` and a
   * `work_mode_warning` to show.
   *
   * Response: { assignment, work_mode_changed: boolean, work_mode_warning: string|null }
   */
  assignFieldLocation: (plane, payload) => post(`/attendance/${seg(plane)}/field-assignments`, payload),
  /**
   * Move an existing assignment's window (2026-10-18). Body: `{ effective_from?,
   * effective_to? }`, at least one, plain `YYYY-MM-DD` — `effective_to: null`
   * makes it open-ended. The original `assigned_by` is NEVER overwritten, which
   * is the whole reason this beats remove-then-add. A PUT on an already
   * unassigned row is `400 FIELD_ASSIGNMENT_INACTIVE`. Manager scope is direct
   * reports only (`403 HIERARCHY_VIOLATION` otherwise).
   */
  updateFieldAssignment: (plane, assignmentId, payload) => put(`/attendance/${seg(plane)}/field-assignments/${seg(assignmentId)}`, payload),
  /** Idempotent — a repeat returns `already_inactive: true`, not an error. */
  unassignFieldLocation: (plane, assignmentId) => del(`/attendance/${seg(plane)}/field-assignments/${seg(assignmentId)}`),
  /**
   * The flat "who is assigned where" read (2026-10-18). Params:
   * `{ field_location_id?, user_id?, is_active?, include_inactive?, page?, limit? }`.
   * HR is org-wide; a manager is bounded to direct reports (an out-of-scope
   * `user_id` is `403 HIERARCHY_VIOLATION`). Each row nests `field_location`,
   * `user` and `assigner`. Returns `{ total, page, limit, totalPages, records[] }`.
   */
  getFieldAssignments: (plane, params = {}) => request(`/attendance/${seg(plane)}/field-assignments${qs(params)}`),
  /** Returns { user_id, work_mode, assigned_office, total, records[] }. */
  getUserFieldAssignments: (plane, userId) => request(`/attendance/${seg(plane)}/field-assignments/user/${seg(userId)}`),
  /** The caller's own sites, for the punch screen. Same shape as the above. */
  getMyFieldAssignments: () => request("/attendance/my-field-assignments"),

  // ── Shift & Holidays (U13, U20) ────────────────────────────────────────────
  getMyShift: () => request("/attendance/shift"),
  /**
   * `year` (2000–2100) OR `from`+`to` together — a lone bound is a 400, and so
   * is an unvalidated `year` now (both fixed 2026-10-22; the old note here said
   * `year` was ignored, which was wrong — it was always honoured, just never
   * validated, so `?year=abc` used to 500). Prefer `from`/`to` for a window
   * that crosses a calendar-year boundary, which `year` cannot express.
   */
  getUpcomingHolidays: ({ year, from, to } = {}) =>
    request(`/attendance/holidays${qs({ year, from, to })}`),

  // ── Forward schedule: the agenda (2026-10-22) ──────────────────────────────
  //    One request builds the whole forward view. The server resolves `day_kind`
  //    with the SAME code unit the roster, the HR planes and the auto-absent
  //    cron use, so this page cannot contradict the payslip — never re-derive a
  //    day's kind here from shift/holiday/leave presence.
  /**
   * `{ range, summary, lanes, days[] }` — dense, one entry per calendar date.
   * No `user_id`: the subject is the token.
   * @param {{from?: string, to?: string, include?: string[]}} [params]
   *   `include` names the OPTIONAL lanes only (`tasks`, `documents`,
   *   `comp_offs`, `shift_changes`); an unknown name is a 400, not ignored.
   *   Omit it for all lanes. `shift`/`holidays`/`leave` can never be excluded.
   */
  getMyAgenda: ({ from, to, include } = {}) =>
    request(`/attendance/schedule/agenda${qs({
      from,
      to,
      include: Array.isArray(include) ? include.join(",") : include,
    })}`),
  /**
   * Per-day coverage over the caller's DIRECT REPORTS — for every role,
   * including HR, which is deliberately NOT org-wide here. Counts are computed
   * server-side over the whole team; never derive them from `away[]`.
   * A manager with no reports gets `team_size: 0` and a dense `days` array.
   */
  getTeamAgenda: ({ from, to, subordinateId } = {}) =>
    request(`/attendance/manager/schedule/team-agenda${qs({ from, to, subordinate_id: subordinateId })}`),

  // ── Regularizations (U6–U8) ────────────────────────────────────────────────
  submitRegularization: (payload) => post("/attendance/regularization", payload),
  /** `status` is validated but ignored by the controller (§4.4, §8.4) — filter client-side. */
  getMyRegularizations: (params = {}) => request(`/attendance/regularizations${qs(params)}`),
  cancelRegularization: (id) => post(`/attendance/regularizations/${seg(id)}/cancel`),

  // ── Overtime (U9) ──────────────────────────────────────────────────────────
  /** `page`/`limit` only — no status filter exists (§4.5). */
  getMyOvertime: ({ page, limit } = {}) => request(`/attendance/overtime/mine${qs({ page, limit })}`),

  // ── Anomalies (U10) ────────────────────────────────────────────────────────
  /** Records carry `is_resolved` (boolean), not `status` (§2 C16). @param {{status?: "open"|"resolved"|"all", page?: number, limit?: number}} params */
  getMyAnomalies: (params = {}) => request(`/attendance/anomalies/mine${qs(params)}`),

  // ── Comp-Offs (U14, U15) ───────────────────────────────────────────────────
  /** @param {{status?: "earned"|"approved"|"used"|"expired"|"cancelled", page?: number, limit?: number}} params */
  getMyCompOffs: (params = {}) => request(`/attendance/comp-offs/mine${qs(params)}`),
  getMyCompOffSummary: () => request("/attendance/comp-offs/mine/summary"),

  // ── Device trust & my trusted devices (D1–D7) ──────────────────────────────
  //    The three-step punch is orchestrated in `shared/attendance/deviceTrust.js`,
  //    not here: a challenge is single-use and short-lived, so nothing in this
  //    file caches, stores or retries one.
  /** The one state read every attendance screen branches on. Read `effective_mode`, never `mode`. */
  getDeviceTrustContext: () => request("/attendance/device-trust/context"),
  /**
   * Step 1 of a punch. Mints ONE single-use challenge bound to ONE operation.
   * body: { operation: "clock_in"|"clock_out"|"break_start"|"break_end",
   *         credential_type: "webauthn" } — `credential_type` is required.
   * Always 200: `{ required: false }`, `{ required: true, registration_required: true }`,
   * or `{ required: true, challenge_id, expires_at, credential_type, public_key }`.
   * Rate limited 60/hour per user.
   */
  requestDeviceChallenge: (payload) => post("/attendance/device-trust/challenge", payload),
  /**
   * Opens enrollment: sends the OTP step-up AND returns the WebAuthn creation
   * options in one call. Run the ceremony first, collect the OTP second — the
   * challenge (~180s) dies long before the OTP does.
   * body: { credential_type, device_name (1–100), replace_device_id? }
   * `replace_device_id` only when already at `max_active_devices`.
   * The key is OMITTED rather than null when there is no replacement: the
   * live validator rejects an explicit null with `"replace_device_id" must
   * be a string` (15 Oct 2026). Built in `deviceTrust.js`, which holds the note.
   * Rate limited 5/hour per user.
   */
  startDeviceRegistration: (payload) => post("/attendance/trusted-devices/registration/start", payload),
  /**
   * Verifies the OTP and the attestation in one transaction — both land or neither.
   * body: { request_id, otp, challenge_id, credential_type, device_name,
   *         replace_device_id?, attestation }
   * Returns the device: `status` is `active` under `registration_approval: "otp"`
   * and `pending` under `"hr_approval"`, where it cannot punch until HR approves.
   */
  completeDeviceRegistration: (payload) => post("/attendance/trusted-devices/registration/complete", payload),
  /** My devices. Never carries `public_key`, `credential_id` or `sign_count`. */
  getMyTrustedDevices: () => request("/attendance/trusted-devices"),
  /** Rename only. body: { device_name } — nothing else is owner-editable. */
  renameTrustedDevice: (id, payload) => request(`/attendance/trusted-devices/${seg(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  /**
   * Self-revoke. Irreversible, and the same screen lock can never be enrolled
   * again. Idempotent: revoking an already-revoked device is a 200, not an error.
   *
   * SPEC DEVIATION, deliberate: the frontend guide shows a `{ reason }` body
   * here, but the verified API analysis (§5 API 7) says "Body: None" and the
   * controller writes `revoke_reason = 'user_revoked'` itself. So nothing is
   * sent — asking the person for a reason the server discards would be a lie.
   * HR's revoke (above) is the one that requires a reason.
   */
  revokeMyTrustedDevice: (id) => post(`/attendance/trusted-devices/${seg(id)}/revoke`),
};
