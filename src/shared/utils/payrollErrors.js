// ─────────────────────────────────────────────────────────────────────────────
// payrollErrors.js
// Maps the backend's typed `errorCode` values (thrown by client.js as
// `err.data.errorCode`) to actionable, human-readable messages. The payroll
// API returns these codes precisely so the UI can tell the user what to DO
// next — not just that something failed. Any code not listed here falls back
// to the server's own `message`, then to a generic line.
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

  // Component catalog
  COMPONENT_CODE_EXISTS: "A component with this code already exists. Choose a different code.",
  COMPONENT_IN_USE: "This component is used by an active template or an approved salary structure, so it can't be deactivated. Remove those references first.",
  SYSTEM_COMPONENT_IMMUTABLE: "This is a system component — its code, type, and calculation can't be changed. You can still adjust its tax and PF/ESI treatment.",

  // Template
  TEMPLATE_CODE_EXISTS: "A template with this code already exists. Choose a different code.",
  TEMPLATE_COMPONENT_EXISTS: "That component is already on this template.",

  // Payroll run engine
  DUPLICATE_RUN: "A payroll run already exists for this month. Open the existing run instead of creating a new one.",
  RUN_HAS_ERRORS: "This run can't be approved while some employees have calculation errors. Review and resolve the flagged items first.",
  RUN_STALE: "The figures are out of date — an item was changed since the last calculation. Recalculate the run before approving.",
  RUN_CALCULATION_IN_PROGRESS: "This run is currently calculating. Wait for it to finish before making changes.",
  RUN_IMMUTABLE: "This run is approved and can no longer be recalculated. Cancel it first if you need to make changes.",

  // Statutory & tax
  PT_SLAB_RANGE_INVALID: "The professional-tax bands have a gap or overlap. Each band must start exactly where the previous one ended, with one open-ended top band.",
  TAX_SLAB_RANGE_INVALID: "The tax slabs have a gap or overlap within an age band. Each slab must start exactly where the previous one ended.",
  FINANCIAL_YEAR_FINALIZED: "This financial year is finalised and locked. Tax details can no longer be changed for it.",
  FINANCIAL_YEAR_INCOMPLETE: "Some months in this financial year don't have a closed payroll run. Acknowledge the missing months with a reason to proceed anyway.",

  // Bank
  BANK_ACCOUNT_NOT_FOUND: "No bank account is on file for this employee yet.",
  INVALID_IFSC: "That IFSC code isn't valid. It should look like HDFC0001234.",
  INVALID_ACCOUNT_NUMBER: "The account number must be 6 to 20 digits.",
};

/**
 * Resolve a friendly, actionable message from a rejected payroll request.
 * @param {unknown} err - the error thrown by `request()` (carries `.data.errorCode` and `.message`).
 * @param {string} [fallback] - message when neither a mapped code nor a server message is present.
 * @returns {string}
 */
export function payrollErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = err?.data?.errorCode;
  if (code && PAYROLL_ERROR_MESSAGES[code]) return PAYROLL_ERROR_MESSAGES[code];
  return err?.message || fallback;
}

export { PAYROLL_ERROR_MESSAGES };
