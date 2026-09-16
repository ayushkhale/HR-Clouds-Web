// ─────────────────────────────────────────────────────────────────────────────
// payrollErrors.js
// Maps the backend's typed `errorCode` values (thrown by client.js as
// `err.data.errorCode`) to actionable, human-readable messages.
//
// Error contract (PAYROLL_BACKEND_RESPONSES.md §1): `{ success: false, message,
// errorCode, details? }`. `message` is always safe to show. A VALIDATION_ERROR's
// `message` is the first Joi problem; gap G-1 (PAYROLL_BACKEND_GAPS_RESPONSE.md)
// adds `details: [{ path, message }]` with all of them. `details.errors` (an
// object, not an array) exists only on CSV_PARSE_FAILED and
// BULK_VALIDATION_FAILED, so always branch on `errorCode`. Codes not listed here
// fall back to the server's own `message`, then to a generic line.
// ─────────────────────────────────────────────────────────────────────────────

const PAYROLL_ERROR_MESSAGES = {
  // Feature gating
  FEATURE_NOT_AVAILABLE: "Payroll isn't enabled for this organisation. Contact your administrator to turn it on.",
  MISSING_ORG_CONTEXT: "Payroll is only available inside an organisation. Switch to an organisation account to continue.",

  // Maker–checker (salary structures, adjustments, bonus rules)
  SEPARATE_CHECKER_REQUIRED: "This organisation requires a different HR user to approve — the person who proposed a change can't approve their own. Ask another HR user to review it.",
  PROPOSAL_SCOPE_STALE: "The person who proposed this no longer manages this employee, so it can't be approved. Ask them to re-submit, or create the change directly.",
  PROPOSAL_NOT_PENDING: "This proposal has already been actioned — it may have been approved, rejected, or superseded by a newer revision. Refresh to see its current state.",
  INSUFFICIENT_CHECKERS: "You need at least two active HR users before separate-checker approval can be turned on, otherwise payroll changes could deadlock.",

  // Salary structure assignment / evaluation
  INVALID_STRUCTURE_INPUT: "Choose either a template or explicit components — not both, and not neither.",
  REVISION_REASON_REQUIRED: "A reason is required when revising an existing salary structure.",
  EFFECTIVE_BEFORE_JOINING: "The effective date can't be earlier than the employee's joining date.",
  RETRO_REVISION_NOT_SUPPORTED: "A revision must take effect after the current version's start date. Back-dated revisions aren't supported.",
  NO_BASIC_COMPONENT: "This structure has a percent-of-basic component but no Basic component to calculate it from.",
  CTC_BELOW_FIXED_COMPONENTS: "The CTC is lower than the fixed components already defined — the balancing component would go negative. Raise the CTC or lower the fixed amounts.",
  CTC_RECONCILIATION_FAILED: "The component amounts don't add up to the CTC, and there's no balancing component to absorb the difference.",
  MULTIPLE_BALANCING_COMPONENTS: "Only one balancing component is allowed per structure.",
  INVALID_PERCENTAGE: "A percentage value must be between 0 and 100.",
  NO_EARNING_COMPONENTS: "A salary structure needs at least one earning component.",
  STATUTORY_COMPONENT_NOT_ASSIGNABLE: "PF, ESI, professional tax and income tax are worked out automatically and can't be added to a salary structure, template, benefit plan or reimbursement category.",

  // Component catalog
  COMPONENT_CODE_EXISTS: "A component with this code already exists. Choose a different code.",
  COMPONENT_IN_USE: "This component is used by an active template or an approved salary structure, so it can't be deactivated. Remove those references first.",
  SYSTEM_COMPONENT_IMMUTABLE: "This is a system component — its code, type, and calculation can't be changed. You can still adjust its tax and PF/ESI treatment.",
  COMPONENT_NOT_FOUND_OR_INACTIVE: "That salary component no longer exists or has been switched off. Choose another one.",

  // Template
  TEMPLATE_CODE_EXISTS: "A template with this code already exists. Choose a different code.",
  TEMPLATE_COMPONENT_EXISTS: "That component is already on this template.",

  // Payroll run — lifecycle
  DUPLICATE_RUN: "A payroll run already exists for this month. Open the existing run instead of creating a new one.",
  RUN_NOT_FOUND: "This payroll run no longer exists. Go back to the list and refresh.",
  RUN_NOT_CALCULABLE: "A cancelled run can't be calculated. Start a new run for the month instead.",
  RUN_IMMUTABLE: "This run is approved or paid, so it can't be recalculated or changed. Cancel it first if it hasn't been paid.",
  RUN_CALCULATION_IN_PROGRESS: "A calculation is running for this month right now. Try again in a moment.",
  RUN_NOT_APPROVABLE: "Only a run that is ready for review can be approved. Refresh to see its current state.",
  RUN_STALE: "The figures are out of date — something changed since the last calculation. Recalculate the run before approving.",
  RUN_HAS_ERRORS: "This run can't be approved while some employees have calculation problems. Fix or exclude each one first.",
  RUN_TOTALS_DRIFTED: "The run totals no longer match the employee figures. Recalculate the run, then approve again.",
  PERIOD_PARTIALLY_LOCKED: "Part of this month is already locked by another attendance lock, so approving would leave some days editable. Remove or extend that lock first.",
  PERIOD_LOCKED: "Attendance for this period is locked by an approved payroll run.",
  LOAN_INSTALLMENT_ALREADY_DEDUCTED: "A loan instalment in this run was already taken by another run. Recalculate this run, then approve again.",
  ADJUSTMENT_ALREADY_APPLIED: "An adjustment involved here was already used by an approved payroll run. Refresh, and recalculate the run if you're approving one.",
  REIMBURSEMENT_ALREADY_APPLIED: "A reimbursement in this run was already paid by another run. Recalculate this run, then approve again.",
  RUN_NOT_CANCELLABLE: "Only an approved run that hasn't been paid can be cancelled. A draft or ready-for-review run can simply be recalculated.",
  RUN_NOT_PAYABLE: "Only an approved run can be marked as paid. It may already be paid — refresh to check.",
  CALCULATION_FAILED: "The calculation failed. Read the reason on the run, fix the cause and try again. If it keeps failing, contact support.",
  ITEM_PERSIST_FAILED: "The figures were worked out but couldn't be saved. Recalculate the run.",

  // Payroll run — employees in a run
  RUN_ITEM_NOT_FOUND: "This employee is no longer part of the run. Refresh the page.",
  ITEM_NOT_EXCLUDED: "This employee isn't excluded, so there's nothing to include again. Refresh the page.",
  INVALID_PERIOD_OVERRIDE: "The pay period must be inside this run's month, with the first day on or before the last.",
  NEGATIVE_NET_PAY: "Some employees' deductions are higher than their pay and your settings block negative pay. Fix or exclude them first.",

  // Variable pay — adjustments, bulk uploads, bonus rules
  EMPLOYEE_NOT_FOUND: "That employee couldn't be found in this organisation. They may have been removed.",
  ADJUSTMENT_NOT_FOUND: "This adjustment no longer exists. Refresh the list.",
  INVALID_ADJUSTMENT_AMOUNT: "The amount must be more than zero. Choose addition or deduction to set the direction.",
  PERIOD_CLOSED_FOR_ADJUSTMENT: "Payroll for that month is already approved or paid. Choose a later month, or cancel that run first if it hasn't been paid.",
  CSV_PARSE_FAILED: "The file isn't valid CSV. Fix the lines listed, save it again as CSV and retry.",
  CSV_MISSING_IDENTITY_COLUMN: "The file needs an employee_code or user_id column so each row can be matched to an employee.",
  CSV_EMPTY: "The file has no data rows.",
  BULK_ROW_LIMIT_EXCEEDED: "A bulk upload can have at most 5,000 rows. Split the file and upload it in parts.",
  BULK_VALIDATION_FAILED: "Some rows have problems, so nothing was saved. Fix the rows listed and check the file again.",
  BATCH_NOT_FOUND: "This upload couldn't be found. Refresh the list.",
  BONUS_RULE_NOT_FOUND: "This bonus rule no longer exists. Refresh the list.",
  BONUS_TARGETS_REQUIRED: "Choose at least one department or employee for this rule.",
  RULE_NOT_EDITABLE: "This bonus rule can no longer be edited. Cancel it and create a new rule instead.",
  RULE_NOT_PREVIEWABLE: "A rejected or cancelled bonus rule can't be previewed.",
  RULE_NOT_APPLICABLE: "Only an approved bonus rule can be applied.",
  RULE_ALREADY_APPLIED: "This bonus rule has already been applied. It can only be applied once.",
  RULE_NO_ELIGIBLE_EMPLOYEES: "Nobody qualifies for this rule, so there's nothing to apply. Preview the cost to see who is left out and why.",
  RULE_NOT_CANCELLABLE: "This bonus rule can't be cancelled any more. Refresh to see where it stands.",
  ELIGIBILITY_SOURCE_UNAVAILABLE: "Choosing employees by performance rating isn't available yet. Pick everyone, departments or specific employees.",
  ELIGIBILITY_SOURCE_NOT_PERMITTED: "This way of choosing eligible employees isn't allowed here.",
  RESERVED_COMPONENT_CODE: "That component code is reserved for payroll's own calculations. Choose a different code.",
  NEGATIVE_MONEY: "Amounts must be more than zero. Choose addition or deduction to set the direction.",

  // Statutory & tax
  TAX_TABLES_MISSING: "Income tax is switched on but there are no tax slabs for this financial year. Set them up under Statutory & Tax first.",
  PT_SLAB_RANGE_INVALID: "The professional-tax bands have a gap or overlap. Each band must start exactly where the previous one ended, with one open-ended top band.",
  TAX_SLAB_RANGE_INVALID: "The tax slabs have a gap or overlap within an age band. Each slab must start exactly where the previous one ended.",
  FINANCIAL_YEAR_FINALIZED: "This financial year is finalised and locked. Tax details can no longer be changed for it.",
  FINANCIAL_YEAR_INCOMPLETE: "Some months in this financial year don't have a closed payroll run. Acknowledge the missing months with a reason to proceed anyway.",

  // Phase 5 — Reimbursement categories & claims
  CATEGORY_CODE_EXISTS: "A category with this code already exists. Choose a different code.",
  CATEGORY_NOT_FOUND: "This category no longer exists. Refresh the list.",
  CATEGORY_IN_USE: "Some claims using this category are still open, so it can't be switched off yet. Try again once they are paid, rejected or withdrawn.",
  CATEGORY_NOT_FOUND_OR_INACTIVE: "One of the categories was switched off or removed. Choose another category for that item.",
  COMPONENT_NOT_FOUND: "That salary component no longer exists. Choose another one or leave it empty.",
  CLAIM_NOT_FOUND: "This claim no longer exists. Refresh the list.",
  INVALID_CLAIM_AMOUNT: "Each amount must be more than zero.",
  CLAIM_NOT_DRAFT: "This claim was already submitted, so it can't be changed. Refresh to see where it stands.",
  CLAIM_HAS_NO_ITEMS: "Add at least one expense before submitting.",
  RECEIPT_REQUIRED: "A receipt is needed for one of the items before you can submit.",
  CATEGORY_LIMIT_EXCEEDED: "This goes over a spending limit for the category. Lower the amount and try again.",
  CLAIM_NOT_ACTIONABLE: "This claim has already been decided or withdrawn. Refresh to see its current state.",
  NOT_YOUR_APPROVAL_LEVEL: "This claim is waiting for a different approver right now.",
  SELF_APPROVAL_FORBIDDEN: "You can't approve or reject your own claim. Another approver has to. If you're the only HR user, invite a second HR user.",
  APPROVED_EXCEEDS_CLAIMED: "An approved amount can't be more than what was claimed.",
  CLAIM_NOT_CANCELLABLE: "This claim can't be withdrawn any more. It may already be approved. Contact HR.",
  NO_OPEN_PAYOUT_PERIOD: "No open payroll month was found in the look-ahead window, so this claim can't be scheduled yet.",
  REJECTION_REASON_REQUIRED: "Write a reason for rejecting it.",

  // Phase 5 — Benefit plans & enrollments
  PLAN_CODE_EXISTS: "A benefit plan with this code already exists. Choose a different code.",
  PLAN_NOT_FOUND: "This benefit plan no longer exists. Refresh the list.",
  PLAN_NOT_ENROLLABLE: "This plan is switched off or isn't valid on that date.",
  PLAN_HAS_ACTIVE_ENROLLMENTS: "People are still enrolled in this plan. End their cover before switching it off.",
  ALREADY_ENROLLED: "This person already has active cover in this plan.",
  ENROLLMENT_PERIOD_OVERLAP: "This person already has cover in this plan for that month. Start from a later month.",
  ENROLLMENT_NOT_FOUND: "This enrollment no longer exists. Refresh the list.",
  ENROLLMENT_NOT_ACTIVE: "This cover has already ended.",
  INVALID_ENROLLMENT_DATES: "The end date can't be before the start date.",

  // Phase 5 — Attachments & documents
  ATTACHMENT_NOT_FOUND: "This file isn't available any more.",
  ATTACHMENT_TYPE_NOT_ALLOWED: "Use a PDF, JPG, PNG or WebP file.",
  ATTACHMENT_VERIFICATION_FAILED: "The upload didn't finish. Choose the file and upload it again.",
  ATTACHMENT_STORAGE_UNAVAILABLE: "File storage isn't reachable right now. Nothing else was changed. Try again shortly.",
  ATTACHMENT_NOT_DELETABLE: "This file can't be removed any more.",
  DECLARATION_NOT_OPEN_FOR_PROOF: "Proofs can't be added once the declaration is verified, rejected or closed.",
  INVALID_FINANCIAL_YEAR: "Choose a valid financial year.",
  INVALID_ATTACHMENT_REFERENCE_URL: "Paste a full link that starts with https://.",

  // Generic
  VALIDATION_ERROR: "Some details are missing or invalid. Check the form and try again.",
  FORBIDDEN: "You don't have permission to do this.",

  // Bank
  BANK_ACCOUNT_NOT_FOUND: "No bank account is on file for this employee yet.",
  INVALID_IFSC: "That IFSC code isn't valid. It should look like HDFC0001234.",
  INVALID_ACCOUNT_NUMBER: "The account number must be 6 to 20 digits.",
};

