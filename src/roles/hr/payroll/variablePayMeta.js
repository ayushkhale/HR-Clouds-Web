// ─────────────────────────────────────────────────────────────────────────────
// variablePayMeta.js — Labels and helpers shared by the Salary Adjustments and
// Bonus Rules screens. Plain-language wording only.
//
// Source of truth: PAYROLL_BACKEND_RESPONSES.md (2026-09-14) §4 adjustments,
// §5 bonus rules, §6.1 employee lookup.
// ─────────────────────────────────────────────────────────────────────────────

import { formatPeriod } from "../../../shared/utils/formatUtils";
import { personName, employeeCode, departmentName } from "../../../shared/attendance/normalize";
import { prettifyCode, toCount } from "./runMeta";

// ── Periods ─────────────────────────────────────────────────────────────────

export const isPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");

export const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Month options for filters, newest first. */
export function periodOptions({ back = 18, ahead = 6 } = {}) {
  const now = new Date();
  const out = [];
  for (let i = ahead; i >= -back; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: formatPeriod(value) });
  }
  return out;
}

// ── Money ───────────────────────────────────────────────────────────────────

/** Positive amount with at most 2 decimals, or NaN. */
export function parseAmount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  const n = Number(text);
  return n > 0 ? n : NaN;
}

/** Money arrives as DECIMAL strings; compare in paise so "25000" equals "25000.00". */
export function sameMoney(a, b) {
  const x = Number.parseFloat(a);
  const y = Number.parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.round(x * 100) === Math.round(y * 100);
}

// ── Employees ───────────────────────────────────────────────────────────────

/**
 * Normalise the organisation employee list (see shared/utils/orgEmployees).
 * Every payroll `user_id` — run items, adjustments, awards, `proposed_by`,
 * `approved_by` — is a users.id and matches the row's `user_id`. The row's
 * `employee_id` is a role-profile id, so it is never used as a key.
 * `options` is everyone (for lookups); `activeOptions` is for pickers.
 */
export function employeeDirectory(list) {
  const options = [];
  const byId = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    const id = e?.user_id ?? e?.id;
    if (!id || byId.has(id)) continue;
    const entry = {
      id,
      name: personName(e, "") || employeeCode(e) || "Unnamed employee",
      code: employeeCode(e),
      department: departmentName(e),
      active: e.is_active !== false && e.status !== "inactive",
    };
    options.push(entry);
    byId.set(id, entry);
  }
  options.sort((a, b) => a.name.localeCompare(b.name));
  return { options, activeOptions: options.filter((o) => o.active), byId };
}

/**
 * The employee the backend embedded in a payroll row (gap G-2, `?include=employee`):
 * `employee: { user_id, name, employee_code, department, is_active }`. Leavers
 * resolve too. null when the key is absent (G-2 not shipped) or has no name.
 * @returns {{ id: string, name: string, code: string, department: string, active: boolean } | null}
 */
export function embeddedEmployee(row) {
  const e = row?.employee;
  if (!e || typeof e !== "object") return null;
  const name = typeof e.name === "string" ? e.name.trim() : "";
  if (!name) return null;
  return {
    id: e.user_id ?? row.user_id ?? "",
    name,
    code: typeof e.employee_code === "string" ? e.employee_code : "",
    department: typeof e.department === "string" ? e.department : departmentName(e),
    active: e.is_active !== false,
  };
}

/**
 * Name of the person in an actor field (gap G-2): `approved_by` →
 * `approved_by_user: { user_id, name }`. null when absent or nameless.
 */
export function actorName(row, field) {
  const actor = row?.[`${field}_user`];
  const name = actor && typeof actor === "object" && typeof actor.name === "string" ? actor.name.trim() : "";
  return name || null;
}

/** Case-insensitive match on name, code or department. */
export const matchesEmployee = (entry, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.name, entry.code, entry.department].some((v) => (v || "").toLowerCase().includes(q));
};

