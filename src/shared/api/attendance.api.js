// ─────────────────────────────────────────────────────────────────────────────
// attendance.api.js — All attendance endpoints (employee, manager, HR)
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";
import { organizationAPI } from "./organization.api.js";

export const attendanceAPI = {
  // ── Employee (self-service) ──────────────────────────────────────
  clockIn: (payload) => request("/attendance/clock-in", { method: "POST", body: JSON.stringify(payload) }),
  clockOut: (payload) => request("/attendance/clock-out", { method: "POST", body: JSON.stringify(payload) }),
  breakStart: () => request("/attendance/break/start", { method: "POST" }),
  breakEnd: () => request("/attendance/break/end", { method: "POST" }),
  getToday: () => request("/attendance/today"),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/history${query ? `?${query}` : ""}`);
  },
  getSummary: (month, year) => request(`/attendance/summary?month=${month}&year=${year}`),
  submitRegularization: (payload) => request("/attendance/regularization", { method: "POST", body: JSON.stringify(payload) }),
  getMyRegularizations: () => request("/attendance/regularizations"),
  getMyShift: () => request("/attendance/shift"),

  // ── Phase 7 Employee APIs ──────────────────────────────────────
  getDailyLog: (date) => request(`/attendance/daily-log${date ? `?date=${date}` : ""}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${date ? `?date=${date}` : ""}`),
  getTrends: (months) => request(`/attendance/trends${months ? `?months=${months}` : ""}`),

  // ── HR — Policies ────────────────────────────────────────────────
  getPolicies: () => request("/attendance/hr/policies"),
  getPolicy: (id) => request(`/attendance/hr/policies/${id}`),
  createPolicy: (payload) => request("/attendance/hr/policies", { method: "POST", body: JSON.stringify(payload) }),
  updatePolicy: (id, payload) => request(`/attendance/hr/policies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivatePolicy: (id) => request(`/attendance/hr/policies/${id}/deactivate`, { method: "PATCH" }),

  // ── HR — Shifts ──────────────────────────────────────────────────
  getShifts: () => request("/attendance/hr/shifts"),
  getShift: (id) => request(`/attendance/hr/shifts/${id}`),
  createShift: (payload) => request("/attendance/hr/shifts", { method: "POST", body: JSON.stringify(payload) }),
  updateShift: (id, payload) => request(`/attendance/hr/shifts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteShift: (id) => request(`/attendance/hr/shifts/${id}`, { method: "DELETE" }),

  // ── HR — Rotations ───────────────────────────────────────────────
  getRotations: () => request("/attendance/hr/rotations"),
  createRotation: (payload) => request("/attendance/hr/rotations", { method: "POST", body: JSON.stringify(payload) }),
  deleteRotation: (id) => request(`/attendance/hr/rotations/${id}`, { method: "DELETE" }),

  // ── HR — Shift Roster / Assignments ─────────────────────────────
  getAssignments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/shifts/assignments${query ? `?${query}` : ""}`);
  },
  assignShift: (payload) => request("/attendance/hr/shifts/assign", { method: "POST", body: JSON.stringify(payload) }),
  updateAssignment: (id, payload) => request(`/attendance/hr/shifts/assignments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  endShiftAssignment: (id, payload) => request(`/attendance/hr/shifts/assignments/${id}/end`, { method: "POST", body: JSON.stringify(payload) }),
  deleteShiftAssignment: (id) => request(`/attendance/hr/shifts/assignments/${id}`, { method: "DELETE" }),

  // ── HR — Holidays ────────────────────────────────────────────────
  getHolidays: (year = new Date().getFullYear()) => request(`/attendance/hr/holidays?year=${year}`),
  createHoliday: (payload) => request("/attendance/hr/holidays", { method: "POST", body: JSON.stringify(payload) }),
  updateHoliday: (id, payload) => request(`/attendance/hr/holidays/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteHoliday: (id) => request(`/attendance/hr/holidays/${id}`, { method: "DELETE" }),

  // ── HR — Weekly Offs ─────────────────────────────────────────────
  getWeeklyOffs: () => request("/attendance/hr/weekly-offs"),
  createWeeklyOff: (payload) => request("/attendance/hr/weekly-offs", { method: "POST", body: JSON.stringify(payload) }),
  updateWeeklyOff: (id, payload) => request(`/attendance/hr/weekly-offs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteWeeklyOff: (id) => request(`/attendance/hr/weekly-offs/${id}`, { method: "DELETE" }),

  // ── HR — Regularizations (all org) ──────────────────────────────
  getOrgRegularizations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/regularizations${query ? `?${query}` : ""}`);
  },
  approveRegularization: (id) => request(`/attendance/hr/regularizations/${id}/approve`, { method: "POST" }),
  rejectRegularization: (id, payload) => request(`/attendance/hr/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Manager — Approvals & Inbox ──────────────────────────────────
  getManagerTeamToday: () => request("/attendance/manager/team/today"),
  getManagerTeamHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/manager/team/history${query ? `?${query}` : ""}`);
  },
  getManagerAnomalies: () => request("/attendance/manager/team/anomalies"),
  resolveManagerAnomaly: (id, payload) => request(`/attendance/manager/anomalies/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) }),

  getManagerPendingRegularizations: () => request("/attendance/manager/regularizations/pending"),
  approveManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  getManagerPendingOvertime: () => request("/attendance/manager/overtime/pending"),
  approveManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 7 Manager APIs ───────────────────────────────────────
  getTeamSummary: (date) => request(`/attendance/manager/team/summary${date ? `?date=${date}` : ""}`),
  getTeamMemberHistory: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/history${month && year ? `?month=${month}&year=${year}` : ""}`),
  getTeamMemberSummary: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getTeamGraphData: (month, year) => request(`/attendance/manager/team/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),

  // ── Phase 7 HR APIs ────────────────────────────────────────────
  getAllEmployeesAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeMonthlySummary: (userId, month, year) => request(`/attendance/hr/employees/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getAllManagersAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/attendance${query ? `?${query}` : ""}`);
  },
  getAllHRsAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/hrs/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerMonthlySummary: (userId, month, year) => request(`/attendance/hr/managers/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),

  // ── API 7.10.1 — HR Daily Log Drilldown ───────────────────────────────────
  getEmployeeDailyLog: (userId, date) => request(`/attendance/hr/employees/${userId}/daily-log${date ? `?date=${date}` : ""}`),
  getManagerDailyLog: (userId, date) => request(`/attendance/hr/managers/${userId}/daily-log${date ? `?date=${date}` : ""}`),
  getHRDailyLog: (userId, date) => request(`/attendance/hr/hrs/${userId}/daily-log${date ? `?date=${date}` : ""}`),

  getLiveDashboard: () => request("/attendance/hr/dashboard/live"),
  getDashboardGraphData: (month, year) => request(`/attendance/hr/dashboard/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getDepartmentSummary: (date) => request(`/attendance/hr/dashboard/department-summary${date ? `?date=${date}` : ""}`),
  getTopDefaulters: (month, year) => request(`/attendance/hr/dashboard/top-defaulters${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWorkModeDistribution: (date) => request(`/attendance/hr/dashboard/work-mode-distribution${date ? `?date=${date}` : ""}`),

  // ── Phase 5 — HR Locations (Geofencing) — delegates to organizationAPI ──
  getLocations: (params) => organizationAPI.getLocations(params),
  createLocation: (payload) => organizationAPI.createLocation(payload),
  updateLocation: (id, payload) => organizationAPI.updateLocation(id, payload),

  // ── Phase 5 — HR Comp Offs ────────────────────────────────────────
  getCompOffs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/comp-offs${query ? `?${query}` : ""}`);
  },
  approveCompOff: (id) => request(`/attendance/hr/comp-offs/${id}/approve`, { method: "POST" }),
  rejectCompOff: (id, payload) => request(`/attendance/hr/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 5 — Manager Comp Offs ───────────────────────────────────
  getManagerCompOffs: () => request("/attendance/manager/comp-offs/pending"),
  approveManagerCompOff: (id) => request(`/attendance/manager/comp-offs/${id}/approve`, { method: "POST" }),
  rejectManagerCompOff: (id, payload) => request(`/attendance/manager/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 6 — HR Lock Periods ─────────────────────────────────────
  getLockPeriods: () => request("/attendance/hr/locks"),
  createLockPeriod: (payload) => request("/attendance/hr/locks", { method: "POST", body: JSON.stringify(payload) }),
  deleteLockPeriod: (id) => request(`/attendance/hr/locks/${id}`, { method: "DELETE" }),

  // ── Phase 6 — HR Reports & Analytics ──────────────────────────────
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
};