// The three INVALID_PERIOD_OVERRIDE messages share one code; the text says which date is wrong.
const PERIOD_OVERRIDE_MESSAGES = [
  [/period_start must fall within/i, "The first paid day must be inside this run's month."],
  [/period_end must fall within/i, "The last paid day must be inside this run's month."],
  [/period_start cannot be after period_end/i, "The first paid day can't be after the last paid day."],
];

/**
 * Resolve a friendly, actionable message from a rejected payroll request.
 * @param {unknown} err - the error thrown by `request()` (carries `.data.errorCode` and `.message`).
 * @param {string} [fallback] - message when neither a mapped code nor a server message is present.
 * @returns {string}
 */
export function payrollErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = err?.data?.errorCode;
  const serverMessage = String(err?.data?.message || err?.message || "");

  // The one Joi message names the field; it is more useful than a generic line.
  if (code === "VALIDATION_ERROR") {
    // Gap G-1: `details: [{ path, message }]` lists every invalid field.
    const every = [...new Set(validationProblems(err).map((p) => p.message))];
    if (every.length > 0) return every.join(" ");
    return humanizeValidation(serverMessage) || PAYROLL_ERROR_MESSAGES.VALIDATION_ERROR;
  }
  if (code === "INVALID_PERIOD_OVERRIDE") {
    const hit = PERIOD_OVERRIDE_MESSAGES.find(([re]) => re.test(serverMessage));
    return hit ? hit[1] : PAYROLL_ERROR_MESSAGES.INVALID_PERIOD_OVERRIDE;
  }
  // The server message lists the conflicting lock ranges.
  if (code === "PERIOD_PARTIALLY_LOCKED" && serverMessage) return `${PAYROLL_ERROR_MESSAGES.PERIOD_PARTIALLY_LOCKED} Details: ${serverMessage}`;
  // The server message names the months payroll tried and couldn't schedule into.
  if (code === "NO_OPEN_PAYOUT_PERIOD" && serverMessage) return `${PAYROLL_ERROR_MESSAGES.NO_OPEN_PAYOUT_PERIOD} ${serverMessage}`;
  if (code && Object.prototype.hasOwnProperty.call(PAYROLL_ERROR_MESSAGES, code)) return PAYROLL_ERROR_MESSAGES[code];

  // fetch() rejects with a TypeError (no HTTP status) when the server is unreachable.
  if (err && err.status === undefined && err.name === "TypeError") {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (serverMessage && /"[a-z0-9_.]+"/i.test(serverMessage)) return humanizeValidation(serverMessage);
  return serverMessage || fallback;
}

