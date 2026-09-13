// ─────────────────────────────────────────────────────────────────────────────
// attendance/paths.js — Self-service attendance routes per workspace.
// Self-service endpoints are authorised for every org role, so each workspace
// (employee / manager / hr) mounts the same pages under its own prefix and the
// sidebar stays inside the user's workspace.
// ─────────────────────────────────────────────────────────────────────────────

import { useLocation } from "react-router-dom";

export const SELF_SERVICE_BASE = {
  employee: "/dashboard/employee/attendance",
  manager: "/dashboard/manager/attendance",
  hr: "/dashboard/hr/my-attendance",
};

export const SELF_SERVICE_PAGES = {
  history: "",
  regularizations: "/regularizations",
  anomalies: "/anomalies",
  overtime: "/overtime",
  compOffs: "/comp-offs",
};

export function workspaceFromPath(pathname = "") {
  if (pathname.startsWith("/dashboard/hr")) return "hr";
  if (pathname.startsWith("/dashboard/manager")) return "manager";
  return "employee";
}

export function selfServicePath(workspace, page = "history") {
  return `${SELF_SERVICE_BASE[workspace] || SELF_SERVICE_BASE.employee}${SELF_SERVICE_PAGES[page] ?? ""}`;
}

/** Build self-service links relative to the workspace currently rendered. */
export function useSelfServicePath() {
  const { pathname } = useLocation();
  const workspace = workspaceFromPath(pathname);
  return (page = "history") => selfServicePath(workspace, page);
}
