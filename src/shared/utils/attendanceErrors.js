// ─────────────────────────────────────────────────────────────────────────────
// attendanceErrors.js
// Maps the backend's typed error `code` values (thrown by client.js as
// `err.data.code`) to actionable messages for the Attendance module.
//
// Source of truth: ATTENDANCE_API_CONTRACT.md §3 — "if a code is not on this
// list, the backend does not emit it". Payroll locks raise PERIOD_LOCKED (403);
// DATE_LOCKED never existed. Always branch on `code`, never on `message`.
// ─────────────────────────────────────────────────────────────────────────────

const RECORD_GONE = "That record could not be found. It may already have been actioned or removed — refresh to see the latest.";

const ATTENDANCE_ERROR_MESSAGES = {
  // §1.3 / §3.3 Access
  FEATURE_NOT_AVAILABLE: "Attendance isn't enabled for this organisation. Contact your administrator to turn it on.",
  // Raised by the shared org-context middleware in front of every module.
  MISSING_ORG_CONTEXT: "Attendance is only available inside an organisation. Switch to an organisation account to continue.",
  // Attendance emits UNAUTHORIZED as a 403 for cross-org access (an expired
  // session is an HTTP 401 and is handled before this map).
  UNAUTHORIZED: "This record belongs to a different organisation, so you can't access it.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NOT_HR: "Only HR administrators can perform this action.",
  HIERARCHY_VIOLATION: "This employee is outside your reporting line, so you can't view or action their attendance.",
  EMPLOYEE_NOT_IN_TEAM: "This employee isn't in your team, so you can't view their attendance.",

  // §3.1 Punch / clock
  ALREADY_CLOCKED_IN: "You're already clocked in for today. Your status has been refreshed.",
  NOT_CLOCKED_IN: "You aren't clocked in right now. Your status has been refreshed.",
  NO_ACTIVE_BREAK: "You're not on a break right now. Your status has been refreshed.",
  MAX_BREAKS_EXCEEDED: "You've already taken the maximum number of breaks your attendance policy allows today.",
  PREVIOUS_SHIFT_OPEN: "Your previous shift is still open. Clock out of it before starting a new one.",
  PERIOD_LOCKED: "This date is locked for payroll processing, so its attendance can't be changed. Contact HR if a correction is needed.",

  // §3.2 Regularization
  REGULARIZATION_DISABLED: "Your attendance policy doesn't allow correction requests. Contact HR if a correction is needed.",
  INVALID_REGULARIZATION_DATE: "This date is outside your policy's correction window, so it can't be corrected.",
  INVALID_REGULARIZATION_WINDOW: "The corrected clock-out must be after the corrected clock-in.",
  INVALID_REGULARIZATION_TIME: "One of the corrected times couldn't be read. Re-enter the times and try again.",
  ALREADY_PENDING: "You already have a pending correction request for this date. Withdraw it first to submit a new one.",
  ALREADY_PROCESSED: "This request has already been actioned, so it can't be changed. The list has been refreshed.",

  // §3.4 Configuration
  POLICY_NOT_FOUND: RECORD_GONE,
  POLICY_DELETED: "This policy no longer exists. Refresh to see the current policies.",
  POLICY_DEACTIVATED: "This policy has been deactivated. Choose an active policy.",
  SHIFT_NOT_FOUND: RECORD_GONE,
  SHIFT_IN_USE: "This shift is still assigned to employees or used in a rotation, so it can't be deleted. End those assignments first.",
  SHIFT_DEACTIVATED: "This shift has been deactivated. Choose an active shift.",
  PATTERN_NOT_FOUND: RECORD_GONE,
  PATTERN_IN_USE: "This rotation is still assigned to employees, so it can't be deleted. End those assignments first.",
  ASSIGNMENT_NOT_FOUND: RECORD_GONE,
  HOLIDAY_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_DELETED: RECORD_GONE,
  LOCK_NOT_FOUND: RECORD_GONE,
  OVERLAPPING_LOCK: "This range overlaps an existing lock period. Adjust the dates or remove the existing lock first.",
  COMP_OFF_NOT_FOUND: RECORD_GONE,
  COMP_OFF_NOT_EARNED: "This request has already been actioned, so it can't be changed. The list has been refreshed.",
  EMPLOYEE_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  USER_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  MANAGER_NOT_FOUND: "That manager could not be found.",
  NOT_FOUND: RECORD_GONE,

  // §3.5 Devices (Phase 8 — surfaced only if device screens are used)
  UNAUTHORIZED_DEVICE: "The device API key is invalid or the device is inactive.",
  MAPPING_NOT_FOUND: "This device employee ID isn't mapped to anyone yet.",
  MAPPING_ALREADY_EXISTS: "This device employee ID is already mapped.",
};

// Joi / shape rejections: the server `message` is more specific than any copy we could write.
const SERVER_MESSAGE_CODES = new Set(["VALIDATION_ERROR", "INVALID_SHIFT", "INVALID_SHIFT_DATA", "INVALID_ROTATION_DURATIONS"]);

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";
const SERVER_ERROR = "The server ran into a problem. Please try again shortly.";
const RATE_LIMITED = "Too many requests. Please wait a moment and try again.";

/** The typed backend code, if any (`code`; `errorCode` kept for older envelopes). */
export function attendanceErrorCode(err) {
  return err?.data?.code || err?.data?.errorCode || null;
}

/**
 * Resolve a friendly, actionable message from a rejected attendance request.
 * @param {unknown} err - error thrown by `request()`.
 * @param {string} [fallback]
 * @returns {string}
 */
export function attendanceErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = attendanceErrorCode(err);
  const serverMessage = typeof err?.data?.message === "string" ? err.data.message.trim() : "";

  if (err?.status === 401) return SESSION_EXPIRED;
  if (code && !SERVER_MESSAGE_CODES.has(code) && ATTENDANCE_ERROR_MESSAGES[code]) {
    return ATTENDANCE_ERROR_MESSAGES[code];
  }
  if (err?.status >= 500) return SERVER_ERROR;
  if (err?.status === 429) return RATE_LIMITED;
  if (serverMessage) return serverMessage;
  // Only real fetch failures (offline, DNS, CORS) — a TypeError from a coding
  // bug must not be reported as a connectivity problem.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(err?.message || "")) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  const message = typeof err?.message === "string" ? err.message : "";
  if (message && !/^Request failed: \d+$/.test(message)) return message;
  return fallback;
}

export const isFeatureDisabled = (err) => {
  const code = attendanceErrorCode(err);
  return code === "FEATURE_NOT_AVAILABLE" || code === "MISSING_ORG_CONTEXT";
};
export const isPeriodLocked = (err) => attendanceErrorCode(err) === "PERIOD_LOCKED";
export const isHierarchyViolation = (err) => {
  const code = attendanceErrorCode(err);
  return code === "HIERARCHY_VIOLATION" || code === "EMPLOYEE_NOT_IN_TEAM";
};
export const isNotFound = (err) => {
  const code = attendanceErrorCode(err) || "";
  return code === "NOT_FOUND" || code.endsWith("_NOT_FOUND") || err?.status === 404;
};
/** The item was decided elsewhere (another approver, or a stale queue). */
export const isAlreadyProcessed = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ALREADY_PROCESSED" || code === "COMP_OFF_NOT_EARNED";
};

export { ATTENDANCE_ERROR_MESSAGES };