/** The typed backend error code, or "" when there is none. */
export const payrollErrorCode = (err) => err?.data?.errorCode || "";

/**
 * Line-level problems for the two bulk codes that carry them:
 * CSV_PARSE_FAILED → `[{ line, message }]`, BULK_VALIDATION_FAILED → `[{ line, error_code }]`.
 * Every other error returns [].
 */
export function bulkErrorLines(err) {
  const code = payrollErrorCode(err);
  if (code !== "CSV_PARSE_FAILED" && code !== "BULK_VALIDATION_FAILED") return [];
  const list = err?.data?.details?.errors;
  return Array.isArray(list) ? list.filter((e) => e && typeof e === "object") : [];
}

const JOI_WORDING = [
  // Only quoted keys are de-underscored; the bracketed list keeps its underscores.
  [/^value must contain at least one of \[period[ _]start, period[ _]end\]\.?$/i, "Choose a first or last paid day"],
  // Gap G-5: percentage bonuses are capped at 100 server-side (`"value"` is the rule's value).
  [/^value must be less than or equal to 100$/i, "A percentage can't be more than 100%"],
  [/length must be less than or equal to (\d+) characters long/i, "must be $1 characters or fewer"],
  [/length must be at least (\d+) characters long/i, "must be at least $1 characters"],
  [/is not allowed to be empty/i, "can't be empty"],
  [/must be less than or equal to (\d+)/i, "must be $1 or less"],
  [/must be greater than or equal to (\d+)/i, "must be $1 or more"],
  [/must be a positive number/i, "must be more than 0"],
];

