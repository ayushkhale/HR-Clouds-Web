// ─────────────────────────────────────────────────────────────────────────────
// index.js — Barrel export for the API layer
//
// All components import from "../../shared/api" which resolves to this file.
// This means zero imports need to change across the entire codebase.
// To add a new domain, create a new *.api.js module and re-export it here.
// ─────────────────────────────────────────────────────────────────────────────

export { tokenHelper, request, requestWithToken } from "./client.js";
export { authAPI } from "./auth.api.js";
export { organizationAPI } from "./organization.api.js";
export { hrmsAPI } from "./hrms.api.js";
export { attendanceAPI } from "./attendance.api.js";
export { leaveAPI } from "./leave.api.js";
