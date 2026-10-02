// ─────────────────────────────────────────────────────────────────────────────
// organization/departmentPlanes.js — what a viewer may do with Departments, so
// DepartmentsPage and DepartmentDetailPage read a plane instead of branching on
// role (CLAUDE.md §2, same idea as ORG_PLANES in documents/orgDocumentPlanes.js).
//
// Departments are HR only: there is no manager department screen (user decision,
// 2026-10-02 — a manager-read plane was added, then removed). The adapter stays
// so the screens keep their `viewer` seam for a future workspace; today only
// `hr` exists and the screens default to it.
//
// A capability the plane lacks is `null`, and the screen hides the control
// rather than offering one the server would refuse.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI, organizationAPI } from "../api";

export const DEPARTMENT_PLANES = {
  hr: {
    key: "hr",
    listPath: "/dashboard/hr/departments",
    detailPath: (id) => `/dashboard/hr/departments/${id}`,
    create: (payload) => organizationAPI.createDepartment(payload),
    update: (id, payload) => organizationAPI.updateDepartment(id, payload),
    todaySummary: (date) => attendanceAPI.getDepartmentSummary(date),
    memberPath: (userId) => `/dashboard/hr/employees/${userId}`,
    rosterIsTeam: false,
  },
};
