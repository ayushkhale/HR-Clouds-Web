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

/**
 * Self-service Documents routes per workspace (Phase 4 adds `requests`;
 * Phase 5 adds `all`, the composed portfolio, and `forms`, the blank-form
 * catalogue).
 *
 * The employee workspace needs no "my-" prefix, because everything under it is
 * already theirs; the HR and manager workspaces do, because those prefixes sit
 * beside the org-wide and team screens of the same name. `forms` is the one
 * exception in every workspace: a blank form belongs to nobody, so calling it
 * "my forms" would be wrong.
 */
export const MY_DOCUMENT_PATHS = {
  employee: {
    documents: "/dashboard/employee/documents",
    company: "/dashboard/employee/company-documents",
    requests: "/dashboard/employee/document-requests",
    all: "/dashboard/employee/documents/all",
    forms: "/dashboard/employee/forms",
  },
  manager: {
    documents: "/dashboard/manager/my-documents",
    company: "/dashboard/manager/company-documents",
    requests: "/dashboard/manager/my-document-requests",
    all: "/dashboard/manager/my-documents/all",
    forms: "/dashboard/manager/forms",
  },
  hr: {
    documents: "/dashboard/hr/my-documents",
    company: "/dashboard/hr/company-documents",
    requests: "/dashboard/hr/my-document-requests",
    all: "/dashboard/hr/my-documents/all",
    forms: "/dashboard/hr/forms",
  },
};

/**
 * Self-service leave and pay routes per workspace. Everyone in the organisation
 * takes leave and gets paid, HR and managers included, so each workspace mounts
 * the same employee screens under its own prefix — the same arrangement as
 * attendance and documents above. Before 28 Sep 2026 these existed only in the
 * employee workspace, which left HR and managers with no page to apply for their
 * own leave or open their own payslip.
 */
export const MY_PAY_PATHS = {
  employee: {
    leaves: "/dashboard/employee/leaves",
    salary: "/dashboard/employee/payroll/my-salary",
    payslips: "/dashboard/employee/payroll/my-payslips",
    claims: "/dashboard/employee/payroll/reimbursements",
    loans: "/dashboard/employee/payroll/loans",
    tax: "/dashboard/employee/payroll/tax",
  },
  manager: {
    leaves: "/dashboard/manager/my-leaves",
    salary: "/dashboard/manager/my-salary",
    payslips: "/dashboard/manager/my-payslips",
    claims: "/dashboard/manager/my-reimbursements",
    loans: "/dashboard/manager/my-loans",
    tax: "/dashboard/manager/my-tax",
  },
  hr: {
    leaves: "/dashboard/hr/my-leaves",
    salary: "/dashboard/hr/my-salary",
    payslips: "/dashboard/hr/my-payslips",
    claims: "/dashboard/hr/my-reimbursements",
    loans: "/dashboard/hr/my-loans",
    tax: "/dashboard/hr/my-tax",
  },
};

/**
 * The whole-organisation pages every role can read: the Org Chart and the
 * Company Profile (added 30 Sep 2026). Both endpoints are open to every tenant
 * role and return the same org for all of them, so each workspace mounts the
 * same screen under its own prefix — an HR user browsing the chart from the
 * manager workspace keeps the manager sidebar.
 */
export const ORG_PATHS = {
  employee: { chart: "/dashboard/employee/org-chart", company: "/dashboard/employee/company" },
  manager: { chart: "/dashboard/manager/org-chart", company: "/dashboard/manager/company" },
  hr: { chart: "/dashboard/hr/org-chart", company: "/dashboard/hr/company" },
};

/** The Org Chart / Company Profile links for whichever workspace is rendered. */
export function useOrgPaths() {
  const { pathname } = useLocation();
  return ORG_PATHS[workspaceFromPath(pathname)] || ORG_PATHS.employee;
}

/** The self-service leave and pay links for whichever workspace is rendered. */
export function useMyPayPaths() {
  const { pathname } = useLocation();
  return MY_PAY_PATHS[workspaceFromPath(pathname)] || MY_PAY_PATHS.employee;
}

/** The self-service Documents links for whichever workspace is rendered. */
export function useMyDocumentPaths() {
  const { pathname } = useLocation();
  return MY_DOCUMENT_PATHS[workspaceFromPath(pathname)] || MY_DOCUMENT_PATHS.employee;
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
