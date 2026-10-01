// ─────────────────────────────────────────────────────────────────────────────
// benefitMeta.js — Labels, contribution maths and normalizers for Phase 5
// benefit plans and enrollments. Pure helpers, shared by the HR, manager and
// employee benefit views.
//
// Contract A (see PAYROLL_PHASE5_FRONTEND_PLAN.md §0):
//   • flat monthly employee/employer contributions per plan
//   • any month an enrollment touches is charged in full — no proration (D-36)
//   • benefit plans have no income-tax effect (D-37)
//   • enrollment status: active / ended / cancelled (cancelled is read-only)
// ─────────────────────────────────────────────────────────────────────────────

import { formatPeriod } from "./formatUtils";
import { prettifyCode, toCount } from "../../roles/hr/payroll/runMeta";
import { moneyOrNull } from "./reimbursementMeta";

export const BENEFIT_TYPE_LABEL = {
  health_insurance: "Health insurance",
  life_insurance: "Life insurance",
  accident_insurance: "Accident insurance",
  meal: "Meal",
  travel: "Travel",
  other: "Other",
};

export const BENEFIT_TYPE_OPTIONS = ["health_insurance", "life_insurance", "accident_insurance", "meal", "travel", "other"];

export const benefitTypeLabel = (type) => BENEFIT_TYPE_LABEL[type] || prettifyCode(type) || "Other";

// ── Enrollment status ────────────────────────────────────────────────────────

export const ENROLLMENT_STATUS = {
  active: { label: "Active", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  ended: { label: "Ended", pill: "bg-slate-100 text-slate-500 border-slate-200" },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500 border-slate-200" },
};
export const enrollmentStatusMeta = (status) =>
  ENROLLMENT_STATUS[status] || { label: prettifyCode(status) || "Unknown", pill: "bg-slate-50 text-slate-600 border-slate-200" };

export const ENROLLMENT_STATUS_FILTERS = [
  ["active", "Active"],
  ["ended", "Ended"],
  ["cancelled", "Cancelled"],
  ["", "All"],
];

// ── Notes shown at the point they matter ─────────────────────────────────────

// D-37 — benefit plans never change income tax.
export const NO_TAX_EFFECT_NOTE =
  "Benefit plans don't change income tax. A premium doesn't count toward 80D automatically, and a company-paid perk isn't taxed here.";

// D-36 — a month is charged in full if cover is active on any day of it.
export const NO_PRORATION_NOTE = "A month is charged in full if cover is active on any day of it.";

const monthLabelOf = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "that month";
  return formatPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
};

const nextMonthLabelOf = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "the next month";
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return formatPeriod(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
};

/** D-36 notice for a start date. */
export const chargeNoticeForStart = (date) =>
  `${monthLabelOf(date)} is charged in full, even if cover starts mid-month.`;

/** D-36 notice for an end date. */
export const chargeNoticeForEnd = (date) =>
  `${monthLabelOf(date)} is still charged in full. Nothing is charged from ${nextMonthLabelOf(date)}.`;

// ── Contribution maths ───────────────────────────────────────────────────────

/**
 * The effective monthly employee/employer contribution for an enrollment.
 * An override wins when set (including "0", which means free); a blank override
 * inherits the plan amount. `plan` may be embedded on the enrollment.
 * @returns {{ employee: number|null, employer: number|null, employeeOverridden: boolean, employerOverridden: boolean }}
 */
export function effectiveContribution(enrollment, plan) {
  const e = enrollment && typeof enrollment === "object" ? enrollment : {};
  const p = (plan && typeof plan === "object" ? plan : null) || (e.plan && typeof e.plan === "object" ? e.plan : {});
  const empOverride = moneyOrNull(e.employee_contribution_override);
  const emrOverride = moneyOrNull(e.employer_contribution_override);
  // Some detail payloads pre-resolve the effective figure.
  const empResolved = moneyOrNull(e.employee_contribution);
  const emrResolved = moneyOrNull(e.employer_contribution);
  return {
    employee: empOverride ?? empResolved ?? moneyOrNull(p.employee_contribution_amount),
    employer: emrOverride ?? emrResolved ?? moneyOrNull(p.employer_contribution_amount),
    employeeOverridden: empOverride !== null || !!e.contribution_is_overridden,
    employerOverridden: emrOverride !== null || !!e.contribution_is_overridden,
  };
}

// ── Normalizers ──────────────────────────────────────────────────────────────

/**
 * #140 plan detail: `{ plan, active_enrollment_count, monthly_cost_total }` or a
 * flat plan object.
 * @returns {{ plan: object, activeCount: number, monthlyCost: (string|null) }}
 */
export function normalizePlanDetail(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const plan = d.plan && typeof d.plan === "object" ? d.plan : d;
  return {
    plan,
    activeCount: toCount(d.active_enrollment_count ?? plan.active_enrollment_count),
    monthlyCost: d.monthly_cost_total ?? plan.monthly_cost_total ?? null,
  };
}

/**
 * #153 team benefits, either variant.
 * @returns {{ aggregatesOnly: boolean, headcount: number, planMix: object[], rows: object[], count: number }}
 */
export function normalizeTeamBenefits(raw) {
  const d = raw && typeof raw === "object" ? (raw.data && typeof raw.data === "object" ? raw.data : raw) : {};
  const aggregatesOnly = d.aggregates_only === true;
  const rows = Array.isArray(d.rows) ? d.rows : Array.isArray(d.records) ? d.records : [];
  const planMix = Array.isArray(d.plan_mix) ? d.plan_mix : [];
  return {
    aggregatesOnly,
    headcount: toCount(d.headcount ?? d.employee_count),
    planMix,
    rows,
    count: toCount(d.count ?? rows.length),
  };
}

/**
 * #166 my benefits.
 * @returns {{ financialYear: string, fyDeducted: (string|null), count: number, enrollments: object[] }}
 */
export function normalizeMyBenefits(raw) {
  const d = raw && typeof raw === "object" ? (raw.data && typeof raw.data === "object" ? raw.data : raw) : {};
  const enrollments = Array.isArray(d.enrollments) ? d.enrollments : [];
  return {
    financialYear: d.financial_year || "",
    fyDeducted: d.fy_total_employee_deducted ?? null,
    count: toCount(d.enrollment_count ?? enrollments.length),
    enrollments,
  };
}

/** Why an enrollment has no actions left, for a detail footer. */
export function enrollmentLockedReason(enrollment) {
  if (enrollment?.status === "ended") return `Cover ended on ${enrollment?.enrolled_to || "its end date"}.`;
  if (enrollment?.status === "cancelled") return "This enrollment was cancelled.";
  return "There's nothing to do on this enrollment.";
}
