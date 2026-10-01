// ─────────────────────────────────────────────────────────────────────────────
// organization/departmentPlanes.js — what each workspace may do with
// Departments, so DepartmentsPage and DepartmentDetailPage ask "what can this
// viewer do?" instead of branching on role (CLAUDE.md §2, same idea as
// ORG_PLANES in documents/orgDocumentPlanes.js).
//
//   hr      — list, create and edit (#16–#18), today's attendance by department
//             (#61), every member's profile.
//   manager — list only (#16 is open to every role; #17/#18 are HR-only) and
//             no attendance summary (#61 is hr/admin). Their roster read (#8)
//             is hierarchy-scoped to their own reports, so a department's
//             member list for a manager is "your team in this department", and
//             only those people have a profile page they can open.
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
  manager: {
    key: "manager",
    listPath: "/dashboard/manager/departments",
    detailPath: (id) => `/dashboard/manager/departments/${id}`,
    create: null,
    update: null,
    todaySummary: null,
    memberPath: (userId) => `/dashboard/manager/team/member/${userId}`,
    rosterIsTeam: true,
  },
};
