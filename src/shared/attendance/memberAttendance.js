// ─────────────────────────────────────────────────────────────────────────────
// attendance/memberAttendance.js — HR read endpoints are split by the member's
// role population (/hr/employees/*, /hr/managers/*, /hr/hrs/*). Profile tabs
// must call the family that matches the viewed person, otherwise HR staff
// were fetched through /employees/* (audit H48–H50).
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI } from "../api";
import { normalizeRole } from "../auth/permissions";
import { monthRange } from "./dates";

// A manager reads a report through the hierarchy-scoped /manager/team/member/*
// family whatever the report's role. History there takes a from/to range, so
// the month the tabs ask for is converted. The daily log comes from the
// manager-plane endpoint added 2026-09-24, which answers in the HR shape.
const MANAGER_VIEW = {
  population: "team",
  history: (userId, { month, year, ...rest } = {}) =>
    attendanceAPI.getTeamMemberHistory(userId, { ...monthRange(year, month), ...rest }),
  summary: attendanceAPI.getTeamMemberSummary,
  dailyLog: attendanceAPI.getTeamMemberDailyLog,
};

export function memberAttendanceApi(role, viewer = "hr") {
  if (viewer === "manager") return MANAGER_VIEW;
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