// Joi-style: `"cancellation_reason" is not allowed to be empty` → `Cancellation reason can't be empty.`
// Custom messages name fields unquoted (`component_code is reserved…`), so bare
// snake_case words are spelled out too.
function humanizeValidation(message) {
  let text = String(message || "")
    .replace(/"([a-z0-9_.[\]]+)"/gi, (_, key) => key.split(".").pop().replace(/\[\d+\]/g, "").replace(/_/g, " "))
    .replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g, (token) => token.replace(/_/g, " "))
    .trim();
  if (!text) return "";
  for (const [re, replacement] of JOI_WORDING) text = text.replace(re, replacement);
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * Per-limit violation lines for CATEGORY_LIMIT_EXCEEDED, read defensively from
 * `details.violations` / `details.errors` (keys unconfirmed, Q-6). Every other
 * error returns []. Each entry is passed through untouched for the caller to
 * format; the screen falls back to the server `message` when this is empty.
 */
export function limitViolationLines(err) {
  if (payrollErrorCode(err) !== "CATEGORY_LIMIT_EXCEEDED") return [];
  const details = err?.data?.details;
  const list = Array.isArray(details?.violations)
    ? details.violations
    : Array.isArray(details?.errors)
      ? details.errors
      : Array.isArray(details)
        ? details
        : [];
  return list.filter((e) => e && typeof e === "object");
}