// ── Approval status (the maker–checker quartet) ─────────────────────────────

export const APPROVAL_STATUS = {
  pending: { label: "Waiting for approval", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  approved: { label: "Approved", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  rejected: { label: "Rejected", pill: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const approvalStatusMeta = (status) =>
  APPROVAL_STATUS[status] || { label: prettifyCode(status) || "Unknown", pill: "bg-slate-50 text-slate-600 border-slate-200" };

export const isPendingStatus = (status) => status === "pending";

export const APPROVAL_STATUS_FILTERS = [
  ["", "All statuses"],
  ["pending", "Waiting for approval"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
];

// ── Adjustments ─────────────────────────────────────────────────────────────

export const ADJUSTMENT_TYPE_LABEL = { earning: "Addition", deduction: "Deduction" };

export const ADJUSTMENT_CATEGORY_LABEL = {
  bonus: "Bonus",
  incentive: "Incentive",
  ad_hoc_earning: "One-time addition",
  ad_hoc_deduction: "One-time deduction",
  recovery: "Recovery",
  arrear: "Arrear",
};

// Categories that can be created. `arrear` is rejected at create, but rows with
// it can exist, so it is offered as a list filter only.
export const CATEGORIES_BY_TYPE = {
  earning: ["bonus", "incentive", "ad_hoc_earning"],
  deduction: ["recovery", "ad_hoc_deduction"],
};

export const FILTER_CATEGORIES = [...CATEGORIES_BY_TYPE.earning, ...CATEGORIES_BY_TYPE.deduction, "arrear"];

/** Where an adjustment came from (bonus_rule_id / source_loan_id / batch_id). */
export function adjustmentSource(adj) {
  if (adj?.source_loan_id) return "Loan closure";
  if (adj?.bonus_rule_id) return "Bonus rule";
  if (adj?.batch_id) return "Bulk upload";
  return "Added by hand";
}

/** "Applied" is not a status: an applied row stays `approved` with `applied_at` set. */
export const isAppliedAdjustment = (adj) => !!(adj?.applied_at || adj?.applied_run_id);

/** Pending, or approved and not yet used by a payroll run. */
export const canCancelAdjustment = (adj) =>
  (isPendingStatus(adj?.status) || adj?.status === "approved") && !isAppliedAdjustment(adj);

/** Why an adjustment has no actions left, for the detail footer. */
export function adjustmentLockedReason(adj) {
  if (isAppliedAdjustment(adj)) return "Already used in an approved payroll, so it can't be changed. Cancel that payroll run first if it's wrong.";
  if (adj?.status === "rejected") return "Rejected. Create a new adjustment if it's still needed.";
  if (adj?.status === "cancelled") return "Cancelled. Create a new adjustment if it's still needed.";
  return "There's nothing to do on this adjustment.";
}

// ── Component codes ─────────────────────────────────────────────────────────

/** Engine-owned codes an adjustment may not use (checked case-insensitively). */
export const RESERVED_COMPONENT_CODES = ["NET_PAY_SHORTFALL_CARRIED", "CARRY_FORWARD_RECOVERY", "OVERTIME", "ROUNDING_ADJUSTMENT", "REIMBURSEMENT", "BENEFIT"];

const CODE_MAX = 50;

/** "Spot award – Q2" → "SPOT_AWARD_Q2". */
export function codeFromName(name) {
  let code = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (code && !/^[A-Z]/.test(code)) code = `ADJ_${code}`;
  return code.slice(0, CODE_MAX).replace(/_+$/, "");
}

/** "" when the code is usable, otherwise the problem. */
export function componentCodeProblem(code) {
  const text = String(code || "").trim();
  if (!text) return "Enter a component code.";
  if (!/^[A-Z][A-Z0-9_]*$/.test(text)) return "Use capital letters, digits and underscores, starting with a letter (e.g. SPOT_AWARD).";
  if (text.length < 2 || text.length > CODE_MAX) return `Use 2 to ${CODE_MAX} characters.`;
  if (RESERVED_COMPONENT_CODES.includes(text.toUpperCase())) return "This code is reserved for payroll's own calculations. Choose another.";
  return "";
}

// ── Bulk upload ─────────────────────────────────────────────────────────────

export const BULK_REQUIRED_HEADERS = ["adjustment_type", "category", "component_code", "component_name", "amount", "reason"];
export const BULK_IDENTITY_HEADERS = ["employee_code", "user_id"];
export const BULK_OPTIONAL_HEADERS = ["is_taxable", "pf_applicable", "esi_applicable"];
export const BULK_CSV_HEADERS = ["employee_code", ...BULK_REQUIRED_HEADERS];

export const BULK_CSV_SAMPLE = [
  BULK_CSV_HEADERS.join(","),
  "EMP-001,earning,bonus,FESTIVE_BONUS,Festive Bonus,5000,Diwali bonus",
  "EMP-002,deduction,recovery,LAPTOP_RECOVERY,Laptop Recovery,2000,Damaged screen",
].join("\n");

export const BULK_MAX_ROWS = 5000;

/** Missing columns in the header row, as a message, or "" when the header is fine. */
export function csvHeaderProblem(text) {
  const firstLine = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) || "";
  // The backend matches header names exactly (case-sensitive), so this check does too.
  const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, "").trim());
  const missing = BULK_REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  const noIdentity = !BULK_IDENTITY_HEADERS.some((h) => headers.includes(h));
  if (missing.length === 0 && !noIdentity) return "";
  const parts = [];
  if (missing.length) parts.push(`missing ${missing.join(", ")}`);
  if (noIdentity) parts.push("needs an employee_code or user_id column");
  return `The header row is ${parts.join(" and ")}. The first line must name the columns.`;
}

const BULK_ROW_ERROR = {
  MISSING_IDENTIFIER: "No employee code or id on this row.",
  EMPLOYEE_NOT_FOUND: "No active employee matches this code.",
  INVALID_ADJUSTMENT_TYPE: "Type must be earning or deduction.",
  INVALID_CATEGORY: "Category must be bonus, incentive, ad_hoc_earning, ad_hoc_deduction or recovery.",
  MISSING_COMPONENT_CODE: "Component code is empty.",
  RESERVED_COMPONENT_CODE: "This component code is reserved by payroll.",
  MISSING_COMPONENT_NAME: "Component name is empty.",
  MISSING_REASON: "Reason is empty.",
  INVALID_MONEY: "Amount is not a valid number.",
  NEGATIVE_MONEY: "Amount must be positive. Use the type column for a deduction.",
  MONEY_OVERFLOW: "Amount is too large.",
  INVALID_BOOLEAN: "Use true or false in the tax, PF and ESI columns.",
  COMPONENT_NOT_FOUND_OR_INACTIVE: "The linked component is inactive or doesn't exist.",
  ROW_INVALID: "This row couldn't be processed.",
};

export const bulkRowMessage = (code) => BULK_ROW_ERROR[code] || prettifyCode(code) || "This row has a problem.";

/** Totals from a bulk preview or commit response (`data.totals`). */
export function bulkTotals(data) {
  const t = data?.totals && typeof data.totals === "object" ? data.totals : {};
  return {
    totalRows: toCount(t.total_rows),
    okRows: toCount(t.ok_rows),
    errorRows: toCount(t.error_rows),
    earnings: t.earnings_total ?? "0.00",
    deductions: t.deductions_total ?? "0.00",
  };
}

/** Count data rows in raw CSV text (non-empty lines after the header). */
export function csvDataRowCount(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}

// ── Bonus rules ─────────────────────────────────────────────────────────────

export const BONUS_TYPE_LABEL = {
  flat: "Fixed amount",
  percent_of_basic: "% of basic pay",
  percent_of_gross: "% of gross pay",
};

export const BONUS_TYPE_OPTIONS = ["percent_of_basic", "percent_of_gross", "flat"];

export const ELIGIBILITY_LABEL = {
  all_employees: "Everyone",
  department: "Chosen departments",
  manual: "Chosen employees",
  csv_upload: "Chosen employees (from a list)",
  performance_rating: "By performance rating",
};

// Offered for new rules. `csv_upload` behaves exactly like `manual` (it reads
// `user_ids`), so existing ones are edited like chosen employees.
// `performance_rating` has no data source: every candidate is skipped and apply fails.
export const ELIGIBILITY_OPTIONS = ["all_employees", "department", "manual"];
export const usesUserIds = (source) => source === "manual" || source === "csv_upload";
export const isUnavailableSource = (source) => source === "performance_rating";

export const EMPLOYMENT_TYPE_LABEL = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

// Gap G-5: the backend rejects percentages above 100 (VALIDATION_ERROR) once
// Wave 1 ships, with no override flag. The form enforces the same limit so the
// check doesn't depend on that release; flat amounts stay uncapped.
export const MAX_PERCENT = 100;
export const CONFIRM_PERCENT_ABOVE = 50;

const SKIP_REASON = {
  NOT_ELIGIBLE: "Not in the chosen departments or employees.",
  EMPLOYMENT_TYPE_EXCLUDED: "Their employment type isn't included.",
  INSUFFICIENT_TENURE: "Hasn't worked here long enough.",
  NO_SALARY_STRUCTURE: "No approved salary structure, so no bonus can be worked out.",
  ELIGIBILITY_SOURCE_UNAVAILABLE: "Choosing by performance rating isn't available yet.",
};

export const skipReasonText = (code) => SKIP_REASON[code] || prettifyCode(code) || "Not eligible.";

export const BASIS_LABEL = {
  flat: "Fixed amount",
  structure_monthly_gross: "Monthly gross from the salary structure",
  structure_basic: "Monthly basic pay from the salary structure",
};

/**
 * `POST /bonus-rules/:id/preview-impact` →
 * `{ rule, awarded_count, skipped_count, total_award_amount, awards[], skipped[], note }`.
 * Gap G-7 adds `capped` / `uncapped_amount` to each award; `capped` is true only
 * when the cap actually cut the amount. Without it, "at the cap" is inferred
 * from the rule's cap, which wrongly flags an amount that lands exactly on it.
 */
export function normalizeImpact(data, rule) {
  const d = data && typeof data === "object" ? data : {};
  const cap = rule?.max_amount_per_employee;
  const hasCap = cap !== null && cap !== undefined && cap !== "";
  const awards = (Array.isArray(d.awards) ? d.awards : []).map((r) => ({
    user_id: r?.user_id,
    employee: r?.employee ?? null,
    amount: r?.amount ?? "0.00",
    basis: r?.basis || "",
    // A flat bonus reports basis_amount "0.00"; there is no salary basis to show.
    basisAmount: r?.basis && r.basis !== "flat" ? r.basis_amount ?? null : null,
    atCap: typeof r?.capped === "boolean" ? r.capped : hasCap && sameMoney(r?.amount, cap),
    // Only worth showing when the cap bit; otherwise it equals `amount`.
    uncappedAmount: r?.capped === true ? r.uncapped_amount ?? null : null,
  }));
  const skipped = (Array.isArray(d.skipped) ? d.skipped : []).map((r) => ({ user_id: r?.user_id, employee: r?.employee ?? null, reason: r?.reason }));
  const bases = [...new Set(awards.map((a) => a.basis).filter((b) => b && b !== "flat"))];
  return {
    awards,
    skipped,
    total: d.total_award_amount ?? "0.00",
    awardedCount: toCount(d.awarded_count ?? awards.length),
    skippedCount: toCount(d.skipped_count ?? skipped.length),
    basisLabel: bases.length === 1 ? BASIS_LABEL[bases[0]] || "" : "",
    capped: awards.filter((a) => a.atCap).length,
  };
}
