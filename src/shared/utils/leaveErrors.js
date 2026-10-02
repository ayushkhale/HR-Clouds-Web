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
  TEMPLATE_EMPTY: "This policy has no leave types in it yet, so it would give them no leave at all. Add a quota to the policy first.",
  TEMPLATE_IN_USE: "People are still on this policy. Move them to another one before deleting it.",
  NO_JOINING_DATE: "There's no joining date on file for this person, so their leave days can't be worked out. Add it on their profile, then try again.",
  EMPLOYEE_INACTIVE: "This person has been deactivated, so a leave policy can't be assigned to them.",
  EFFECTIVE_DATE_NOT_SUPPORTED: "A policy can only start today for now. Scheduling one for a future date isn't available yet.",

  // Ending an assignment
  ASSIGNMENT_NOT_FOUND: "This leave policy assignment no longer exists. Refresh the list.",
  ASSIGNMENT_ALREADY_ENDED: "This policy has already been given an end date.",
  ASSIGNMENT_HAS_LEAVES_AFTER_END: "There is leave booked after that date. Cancel or reject it first, then set the end date.",
  EFFECTIVE_TO_IN_PAST: "The last day has to be today or later.",
  INVALID_DATE: "That date can't be used. Check the day, month and year.",
  LEAVE_CONFIG_ENDED: "This person's leave policy ended before that date, so no leave can be taken then.",

  // Reverting a customisation
  NO_POLICY_DEFAULT: "This person's leave was set up before policies were tracked, so there's nothing to go back to. Assign a policy to them first.",

  // Assigning to many people at once
  BULK_LIMIT_EXCEEDED: "Too many people in one go. Narrow the selection and try again.",
  PREVIEW_STALE: "Something changed while you were checking the list. Preview it again to see the current picture.",
  TARGETING_REQUIRED: "Choose who this is for, or pick everyone in the organisation.",
  INVALID_TARGETING: "One of the departments or locations you chose no longer exists. Refresh and pick again.",

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
