// ─────────────────────────────────────────────────────────────────────────────
// runMeta.js — Payroll run state machine and plain-language explanations for
// item errors and calculation warnings. Pure helpers (no JSX), shared by the
// run list and the run detail page.
//
// Source of truth: PAYROLL_BACKEND_RESPONSES.md (2026-09-14) — §2 run actions,
// §3.2 header, §3.4 preview, §3.5 item detail and day ledger, §3.6 item error
// codes and warnings, §3.7 eligibility. It overrides the phase 2–4 docs.
// ─────────────────────────────────────────────────────────────────────────────

import { formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";

/** "NO_SALARY_STRUCTURE" → "No salary structure". */
export function prettifyCode(code) {
  if (code === null || code === undefined || code === "") return "";
  const text = String(code).replace(/[_-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Run status ──────────────────────────────────────────────────────────────

export const RUN_STATUS_META = {
  draft: {
    label: "Draft",
    hint: "Not calculated yet. Calculate to work out everyone's pay.",
    pill: "bg-slate-50 text-slate-600 border-slate-200",
  },
  calculating: {
    label: "Calculating",
    hint: "Pay is being worked out. This page updates when it's done.",
    pill: "bg-purple-50 text-purple-600 border-purple-200",
  },
  calculated: {
    label: "Ready for review",
    hint: "Check the figures, fix any problems, then approve.",
    pill: "bg-purple-50 text-purple-700 border-purple-200",
  },
  failed: {
    label: "Calculation failed",
    hint: "Something stopped the calculation. Fix the cause and try again.",
    pill: "bg-rose-50 text-rose-700 border-rose-200",
  },
  approved: {
    label: "Approved",
    hint: "Payslips are published and attendance for the month is locked. Mark as paid once salaries are sent.",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
  },
  paid: {
    label: "Paid",
    hint: "Salaries are marked as sent. This run is final.",
    pill: "bg-purple-700 text-white border-purple-700",
  },
  cancelled: {
    label: "Cancelled",
    hint: "This run was cancelled. Its figures are kept for the record.",
    pill: "bg-slate-100 text-slate-500 border-slate-200",
  },
};

export function runStatusMeta(status) {
  return RUN_STATUS_META[status] || {
    label: prettifyCode(status) || "Unknown",
    hint: "",
    pill: "bg-slate-50 text-slate-600 border-slate-200",
  };
}

// `GET /runs?status=` takes exactly one value.
export const RUN_STATUS_FILTERS = [
  ["", "All runs"],
  ["draft", "Draft"],
  ["calculating", "Calculating"],
  ["calculated", "Ready for review"],
  ["failed", "Calculation failed"],
  ["approved", "Approved"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
];

// A crashed calculation can leave a run in `calculating`. The next calculate
// re-claims it after the backend's staleness window; 30 minutes is our cue to
// offer the retry.
const STALE_CLAIM_MS = 30 * 60 * 1000;

export function isStuckCalculating(run, now = Date.now()) {
  if (run?.status !== "calculating" || !run.calculation_started_at) return false;
  const started = new Date(run.calculation_started_at).getTime();
  return Number.isFinite(started) && now - started > STALE_CLAIM_MS;
}

/**
 * Which actions the backend will accept for this run right now.
 * draft → calculating → calculated → approved → paid; failed is recalculable;
 * cancel is approved-and-unpaid only; items change only in draft/calculated.
 */
export function runActions(run) {
  const status = run?.status;
  const errorCount = toCount(run?.error_count);
  const stale = !!run?.requires_recalculation;
  const stuck = isStuckCalculating(run);

  const approveBlockers = [];
  if (status === "calculated") {
    if (stale) approveBlockers.push("Something changed after the last calculation. Recalculate before approving.");
    if (errorCount > 0) {
      approveBlockers.push(`${plural(errorCount, "employee")} ${errorCount === 1 ? "has" : "have"} a calculation problem. Fix or exclude ${errorCount === 1 ? "them" : "each one"} first.`);
    }
  }

  return {
    status,
    errorCount,
    stale,
    stuck,
    isCalculating: status === "calculating" && !stuck,
    canCalculate: status === "draft" || status === "calculated" || status === "failed" || stuck,
    calculateLabel: status === "draft" ? "Calculate" : status === "failed" || stuck ? "Retry calculation" : "Recalculate",
    canApprove: status === "calculated" && approveBlockers.length === 0,
    approveBlockers,
    canPay: status === "approved" && !run?.paid_at,
    canCancel: status === "approved" && !run?.paid_at,
    canEditItems: status === "draft" || status === "calculated",
  };
}

/**
 * The single next step on a run card. `calculate` runs in place; every `open`
 * step goes to the run page, because approving and paying move money and need
 * the figures and blockers in view. `icon` is a key the card maps to an icon.
 */
export function runNextStep(run) {
  const acts = runActions(run);
  if (acts.isCalculating) return { key: "wait", label: "Calculating…", icon: "clock", attention: true };
  if (acts.canCalculate && (acts.status !== "calculated" || acts.stale)) {
    return { key: "calculate", label: acts.calculateLabel, icon: acts.status === "draft" ? "calculator" : "refresh", attention: true };
  }
  if (acts.status === "calculated" && acts.errorCount > 0) {
    return { key: "open", query: "status=error", label: `Fix ${plural(acts.errorCount, "problem")}`, icon: "error", attention: true };
  }
  if (acts.canApprove) return { key: "open", label: "Review & approve", icon: "approve", attention: true };
  if (acts.canPay) return { key: "open", label: "Review & mark paid", icon: "pay", attention: true };
  return { key: "open", label: "Open run", icon: "open", attention: false };
}

/** Why employees in a run can't be changed right now (payslip dialog footer). */
export function itemsLockedReason(run) {
  const status = run?.status;
  if (status === "calculating") return "Wait for the calculation to finish before changing employees.";
  if (status === "failed") return "Retry the calculation before changing employees.";
  if (status === "approved" && !run?.paid_at) return "This run is approved, so employees can't be changed. Cancel the run first if something is wrong.";
  if (status === "paid" || run?.paid_at) return "This run is paid, so nothing in it can be changed.";
  if (status === "cancelled") return "This run is cancelled, so nothing in it can be changed.";
  return "Employees in this run can't be changed right now.";
}

export const RUN_CONFIRM = {
  approve: (run) =>
    `Approve payroll for ${formatPeriod(run?.period_month)}? Attendance for the month will be locked, payslips will be published to employees, and the loan instalments and adjustments in this run will be used. You can still cancel it until it is marked as paid.`,
  pay: (run) =>
    `Mark ${formatPeriod(run?.period_month)} as paid? Only do this after salaries have left the bank. It can't be undone, and the run can no longer be cancelled.`,
};

export const RUN_ACTION_SUCCESS = {
  calculate: "Run calculated. Review the figures before approving.",
  approve: "Run approved. Payslips are now visible to employees.",
  pay: "Run marked as paid.",
  cancel: "Run cancelled. Loan instalments and adjustments it used are available again.",
};

export const RUN_ACTION_FAILURE = {
  calculate: "Couldn't calculate this run",
  approve: "Couldn't approve this run",
  pay: "Couldn't mark this run as paid",
  cancel: "Couldn't cancel this run",
};

/**
 * What cancelling does. The attendance lock is released only when this run
 * created it (`lock_reused === false`); a lock that already existed stays.
 */
export function cancelRunDescription(run) {
  const lock = run?.lock_reused === true
    ? "Attendance for the month stays locked, because that lock was already in place before this run."
    : "Attendance for the month is unlocked again.";
  return `Cancelling hides these payslips from employees and puts back the loan instalments (they go back to scheduled) and adjustments this run used. ${lock} The figures are kept for the audit trail.`;
}

/** Run's date window, derived from `period_month` when the header lacks it. */
export function periodBounds(run) {
  const pm = run?.period_month;
  let start = run?.period_start;
  let end = run?.period_end;
  if ((!start || !end) && /^\d{4}-\d{2}$/.test(pm || "")) {
    const [y, m] = pm.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    start = start || `${pm}-01`;
    end = end || `${pm}-${String(lastDay).padStart(2, "0")}`;
  }
  return { start: start ? String(start).slice(0, 10) : "", end: end ? String(end).slice(0, 10) : "" };
}

/**
 * The last working day payroll inferred for EXIT_DATE_REQUIRED, or "".
 * Takes a run item, an eligibility `exit_date_required[]` row, or the reason
 * text. Gap G-4 adds `error_context: { inferred_last_working_day: "YYYY-MM-DD" | null }`;
 * when that key is present it is final (null means "couldn't infer", never
 * parse the sentence then). Older rows only have the sentence
 * `Inferred last working day: <YYYY-MM-DD | unknown>.`
 */
export function inferredExitDate(source) {
  const item = source && typeof source === "object" ? source : null;
  const context = item?.error_context;
  if (context && typeof context === "object" && "inferred_last_working_day" in context) {
    const structured = context.inferred_last_working_day;
    return typeof structured === "string" && /^\d{4}-\d{2}-\d{2}$/.test(structured) ? structured : "";
  }
  const reason = item ? item.error_reason ?? item.reason : source;
  const match = /Inferred last working day: (\d{4}-\d{2}-\d{2})\b/.exec(String(reason || ""));
  return match ? match[1] : "";
}

// ── Item errors (payroll_run_items.error_code) ──────────────────────────────
// Any error thrown while working out one employee lands here, so the set is
// open-ended — `itemErrorMeta` always has a fallback.

const STRUCTURES_LINK = { to: "/dashboard/hr/payroll/employee-structures", label: "Open salary structures" };
const COMPONENTS_LINK = { to: "/dashboard/hr/payroll/components", label: "Open salary components" };
const SETTINGS_LINK = { to: "/dashboard/hr/payroll/settings", label: "Open payroll settings" };
const STATUTORY_LINK = { to: "/dashboard/hr/payroll/statutory", label: "Open statutory & tax" };

const EXCLUDE_HINT = "Or exclude them from this run.";

export const ITEM_ERRORS = {
  NO_SALARY_STRUCTURE: {
    title: "No salary structure",
    explain: "This employee has no approved salary structure for this month, so their pay can't be worked out.",
    fix: `Assign a salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  EXIT_DATE_REQUIRED: {
    title: "Last working day needed",
    explain: "This employee seems to have left during the month, but no exit date is recorded. Paying a full month could overpay them.",
    fix: `Set their last working day, then recalculate. ${EXCLUDE_HINT}`,
    setPeriod: true,
  },
  UNKNOWN_ATTENDANCE_STATUS: {
    title: "Unrecognised attendance entry",
    explain: "An attendance record in this month has a status payroll doesn't understand.",
    fix: `Correct the attendance record, then recalculate. ${EXCLUDE_HINT}`,
  },
  IN_PROGRESS_AT_PERIOD_END: {
    title: "Day still open at month end",
    explain: "An attendance day at the end of the month was still in progress (for example, checked in but not checked out), and your settings treat that as a problem.",
    fix: `Close or correct that attendance day, then recalculate. ${EXCLUDE_HINT}`,
    link: { to: "/dashboard/hr/attendance/regularizations", label: "Open regularizations" },
  },
  CTC_RECONCILIATION_FAILED: {
    title: "Salary parts don't add up",
    explain: "The components in this employee's salary structure don't add up to their total package.",
    fix: `Fix the salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  CTC_BELOW_FIXED_COMPONENTS: {
    title: "Package lower than fixed pay",
    explain: "The yearly package is lower than the fixed components in the structure.",
    fix: `Raise the package or lower the fixed amounts, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  NO_BASIC_COMPONENT: {
    title: "No basic pay in structure",
    explain: "Part of the salary is a percentage of basic pay, but the structure has no basic pay component.",
    fix: `Add basic pay to the salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  MULTIPLE_BASIC_COMPONENTS: {
    title: "More than one basic pay component",
    explain: "More than one salary component is marked as basic pay, so payroll can't tell which to use.",
    fix: "Mark only one component as basic pay, then recalculate.",
    link: COMPONENTS_LINK,
  },
  MULTIPLE_BALANCING_COMPONENTS: {
    title: "More than one balancing component",
    explain: "The structure has more than one component that absorbs the remaining package.",
    fix: `Keep one balancing component in the template, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  NO_EARNING_COMPONENTS: {
    title: "No earnings in structure",
    explain: "The salary structure has no earning lines.",
    fix: `Fix the salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  INVALID_STRUCTURE: {
    title: "Salary structure is broken",
    explain: "The salary structure is set up incorrectly.",
    fix: `Fix the salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  INVALID_COMPONENT_AMOUNT: {
    title: "A salary line has no valid amount",
    explain: "One component in the salary structure didn't work out to a money amount.",
    fix: `Fix the salary structure, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  INVALID_PERCENTAGE: {
    title: "Percentage out of range",
    explain: "A percentage component in the salary structure has a value that isn't allowed.",
    fix: `Fix the component value, then recalculate. ${EXCLUDE_HINT}`,
    link: STRUCTURES_LINK,
  },
  NEGATIVE_NET_PAY: {
    title: "Deductions are more than pay",
    explain: "This month's deductions are higher than earnings, and your payroll settings don't allow pay to go below zero.",
    fix: `Move or reduce a deduction, change the negative pay setting, then recalculate. ${EXCLUDE_HINT}`,
    link: SETTINGS_LINK,
  },
  INVALID_LOP_DIVISOR: {
    title: "No working days to divide pay by",
    explain: "The unpaid-leave setting gave zero working days for this employee, usually because their calendar has no working days in the month.",
    fix: `Check the shift, week-off and holiday setup for their location, then recalculate. ${EXCLUDE_HINT}`,
    link: SETTINGS_LINK,
  },
  OVERTIME_BASIS_UNRESOLVED: {
    title: "Overtime can't be priced",
    explain: "Overtime is paid on basic pay, but no salary component is marked as basic pay.",
    fix: "Mark one component as basic pay, or change how overtime is paid, then recalculate.",
    link: SETTINGS_LINK,
  },
  TAX_TABLES_MISSING: {
    title: "Income tax slabs missing",
    explain: "Income tax is switched on, but there are no tax slabs for this financial year.",
    fix: "Set up the tax slabs, then recalculate.",
    link: STATUTORY_LINK,
  },
  INVALID_STATUTORY_CONFIG: {
    title: "Statutory settings don't fit together",
    explain: "The PF, ESI, professional tax or income tax settings used for this run contradict each other.",
    fix: "Review the statutory settings, then recalculate. If they look right, contact support.",
    link: STATUTORY_LINK,
  },
  INVALID_TDS_MONTHS: {
    title: "Income tax months are invalid",
    explain: "The months left in the financial year couldn't be worked out for the income tax calculation.",
    fix: "Check the financial year settings, then recalculate.",
    link: SETTINGS_LINK,
  },
  INVALID_TDS_ROUNDING: {
    title: "Income tax rounding is invalid",
    explain: "The monthly income tax rounding setting isn't one payroll understands.",
    fix: "Check the income tax rounding setting, then recalculate.",
    link: SETTINGS_LINK,
  },
  ITEM_PERSIST_FAILED: {
    title: "Figures couldn't be saved",
    explain: "This employee's pay was worked out, but saving it failed.",
    fix: "Recalculate the run. If it happens again, contact support.",
  },
  CALCULATION_FAILED: {
    title: "Calculation failed",
    explain: "Something unexpected stopped this employee's pay from being worked out.",
    fix: `Recalculate once. If it happens again, share the details below with support. ${EXCLUDE_HINT}`,
  },
};

const BAD_MONEY = {
  title: "Invalid money amount",
  explain: "One of this employee's amounts (salary, adjustment or loan) isn't a valid, positive, in-range figure.",
  fix: `Correct the amount at its source, then recalculate. ${EXCLUDE_HINT}`,
};
["INVALID_MONEY", "MONEY_OVERFLOW", "NEGATIVE_MONEY"].forEach((code) => { ITEM_ERRORS[code] = BAD_MONEY; });

const INTERNAL_CHECK = {
  title: "Safety check failed",
  explain: "A safety check in the pay calculation didn't pass for this employee, so no figure was saved.",
  fix: `Recalculate once. If it happens again, share the details below with support. ${EXCLUDE_HINT}`,
};
[
  "PF_SPLIT_RECONCILIATION_FAILED", "SCHEDULE_RECONCILIATION_FAILED", "INVALID_STATUTORY_AMOUNT",
  "INVALID_STATUTORY_CONTEXT", "STATUTORY_FIGURES_MISMATCH", "LEDGER_BUILD_FAILED",
].forEach((code) => { ITEM_ERRORS[code] = INTERNAL_CHECK; });

export function itemErrorMeta(code) {
  return ITEM_ERRORS[code] || {
    title: prettifyCode(code) || "Calculation problem",
    explain: "Payroll couldn't work out this employee's pay.",
    fix: `Read the details from payroll below, fix the cause and recalculate. ${EXCLUDE_HINT}`,
  };
}

// ── Calculation warnings (payroll_run_items.calculation_warnings) ───────────
// A flat array of strings, or null. Two carry a `:param`. Warnings never block
// approval, but HR should see them before approving.

export const WARNING_META = {
  LOAN_EMI_SKIPPED: {
    title: "Loan instalment skipped",
    explain: () => "Pay wasn't enough to cover a loan instalment this month, so none of it was taken. It stays scheduled and moves to next month.",
  },
  NEGATIVE_NET_CLAMPED: {
    title: "Pay set to ₹0",
    explain: () => "Deductions were higher than earnings. Net pay was set to ₹0 and the shortfall will be recovered from next month's pay.",
  },
  STATUTORY_EXCEEDS_NET: {
    title: "Statutory deductions exceed pay",
    explain: () => "PF, ESI, professional tax and income tax on their own were more than this month's pay.",
    serious: true,
  },
  PT_STATE_UNRESOLVED: {
    title: "No professional tax taken",
    explain: () => "The employee's state couldn't be found from their work location or profile, so ₹0 professional tax was deducted. Add the state and recalculate.",
    serious: true,
  },
  PT_SLAB_UNRESOLVED: {
    title: "No professional tax taken",
    explain: () => "No professional tax band matched this employee's pay in their state, so ₹0 was deducted. Check the professional tax bands and recalculate.",
    serious: true,
  },
  PAN_MISSING_206AA_APPLIED: {
    title: "No PAN on file",
    explain: () => "Income tax was deducted at the higher no-PAN rate (section 206AA) because the employee has no PAN recorded.",
  },
  "206AA_OVERRODE_TRUE_UP": {
    title: "Higher tax kept in the last month",
    explain: () => "The no-PAN rate still applied in the year's last month, so total tax is higher than the calculated amount.",
  },
  TDS_OVERDEDUCTED_REFUND_AT_ITR: {
    title: "No income tax this month",
    explain: () => "More tax was already deducted this year than needed. Payroll doesn't refund it; the employee can claim it back when filing their tax return.",
  },
  STATUTORY_STRUCTURE_LINE_IGNORED: {
    title: "Statutory line ignored",
    explain: (ref) => `The salary structure has a statutory line${ref ? ` (${ref})` : ""}. It was ignored so PF, ESI or tax isn't taken twice. Remove it from the structure.`,
  },
  DUPLICATE_BENEFIT_ENROLLMENT: {
    title: "Enrolled twice in a benefit",
    explain: (ref) => `The employee has more than one active enrollment in the same benefit plan${ref ? ` (${ref})` : ""}. Only one was charged. Fix the enrollments.`,
  },
};

/** `["LOAN_EMI_SKIPPED:<loanId>", …]` → `[{ code, ref, title, explain, serious }]`. */
export function parseWarnings(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((entry) => {
      const [code, ...rest] = String(typeof entry === "string" ? entry : "").split(":");
      const ref = rest.join(":");
      // Never show a bare UUID (e.g. the loan id) as text.
      const readableRef = ref && !UUID_RE.test(ref) ? ref : "";
      const meta = WARNING_META[code];
      return {
        code,
        ref,
        title: meta?.title || prettifyCode(code) || "Heads-up",
        explain: meta ? meta.explain(readableRef) : "",
        serious: !!meta?.serious,
      };
    })
    .filter((w) => w.code);
}

// ── Payslip lines ───────────────────────────────────────────────────────────

// `lop` and `arrear` are never emitted: unpaid leave lowers `amount` below
// `full_month_amount` on the salary line instead.
export const COMPONENT_SOURCE_LABEL = {
  structure: "Salary",
  overtime: "Overtime",
  adjustment: "Adjustment",
  loan: "Loan",
  statutory: "Statutory",
  benefit: "Benefit",
  reimbursement: "Reimbursement",
  rounding: "Rounding",
};

export const ENGINE_COMPONENT_LABEL = {
  NET_PAY_SHORTFALL_CARRIED: "Shortfall carried to next month",
  CARRY_FORWARD_RECOVERY: "Last month's shortfall recovered",
  ROUNDING_ADJUSTMENT: "Rounding",
};

// Day ledger classes (day_ledger.per_date[].c). `p` / `l` are the paid and
// unpaid fractions of the day.
export const LEDGER_META = {
  present: { label: "Present", cls: "bg-purple-100 text-purple-700" },
  worked_non_working: { label: "Worked a day off", cls: "bg-violet-200 text-violet-800" },
  half_day: { label: "Half day", cls: "bg-fuchsia-100 text-fuchsia-800" },
  paid_leave: { label: "Paid leave", cls: "bg-indigo-100 text-indigo-700" },
  paid_non_working: { label: "Holiday or week-off", cls: "bg-slate-100 text-slate-500" },
  lop_leave: { label: "Leave, balance ran out", cls: "bg-fuchsia-100 text-fuchsia-700" },
  unpaid_leave: { label: "Unpaid leave", cls: "bg-rose-100 text-rose-700" },
  absent: { label: "Absent", cls: "bg-rose-200 text-rose-800" },
  no_record: { label: "No attendance marked", cls: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-300" },
  orphan_leave: { label: "On leave, no approved leave found", cls: "bg-fuchsia-50 text-fuchsia-800 ring-1 ring-inset ring-fuchsia-300" },
};

// `r` is free text: a calendar reason, a classification or a leave-allocation
// note. Known values get words; anything else is prettified.
const LEDGER_REASON = {
  working_day: "Working day",
  holiday: "Holiday",
  weekly_off: "Week-off",
  exception_working: "Made a working day",
  exception_non_working: "Made a day off",
  in_progress_present: "Day left open, counted as present",
  in_progress_absent: "Day left open, counted as absent",
  lop_alloc_overshoot: "Leave balance ran out",
  lop_alloc_undershoot: "Leave balance ran out",
};

export const ledgerReasonText = (r) => LEDGER_REASON[r] || LEDGER_META[r]?.label || prettifyCode(r);

/** Days charged as unpaid because of missing data, worth flagging to HR. */
export function ledgerDataIssues(perDate) {
  const days = Array.isArray(perDate) ? perDate : [];
  return {
    noRecord: days.filter((d) => d?.c === "no_record").length,
    orphanLeave: days.filter((d) => d?.c === "orphan_leave").length,
  };
}

export const STATUTORY_NOTE = {
  not_applied: "PF, ESI, professional tax and income tax were not deducted in this figure, so net pay is not the final take-home amount.",
  disabled: "All statutory deductions (PF, ESI, professional tax, income tax) are switched off for this organisation.",
};

// ── Preview blocks (GET /runs/:id/preview) ──────────────────────────────────

/** `preview.warnings` is an object of counts. */
export const PREVIEW_WARNING_LABEL = {
  error_items: "Need attention",
  excluded_items: "Excluded",
  missing_structure: "No salary structure",
  exit_date_required: "Need a last working day",
};

export const VARIABLE_PAY_FIELDS = [
  ["adjustment_earnings_total", "Additions & bonuses", "money"],
  ["adjustment_deductions_total", "Adjustment deductions", "money"],
  ["loan_recovery_total", "Loan recovery", "money"],
  ["carry_forward_recovered_total", "Shortfall recovered", "money"],
  ["carry_forward_generated_total", "Shortfall carried forward", "money"],
  ["skipped_emi_count", "Loan instalments skipped", "count"],
  ["clamped_item_count", "Pay set to ₹0", "count"],
];

export const STATUTORY_FIELDS = [
  ["pf_employee_total", "PF (employee)", "money"],
  ["pf_employer_total", "PF (employer)", "money"],
  ["eps_total", "Pension (EPS)", "money"],
  ["esi_employee_total", "ESI (employee)", "money"],
  ["esi_employer_total", "ESI (employer)", "money"],
  ["pt_total", "Professional tax", "money"],
  ["tds_total", "Income tax (TDS)", "money"],
  ["esi_covered_count", "Covered by ESI", "count"],
  ["pan_missing_count", "No PAN on file", "count"],
  ["pt_unresolved_count", "No professional tax taken", "count", "bad"],
  ["statutory_shortfall_count", "Statutory more than pay", "count", "bad"],
];

// `reimbursement_total` is the whole payout; only the taxable part sits inside gross.
export const PAYOUT_FIELDS = [
  ["reimbursement_total", "Reimbursements paid", "money"],
  ["taxable_reimbursement_total", "Of which taxable", "money"],
  ["reimbursement_item_count", "Reimbursement lines", "count"],
  ["benefit_employee_total", "Benefits (employee share)", "money"],
  ["benefit_employer_total", "Benefits (company share)", "money"],
];

// ── Start-run readiness (GET /runs/eligibility) ─────────────────────────────

/** Creating the run fails with TAX_TABLES_MISSING in exactly this case. */
export const taxTablesMissing = (st) => !!st && !!st.income_tax_enabled && st.tax_tables_present === false;

/** What an existing run for the month means for starting another. */
export function alreadyRunText(alreadyRun) {
  const status = alreadyRun && typeof alreadyRun === "object" ? alreadyRun.status : "";
  const label = status ? runStatusMeta(status).label.toLowerCase() : "";
  return label ? `A payroll run for this month already exists (${label}).` : "A payroll run for this month already exists.";
}

/**
 * Readiness notes from eligibility.statutory. Counts are zero when their head
 * is switched off, so each note only appears for a head that is on.
 */
export function statutoryReadinessNotes(st) {
  if (!st || typeof st !== "object") return [];
  const notes = [];
  const tax = !!st.income_tax_enabled;
  const count = (key) => toCount(st[key]);
  if (taxTablesMissing(st)) {
    notes.push({ tone: "bad", text: "Income tax is on but this financial year has no tax slabs, so the run can't be created. Set them up under Statutory & Tax." });
  }
  if (tax && count("missing_pan_count") > 0) {
    notes.push({ tone: "warn", text: `${plural(count("missing_pan_count"), "employee")} with no PAN will have tax deducted at the higher no-PAN rate.` });
  }
  if (st.pt_enabled && count("pt_unresolved_count") > 0) {
    notes.push({ tone: "bad", text: `${plural(count("pt_unresolved_count"), "employee")} won't have professional tax deducted, because their state or tax band can't be found.` });
  }
  if (tax && count("unsubmitted_declaration_count") > 0) {
    notes.push({ tone: "warn", text: `${plural(count("unsubmitted_declaration_count"), "employee")} haven't submitted a tax declaration for this year.` });
  }
  if (tax && count("unverified_declaration_count") > 0) {
    notes.push({
      tone: st.proof_deadline_passed ? "bad" : "warn",
      text: st.proof_deadline_passed
        ? `${plural(count("unverified_declaration_count"), "tax declaration")} still unverified after the proof deadline. Their tax savings won't count, so tax will jump this month.`
        : `${plural(count("unverified_declaration_count"), "tax declaration")} still waiting for verification.`,
    });
  }
  if (tax && count("previous_employer_unrecorded_count") > 0) {
    notes.push({ tone: "warn", text: `${plural(count("previous_employer_unrecorded_count"), "new joiner")} with no previous-employer income recorded may have too little tax deducted.` });
  }
  return notes;
}

/** Readiness notes from eligibility.payouts (reimbursements and benefits). */
export function payoutReadinessNotes(p) {
  if (!p || typeof p !== "object") return [];
  const notes = [];
  if (toCount(p.approved_claims_count) > 0) {
    notes.push({ tone: "info", text: `${plural(toCount(p.approved_claims_count), "approved reimbursement claim")} (${formatMoney(p.approved_claims_total)}) will be paid in this run.` });
  }
  if (toCount(p.claims_awaiting_approval_count) > 0) {
    notes.push({ tone: "warn", text: `${plural(toCount(p.claims_awaiting_approval_count), "reimbursement claim")} across all months ${toCount(p.claims_awaiting_approval_count) === 1 ? "is" : "are"} still waiting for approval, so ${toCount(p.claims_awaiting_approval_count) === 1 ? "it isn't" : "they aren't"} included.` });
  }
  if (toCount(p.active_enrollment_count) > 0) {
    const shares = `${formatMoney(p.benefit_employee_total)} from employees and ${formatMoney(p.benefit_employer_total)} from the company`;
    notes.push(p.benefit_deductions_enabled
      ? { tone: "info", text: `Benefits for ${plural(toCount(p.active_enrollment_count), "enrollment")} will be charged: ${shares}.` }
      : { tone: "warn", text: `Benefit deductions are switched off. If you turn them on, ${plural(toCount(p.active_enrollment_count), "enrollment")} would be charged: ${shares}.` });
  }
  return notes;
}