/**
 * Every problem on a VALIDATION_ERROR (gap G-1), as `[{ path, message }]` with
 * the message humanised. `details` is an array only under VALIDATION_ERROR; the
 * CSV codes carry `details` as an object `{ errors }`, so branch on the code
 * (PAYROLL_BACKEND_GAPS_RESPONSE.md §G-1). [] for every other error, and until
 * the backend ships G-1.
 */
export function validationProblems(err) {
  if (payrollErrorCode(err) !== "VALIDATION_ERROR") return [];
  const details = err?.data?.details;
  if (!Array.isArray(details)) return [];
  return details
    .filter((d) => d && typeof d === "object")
    .map((d) => ({ path: typeof d.path === "string" ? d.path : "", message: humanizeValidation(d.message) }))
    .filter((d) => d.message);
}

/**
 * Split a rejected save into per-field messages and a leftover banner line.
 * `fieldFor(path)` returns the form's error key for a dot-joined server path,
 * or "" when the form has no input for it. The first message per field wins.
 * With no G-1 details, `fields` is empty and `banner` is the usual message.
 * @returns {{ fields: Record<string, string>, banner: string }}
 */
export function formErrorsFrom(err, fieldFor, fallback) {
  const problems = validationProblems(err);
  if (problems.length === 0) return { fields: {}, banner: payrollErrorMessage(err, fallback) };
  const fields = {};
  const unplaced = [];
  for (const p of problems) {
    const key = p.path ? fieldFor(p.path) : "";
    if (key && !fields[key]) fields[key] = p.message;
    else if (!key) unplaced.push(p.message);
  }
  const rest = [...new Set(unplaced)].join(" ");
  const banner = Object.keys(fields).length > 0
    ? `Check the highlighted ${Object.keys(fields).length === 1 ? "field" : "fields"}.${rest ? ` ${rest}` : ""}`
    : rest || payrollErrorMessage(err, fallback);
  return { fields, banner };
}

