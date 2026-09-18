// ─────────────────────────────────────────────────────────────────────────────
// phase6Meta.js — Labels, states and report definitions for the payroll
// delivery layer (payslips, reports, exports, bank advice).
//
// Source: md_payrolls/phases/phase6_api_analysis.md and
// phase6_implementation_plan.md §5–§8. Pure data and helpers, no JSX, shared by
// the HR, manager and employee screens so the same words appear everywhere.
// ─────────────────────────────────────────────────────────────────────────────

/** A payslip row's lifecycle. Only one version per employee per run is `active`. */
export const PAYSLIP_STATUS = {
  active: { label: "Current", pill: "bg-purple-50 text-purple-700 border-purple-200" },
  superseded: { label: "Replaced", pill: "bg-slate-100 text-slate-500 border-slate-200" },
  revoked: { label: "Withdrawn", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** The notification-email queue. The payslip is published regardless of this (EC-69). */
export const EMAIL_STATUS = {
  not_requested: { label: "Not sent", pill: "bg-slate-50 text-slate-500 border-slate-200" },
  pending: { label: "Queued", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  sending: { label: "Sending", pill: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  sent: { label: "Sent", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  failed: { label: "Failed", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const EXPORT_STATUS = {
  started: { label: "In progress", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  completed: { label: "Completed", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  failed: { label: "Failed", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** `payroll_report_exports.report_type` in plain words. */
export const EXPORT_TYPE_LABEL = {
  payroll_register: "Payroll register",
  department_distribution: "Department distribution",
  deduction_summary: "Deduction summary",
  component_report: "Component report",
  bank_advice: "Bank file (NEFT)",
  payslip_bulk: "Payslips (ZIP)",
  payslip_single: "Payslip PDF",
  annual_statement: "Annual statement",
  form16: "Form 16",
};

export const EXPORT_SCOPE_LABEL = {
  org: "Whole organisation",
  team: "Manager's team",
  self: "Own records",
};

export const meta = (map, key, fallbackLabel = "N/A") =>
  map[key] || { label: key ? String(key).replace(/_/g, " ") : fallbackLabel, pill: "bg-slate-50 text-slate-600 border-slate-200" };

// ── Reports ─────────────────────────────────────────────────────────────────

/**
 * The four report families (#177–#180 for HR, #187–#190 for managers).
 * `key` is the URL segment; `grain` says what one row means; `employeeGrain`
 * marks the two that collapse to totals for a manager without compensation
 * visibility (EC-67).
 */
export const REPORTS = [
  {
    key: "payroll-register",
    label: "Payroll register",
    hint: "Every employee's pay for the period, one row per person per run, with a column for each salary component.",
    grain: "employee",
    employeeGrain: true,
    formats: ["csv", "pdf"],
  },
  {
    key: "department-distribution",
    label: "Department distribution",
    hint: "What each department cost — headcount, gross, deductions, employer cost and net pay.",
    grain: "department",
    employeeGrain: false,
    formats: ["csv", "pdf"],
    groupBy: true,
  },
  {
    key: "deduction-summary",
    label: "Deduction summary",
    hint: "Totals per deduction and employer contribution, including PF admin and EDLI charges.",
    grain: "component",
    employeeGrain: false,
    formats: ["csv", "pdf"],
  },
  {
    key: "components",
    label: "Component report",
    hint: "Pick specific salary components and see them per employee — the filterable custom report.",
    grain: "employee-component",
    employeeGrain: true,
    formats: ["csv", "pdf"],
  },
];

export const reportByKey = (key) => REPORTS.find((r) => r.key === key) || REPORTS[0];

/** Backend bound: a report covers at most 12 months (REPORT_MAX_MONTHS, EC-66). */
export const MAX_REPORT_MONTHS = 12;

/** "2026-03" → count of months from `from` to `to`, inclusive. 0 when either is missing. */
export function monthSpan(from, to) {
  if (!/^\d{4}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}$/.test(to || "")) return 0;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** The current month as "YYYY-MM". */
export function currentPeriodMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** `n` months before `period` ("2026-03", 2 → "2026-01"). */
export function shiftPeriodMonth(period, months) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) return period;
  const [y, m] = period.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Why a report can't be run yet, or "" when it can.
 * A report needs either one run or a period of at most 12 months.
 */
export function reportRangeProblem({ runId, periodFrom, periodTo }) {
  if (runId) return "";
  if (!periodFrom || !periodTo) return "Choose a payroll run, or a period to cover.";
  if (periodFrom > periodTo) return "The first month can't be after the last month.";
  if (monthSpan(periodFrom, periodTo) > MAX_REPORT_MONTHS) return `A report can cover at most ${MAX_REPORT_MONTHS} months.`;
  return "";
}

// ── Payslip index filters (#167) ────────────────────────────────────────────

export const PAYSLIP_STATUS_FILTERS = [
  ["", "All versions"],
  ["active", "Current"],
  ["superseded", "Replaced"],
  ["revoked", "Withdrawn"],
];

export const PAYSLIP_VISIBILITY_FILTERS = [
  ["", "Released or held"],
  ["true", "Released to employees"],
  ["false", "Held back"],
];

export const EMAIL_STATUS_FILTERS = [
  ["", "Any email state"],
  ["not_requested", "Not sent"],
  ["pending", "Queued"],
  ["sending", "Sending"],
  ["sent", "Sent"],
  ["failed", "Failed"],
];

/** Attempts are capped backend-side; a row at the cap needs a person, not a retry. */
export const EMAIL_MAX_ATTEMPTS = 5;

/** A file name that says what the file is without leaking a name into the path. */
export function exportFileName({ kind, period, extension }) {
  const stamp = period || currentPeriodMonth();
  return `${kind}-${stamp}.${extension}`;
}
