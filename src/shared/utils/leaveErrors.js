// ─────────────────────────────────────────────────────────────────────────────
// leaveErrors.js
// Maps the backend's typed `errorCode` values (thrown by client.js as
// `err.data.errorCode`) to actionable, human-readable messages for the Leave
// Module. Mirrors the pattern in payrollErrors.js. Any code not listed here
// falls back to the server's own `message` (leave business-logic 400s —
// overlap, sandwich, no-working-days — already carry clear server messages),
// then to a generic line.
// ─────────────────────────────────────────────────────────────────────────────

const LEAVE_ERROR_MESSAGES = {
  // Feature gating
  FEATURE_NOT_AVAILABLE: "Leave management isn't enabled for this organisation. Contact your administrator to turn it on.",
  MISSING_ORG_CONTEXT: "Leave management is only available inside an organisation. Switch to an organisation account to continue.",

  // Auth / scope
  FORBIDDEN: "You don't have authority to action this request.",
  NOT_FOUND: "That leave record could not be found. It may have been actioned or removed — refresh to see the latest.",

  // Leave types
  LEAVE_TYPE_EXISTS: "A leave type with this code already exists. Choose a unique code.",
  LEAVE_TYPE_NOT_FOUND: "This leave type no longer exists. Refresh the list.",
  ACTIVE_BALANCES_EXIST: "Employees still hold balances for this leave type. Force-deactivate to proceed.",
  PENDING_REQUESTS_EXIST: "There are pending leave requests for this type. Approve or reject them all before deactivating.",

  // Templates & entitlements
  TEMPLATE_NOT_FOUND: "This policy template no longer exists. Refresh the list.",
  ENTITLEMENT_EXISTS: "This leave type already has a quota in this policy. Delete it first to reconfigure.",

  // Assignment & override
  EMPLOYEE_NOT_FOUND: "That employee could not be found.",
  CONFIG_NOT_FOUND: "No configuration exists for this leave type. Assign a policy to this employee first.",

  // Application enforcement (Phase 6 — confirm exact codes via B5)
  DOCUMENT_REQUIRED: "A supporting document is required for this many days of this leave type. Attach a document link and resubmit.",
  DEMOGRAPHIC_INELIGIBLE: "You are not eligible to apply for this leave type.",
  DEMOGRAPHIC_PROFILE_INCOMPLETE: "This leave type is restricted by profile (e.g. gender), but that detail is not on file. Contact HR to update your profile.",
  NOTICE_PERIOD_RESTRICTED: "Leave of this type is restricted during your notice period.",
};

/**
 * Resolve a friendly, actionable message from a rejected leave request.
 * @param {unknown} err - error thrown by `request()` (carries `.data.errorCode` and `.message`).
 * @param {string} [fallback] - message when neither a mapped code nor a server message is present.
 * @returns {string}
 */
export function leaveErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = err?.data?.errorCode;
  if (code && LEAVE_ERROR_MESSAGES[code]) return LEAVE_ERROR_MESSAGES[code];
  return err?.message || fallback;
}

export { LEAVE_ERROR_MESSAGES };