/**
 * Drop the server field errors a form edit may have fixed. `keyOf` maps a
 * form-state key to its error key (defaults to the same name). Returns the
 * same object when nothing changed, so React skips the re-render.
 */
export function clearFieldErrors(fields, patch, keyOf = {}) {
  const keys = Object.keys(patch || {}).map((k) => keyOf[k] ?? k).filter((k) => fields[k]);
  if (keys.length === 0) return fields;
  const next = { ...fields };
  keys.forEach((k) => { delete next[k]; });
  return next;
}

// A run fails as a whole; these say what to do about the run, not one employee.
// `failure_code` is open-ended (§G-3), so unknown codes get no line and the
// screen keeps showing `failure_reason` on its own.
const RUN_FAILURE_ADVICE = {
  CALCULATION_FAILED: "Retry the calculation. If it fails again with the same reason, contact support.",
  ITEM_PERSIST_FAILED: "The figures were worked out but couldn't be saved. Retry the calculation.",
  NO_SALARY_STRUCTURE: "Assign an approved salary structure to the employee named in the reason, or exclude them, then retry.",
  INVALID_LOP_DIVISOR: "The unpaid-leave day count in Payroll Settings isn't usable for this month. Correct it, then retry.",
  NEGATIVE_NET_PAY: "Someone's deductions are higher than their pay and your settings block negative pay. Reduce the deductions or exclude them, then retry.",
  INVALID_COMPONENT_AMOUNT: "A salary component worked out to an invalid amount. Check the formula or amount of the component named in the reason, then retry.",
  CTC_RECONCILIATION_FAILED: "A salary structure's components don't add up to its CTC. Fix that structure, then retry.",
  OVERTIME_BASIS_UNRESOLVED: "Overtime pay couldn't find the salary figure it is based on. Check the overtime settings in the attendance policy and Payroll Settings, then retry.",
  TAX_TABLES_MISSING: "Income tax is switched on but there are no tax slabs for this financial year. Add them under Statutory & Tax, then retry.",
};

/**
 * What to do about a failed run, from `failure_code` (gap G-3). "" when the
 * code is absent or has no advice; `failure_reason` is always shown anyway.
 */
export function runFailureAdvice(run) {
  const code = typeof run?.failure_code === "string" ? run.failure_code : "";
  // Own keys only: an unexpected code like "toString" must not match Object.prototype.
  return code && Object.prototype.hasOwnProperty.call(RUN_FAILURE_ADVICE, code) ? RUN_FAILURE_ADVICE[code] : "";
}

export { PAYROLL_ERROR_MESSAGES };
