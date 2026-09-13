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
  getShifts: () => request("/attendance/hr/shifts"),
  getShift: (id) => request(`/attendance/hr/shifts/${seg(id)}`),
  createShift: (payload) => post("/attendance/hr/shifts", payload),
  updateShift: (id, payload) => put(`/attendance/hr/shifts/${seg(id)}`, payload),
  deleteShift: (id) => del(`/attendance/hr/shifts/${seg(id)}`),

  // ── HR › Shift Roster / Assignments (H6–H9) ────────────────────────────────
  getAssignments: (params = {}) => request(`/attendance/hr/shifts/assignments${qs(params)}`),
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

  // ── Shift & Holidays (U13, U20) ────────────────────────────────────────────
  getMyShift: () => request("/attendance/shift"),
  /** Takes no parameters — a `year` would be ignored (§4.3). Filter by date client-side. */
  getUpcomingHolidays: () => request("/attendance/holidays"),

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
};
