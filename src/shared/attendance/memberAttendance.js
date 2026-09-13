// ─────────────────────────────────────────────────────────────────────────────
// attendance/memberAttendance.js — HR read endpoints are split by the member's
// role population (/hr/employees/*, /hr/managers/*, /hr/hrs/*). Profile tabs
// must call the family that matches the viewed person, otherwise HR staff
// were fetched through /employees/* (audit H48–H50).
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI } from "../api";
import { normalizeRole } from "../auth/permissions";

export function memberAttendanceApi(role) {
  const r = normalizeRole(role);
  if (r === "manager") {
    return {
      population: "managers",
      history: attendanceAPI.getIndividualManagerAttendanceDetail,
      summary: attendanceAPI.getIndividualManagerMonthlySummary,
      dailyLog: attendanceAPI.getManagerDailyLog,
    };
  }
  if (r === "hr" || r === "admin" || r === "super-admin") {
    return {
      population: "hrs",
      history: attendanceAPI.getIndividualHRAttendanceDetail,
      summary: attendanceAPI.getIndividualHRMonthlySummary,
      dailyLog: attendanceAPI.getHRDailyLog,
    };
  }
  return {
    population: "employees",
    history: attendanceAPI.getIndividualEmployeeAttendanceDetail,
    summary: attendanceAPI.getIndividualEmployeeMonthlySummary,
    dailyLog: attendanceAPI.getEmployeeDailyLog,
  };
}
