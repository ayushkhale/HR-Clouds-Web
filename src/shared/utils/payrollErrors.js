// ─────────────────────────────────────────────────────────────────────────────
// payrollErrors.js
// Maps the backend's typed `errorCode` values (thrown by client.js as
// `err.data.errorCode`) to actionable, human-readable messages.
//
// Error contract (PAYROLL_BACKEND_RESPONSES.md §1): `{ success: false, message,
// errorCode, details? }`. `message` is always safe to show. A VALIDATION_ERROR
// carries only the FIRST Joi message and no field list. `details.errors` exists
// only on CSV_PARSE_FAILED and BULK_VALIDATION_FAILED. Codes not listed here
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
    // Gap G-1 (proposed): `details: [{ path, message }]` listing every invalid field.
    const every = Array.isArray(err?.data?.details)
      ? [...new Set(err.data.details.map((d) => humanizeValidation(d?.message)).filter(Boolean))]
      : [];
    if (every.length > 0) return every.join(" ");
    return humanizeValidation(serverMessage) || PAYROLL_ERROR_MESSAGES.VALIDATION_ERROR;
  }
  if (code === "INVALID_PERIOD_OVERRIDE") {
    const hit = PERIOD_OVERRIDE_MESSAGES.find(([re]) => re.test(serverMessage));
    return hit ? hit[1] : PAYROLL_ERROR_MESSAGES.INVALID_PERIOD_OVERRIDE;
  }
  // The server message lists the conflicting lock ranges.
  if (code === "PERIOD_PARTIALLY_LOCKED" && serverMessage) return `${PAYROLL_ERROR_MESSAGES.PERIOD_PARTIALLY_LOCKED} Details: ${serverMessage}`;
  if (code && PAYROLL_ERROR_MESSAGES[code]) return PAYROLL_ERROR_MESSAGES[code];

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
 * What to do about a failed run. `failure_reason` is a sentence and is always
 * shown; `failure_code` is proposed as backend gap G-3 and, once sent, maps to
 * a fix here. "" until then.
 */
export function runFailureAdvice(run) {
  const code = run?.failure_code;
  return (code && PAYROLL_ERROR_MESSAGES[code]) || "";
}

export { PAYROLL_ERROR_MESSAGES };
