// ─────────────────────────────────────────────────────────────────────────────
// attendance.api.js — All attendance endpoints
//
// Organized by role hierarchy: HR → Manager → Employee
// Within each role, APIs are grouped by sub-module (e.g. Policies, Shifts, etc.)
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";
import { organizationAPI } from "./organization.api.js";

export const attendanceAPI = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  HR
  //  All admin-level APIs for configuring and monitoring attendance
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR › Dashboard ─────────────────────────────────────────────────────────
  //    Live counts, graphs, department breakdowns, defaulters, work-mode dist.
  getLiveDashboard: () => request("/attendance/hr/dashboard/live"),
  getDashboardGraphData: (month, year) => request(`/attendance/hr/dashboard/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getDepartmentSummary: (date) => request(`/attendance/hr/dashboard/department-summary${date ? `?date=${date}` : ""}`),
  getTopDefaulters: (month, year) => request(`/attendance/hr/dashboard/top-defaulters${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWorkModeDistribution: (date) => request(`/attendance/hr/dashboard/work-mode-distribution${date ? `?date=${date}` : ""}`),

  // ── HR › Policies ──────────────────────────────────────────────────────────
  //    Attendance policies (grace period, auto-absent, etc.)
  getPolicies: () => request("/attendance/hr/policies"),
  getPolicy: (id) => request(`/attendance/hr/policies/${id}`),
  createPolicy: (payload) => request("/attendance/hr/policies", { method: "POST", body: JSON.stringify(payload) }),
  updatePolicy: (id, payload) => request(`/attendance/hr/policies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivatePolicy: (id) => request(`/attendance/hr/policies/${id}/deactivate`, { method: "PATCH" }),

  // ── HR › Shifts ────────────────────────────────────────────────────────────
  //    Shift definitions (start/end time, type, etc.)
  getShifts: () => request("/attendance/hr/shifts"),
  getShift: (id) => request(`/attendance/hr/shifts/${id}`),
  createShift: (payload) => request("/attendance/hr/shifts", { method: "POST", body: JSON.stringify(payload) }),
  updateShift: (id, payload) => request(`/attendance/hr/shifts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteShift: (id) => request(`/attendance/hr/shifts/${id}`, { method: "DELETE" }),

  // ── HR › Shift Roster / Assignments ────────────────────────────────────────
  //    Assign shifts to employees, update/end/delete assignments
  getAssignments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/shifts/assignments${query ? `?${query}` : ""}`);
  },
  assignShift: (payload) => request("/attendance/hr/shifts/assign", { method: "POST", body: JSON.stringify(payload) }),
  updateAssignment: (id, payload) => request(`/attendance/hr/shifts/assignments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  endShiftAssignment: (id, payload) => request(`/attendance/hr/shifts/assignments/${id}/end`, { method: "POST", body: JSON.stringify(payload) }),
  deleteShiftAssignment: (id) => request(`/attendance/hr/shifts/assignments/${id}`, { method: "DELETE" }),

  // ── HR › Rotations ─────────────────────────────────────────────────────────
  //    Shift rotation schedules
  getRotations: () => request("/attendance/hr/rotations"),
  createRotation: (payload) => request("/attendance/hr/rotations", { method: "POST", body: JSON.stringify(payload) }),
  deleteRotation: (id) => request(`/attendance/hr/rotations/${id}`, { method: "DELETE" }),

  // ── HR › Holidays ──────────────────────────────────────────────────────────
  //    Organization-wide holiday calendar
  getHolidays: (year = new Date().getFullYear()) => request(`/attendance/hr/holidays?year=${year}`),
  createHoliday: (payload) => request("/attendance/hr/holidays", { method: "POST", body: JSON.stringify(payload) }),
  updateHoliday: (id, payload) => request(`/attendance/hr/holidays/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteHoliday: (id) => request(`/attendance/hr/holidays/${id}`, { method: "DELETE" }),

  // ── HR › Weekly Offs ───────────────────────────────────────────────────────
  //    Weekly off rules (e.g. Sat-Sun off for all, alternate Saturdays, etc.)
  getWeeklyOffs: () => request("/attendance/hr/weekly-offs"),
  createWeeklyOff: (payload) => request("/attendance/hr/weekly-offs", { method: "POST", body: JSON.stringify(payload) }),
  updateWeeklyOff: (id, payload) => request(`/attendance/hr/weekly-offs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteWeeklyOff: (id) => request(`/attendance/hr/weekly-offs/${id}`, { method: "DELETE" }),

  // ── HR › Regularizations ───────────────────────────────────────────────────
  //    View/approve/reject all regularization requests across the org
  getOrgRegularizations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/regularizations${query ? `?${query}` : ""}`);
  },
  approveRegularization: (id) => request(`/attendance/hr/regularizations/${id}/approve`, { method: "POST" }),
  rejectRegularization: (id, payload) => request(`/attendance/hr/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── HR › Comp-Off Management ───────────────────────────────────────────────
  //    View/approve/reject comp-off requests across the org
  getCompOffs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/comp-offs${query ? `?${query}` : ""}`);
  },
  approveCompOff: (id) => request(`/attendance/hr/comp-offs/${id}/approve`, { method: "POST" }),
  rejectCompOff: (id, payload) => request(`/attendance/hr/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── HR › Comp-Off Policies ─────────────────────────────────────────────────
  //    Configure comp-off eligibility rules
  getCompOffPolicies: () => request("/attendance/hr/comp-off-policies"),
  createCompOffPolicy: (payload) => request("/attendance/hr/comp-off-policies", { method: "POST", body: JSON.stringify(payload) }),
  updateCompOffPolicy: (id, payload) => request(`/attendance/hr/comp-off-policies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCompOffPolicy: (id) => request(`/attendance/hr/comp-off-policies/${id}`, { method: "DELETE" }),

  // ── HR › Lock Periods ──────────────────────────────────────────────────────
  //    Lock attendance records for specific date ranges (prevents edits)
  getLockPeriods: () => request("/attendance/hr/locks"),
  createLockPeriod: (payload) => request("/attendance/hr/locks", { method: "POST", body: JSON.stringify(payload) }),
  deleteLockPeriod: (id) => request(`/attendance/hr/locks/${id}`, { method: "DELETE" }),

  // ── HR › Employee Attendance Records ───────────────────────────────────────
  //    View attendance data for any employee/manager/HR in the org
  getAllEmployeesAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeMonthlySummary: (userId, month, year) => request(`/attendance/hr/employees/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getEmployeeDailyLog: (userId, date) => request(`/attendance/hr/employees/${userId}/daily-log${date ? `?date=${date}` : ""}`),

  getAllManagersAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerMonthlySummary: (userId, month, year) => request(`/attendance/hr/managers/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getManagerDailyLog: (userId, date) => request(`/attendance/hr/managers/${userId}/daily-log${date ? `?date=${date}` : ""}`),

  getAllHRsAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/hrs/attendance${query ? `?${query}` : ""}`);
  },
  getHRDailyLog: (userId, date) => request(`/attendance/hr/hrs/${userId}/daily-log${date ? `?date=${date}` : ""}`),

  // ── HR › Reports & Analytics ───────────────────────────────────────────────
  //    Daily/monthly/per-employee attendance reports
  getDailyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/daily${query ? `?${query}` : ""}`);
  },
  getMonthlyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/monthly${query ? `?${query}` : ""}`);
  },
  getEmployeeReport: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/employee/${userId}${query ? `?${query}` : ""}`);
  },

  // ── HR › Devices (Biometric) ───────────────────────────────────────────────
  //    Register/manage biometric devices and employee→device mappings
  getDevices: () => request("/attendance/hr/devices"),
  createDevice: (payload) => request("/attendance/hr/devices", { method: "POST", body: JSON.stringify(payload) }),
  updateDevice: (id, payload) => request(`/attendance/hr/devices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDevice: (id) => request(`/attendance/hr/devices/${id}`, { method: "DELETE" }),
  getDeviceMappings: (id) => request(`/attendance/hr/devices/${id}/mappings`),
  createDeviceMapping: (id, payload) => request(`/attendance/hr/devices/${id}/mappings`, { method: "POST", body: JSON.stringify(payload) }),
  deleteDeviceMapping: (id, mappingId) => request(`/attendance/hr/devices/${id}/mappings/${mappingId}`, { method: "DELETE" }),

  // ── HR › Locations (Geofencing) ────────────────────────────────────────────
  //    Delegates to organizationAPI for location management
  getLocations: (params) => organizationAPI.getLocations(params),
  createLocation: (payload) => organizationAPI.createLocation(payload),
  updateLocation: (id, payload) => organizationAPI.updateLocation(id, payload),

  // ── HR › Maintenance ───────────────────────────────────────────────────────
  //    Recompute stale attendance records
  recomputeStaleRecords: () => request("/attendance/hr/records/recompute-stale", { method: "POST" }),


  // ═══════════════════════════════════════════════════════════════════════════
  //  MANAGER
  //  Team oversight, approvals, and direct-report drill-downs
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Manager › Team Overview ────────────────────────────────────────────────
  //    Today's status, history, summary, and graph data for direct reports
  getManagerTeamToday: () => request("/attendance/manager/team/today"),
  getManagerTeamHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/manager/team/history${query ? `?${query}` : ""}`);
  },
  getTeamSummary: (date) => request(`/attendance/manager/team/summary${date ? `?date=${date}` : ""}`),
  getTeamGraphData: (month, year) => request(`/attendance/manager/team/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),

  // ── Manager › Team Member Drill-Down ───────────────────────────────────────
  //    View a specific direct report's attendance history and monthly summary
  getTeamMemberHistory: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/history${month && year ? `?month=${month}&year=${year}` : ""}`),
  getTeamMemberSummary: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),

  // ── Manager › Anomalies ────────────────────────────────────────────────────
  //    View and resolve attendance anomalies for direct reports
  getManagerAnomalies: () => request("/attendance/manager/team/anomalies"),
  resolveManagerAnomaly: (id, payload) => request(`/attendance/manager/anomalies/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Manager › Regularization Approvals ─────────────────────────────────────
  //    Approve/reject regularization requests from direct reports
  getManagerPendingRegularizations: () => request("/attendance/manager/regularizations/pending"),
  approveManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Manager › Overtime Approvals ───────────────────────────────────────────
  //    Approve/reject overtime requests from direct reports
  getManagerPendingOvertime: () => request("/attendance/manager/overtime/pending"),
  approveManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Manager › Comp-Off Approvals ───────────────────────────────────────────
  //    Approve/reject comp-off requests from direct reports
  getManagerCompOffs: () => request("/attendance/manager/comp-offs/pending"),
  approveManagerCompOff: (id) => request(`/attendance/manager/comp-offs/${id}/approve`, { method: "POST" }),
  rejectManagerCompOff: (id, payload) => request(`/attendance/manager/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),


  // ═══════════════════════════════════════════════════════════════════════════
  //  EMPLOYEE
  //  Self-service APIs — clock in/out, breaks, own history/stats
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Employee › Clock In / Out ──────────────────────────────────────────────
  //    Punch in/out with location data
  clockIn: (payload) => request("/attendance/clock-in", { method: "POST", body: JSON.stringify(payload) }),
  clockOut: (payload) => request("/attendance/clock-out", { method: "POST", body: JSON.stringify(payload) }),

  // ── Employee › Breaks ──────────────────────────────────────────────────────
  //    Start/end break during a shift
  breakStart: () => request("/attendance/break/start", { method: "POST" }),
  breakEnd: () => request("/attendance/break/end", { method: "POST" }),

  // ── Employee › Today & History ─────────────────────────────────────────────
  //    Today's live record, paginated history, monthly summary
  getToday: () => request("/attendance/today"),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/history${query ? `?${query}` : ""}`);
  },
  getSummary: (month, year) => request(`/attendance/summary?month=${month}&year=${year}`),

  // ── Employee › Daily Log & Insights ────────────────────────────────────────
  //    Detailed daily log, graph data, weekly calendar, trend analysis
  getDailyLog: (date) => request(`/attendance/daily-log${date ? `?date=${date}` : ""}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${date ? `?date=${date}` : ""}`),
  getTrends: (months) => request(`/attendance/trends${months ? `?months=${months}` : ""}`),

  // ── Employee › Shift & Holidays ────────────────────────────────────────────
  //    View own assigned shift and upcoming holidays
  getMyShift: () => request("/attendance/shift"),
  getUpcomingHolidays: () => request("/attendance/holidays"),

  // ── Employee › Regularizations ─────────────────────────────────────────────
  //    Submit/view/cancel own regularization requests
  submitRegularization: (payload) => request("/attendance/regularization", { method: "POST", body: JSON.stringify(payload) }),
  getMyRegularizations: () => request("/attendance/regularizations"),
  cancelRegularization: (id) => request(`/attendance/regularizations/${id}/cancel`, { method: "POST" }),

  // ── Employee › Overtime ────────────────────────────────────────────────────
  //    View own overtime logs
  getMyOvertime: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/overtime/mine${query ? `?${query}` : ""}`);
  },

  // ── Employee › Anomalies ───────────────────────────────────────────────────
  //    View own attendance anomalies
  getMyAnomalies: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/anomalies/mine${query ? `?${query}` : ""}`);
  },

  // ── Employee › Comp-Offs ───────────────────────────────────────────────────
  //    View own comp-off requests and summary
  getMyCompOffs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/comp-offs/mine${query ? `?${query}` : ""}`);
  },
  getMyCompOffSummary: () => request("/attendance/comp-offs/mine/summary"),
};
