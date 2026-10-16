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
  // Work mode is validated against the employee's contract at submission
  // (2026-10-05). The server's message names the next step, so these are listed
  // in SERVER_MESSAGE_CODES below and shown verbatim where it sends one.
  WORK_MODE_NOT_PERMITTED: "Your contract doesn't allow that work mode. Ask HR to correct your work mode if it's wrong.",
  INVALID_WORK_MODE: "That isn't a work mode we recognise. Pick one from the list and try again.",
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
  // SHIFT_IN_USE / PATTERN_IN_USE are HTTP 400, not 409 (update_shift_templates_2026_09_14 §5.5).
  // DELETE /shifts/:id deactivates; "in use" means an assignment that hasn't ended.
  SHIFT_IN_USE: "Employees are still assigned to this shift, so it can't be deactivated. End their assignments in Shift Management first.",
  SHIFT_DEACTIVATED: "This shift has been deactivated. Choose an active shift.",
  PATTERN_NOT_FOUND: RECORD_GONE,
  PATTERN_IN_USE: "This rotation is still assigned to employees, so it can't be deleted. End those assignments first.",
  INVALID_FILTER: "One of the filters isn't valid. Clear the filters and try again.",
  ASSIGNMENT_NOT_FOUND: RECORD_GONE,
  HOLIDAY_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_NOT_FOUND: RECORD_GONE,
  WEEKLY_OFF_DELETED: RECORD_GONE,
  LOCK_NOT_FOUND: RECORD_GONE,
  OVERLAPPING_LOCK: "This range overlaps an existing lock period. Adjust the dates or remove the existing lock first.",
  COMP_OFF_NOT_FOUND: RECORD_GONE,

  // §11 Field locations & assignments (2026-10-05). A field site exists only to
  // be geofenced, so a retired one can't be assigned and coordinates aren't
  // optional — these say which, rather than "invalid request".
  FIELD_LOCATION_NOT_FOUND: RECORD_GONE,
  FIELD_ASSIGNMENT_NOT_FOUND: RECORD_GONE,
  FIELD_LOCATION_INACTIVE: "This site has been retired, so people can't be assigned to it. Pick an active site or restore this one.",
  FIELD_LOCATION_FORBIDDEN: "Only HR or the person who added this site can change it.",
  FIELD_LOCATION_DUPLICATE: "A site with that name already exists. Use the existing one rather than adding a second.",
  FIELD_ASSIGNMENT_DUPLICATE: "This person is already assigned to this site. Edit that assignment's dates instead of adding another.",
  // EMPLOYEE_NOT_FOUND (also raised by assign) is already mapped below.
  COMP_OFF_NOT_EARNED: "This request has already been actioned, so it can't be changed. The list has been refreshed.",
  EMPLOYEE_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  USER_NOT_FOUND: "That employee could not be found. They may have been removed from the organisation.",
  MANAGER_NOT_FOUND: "That manager could not be found.",
  NOT_FOUND: RECORD_GONE,

  // §3.5 Devices (Phase 8 — surfaced only if device screens are used)
  UNAUTHORIZED_DEVICE: "The device API key is invalid or the device is inactive.",
  MAPPING_NOT_FOUND: "This device employee ID isn't mapped to anyone yet.",
  MAPPING_ALREADY_EXISTS: "This device employee ID is already mapped.",

  // Device Trust (2026-10-15). EVERY one of these is a 403/400/409/422/503 and
  // NEVER a 401 — client.js only ends a session on 401, so none of them can log
  // anyone out (frontend guide §3.2). The two that need more than a sentence —
  // a synced passkey and an expired challenge — have their own screens, and
  // these messages are what a toast falls back to.
  ATTENDANCE_DEVICE_REQUIRED: "You need to register this device before you can clock in from it.",
  ATTENDANCE_DEVICE_REVOKED: "This device was shut off, so it can't be used to clock in. Register the device you're using now.",
  ATTENDANCE_DEVICE_SUSPENDED: "This device is blocked for now. Contact HR — only they can switch it back on.",
  DEVICE_VERIFICATION_FAILED: "We couldn't confirm this is your registered device. Try once more, and contact HR if it keeps failing.",
  DEVICE_CHALLENGE_INVALID: "The device check expired before it finished. Try again.",
  DEVICE_NOT_HARDWARE_BOUND: "The screen lock your browser created is synced to your other devices, so it can't be used as your attendance device.",
  DEVICE_LIMIT_REACHED: "You've already registered as many devices as your organisation allows. Replace one of them to add this device.",
  DEVICE_ALREADY_REGISTERED: "This screen lock or fingerprint is already registered. Use a different one.",
  DEVICE_TRUST_MISCONFIGURED: "Device checks aren't set up correctly, so they can't run right now. Contact HR.",
  DEVICE_NOT_FOUND: RECORD_GONE,
  DEVICE_INVALID_STATE_TRANSITION: "This device was already dealt with elsewhere. Refresh to see where it stands now.",
  // A wrong code also burns the device check, so there is no "re-enter the code"
  // path — say that, or they will type it again and wonder why nothing happens.
  OTP_INVALID: "That code didn't match, or it has expired. Start again — you'll be asked to confirm on your device once more.",
  // Optimistic concurrency on the HR policy form: all three mean the same thing
  // to the person, and the screen re-reads before telling them.
  IF_MATCH_REQUIRED: "These settings couldn't be saved. Refresh the page and try again.",
  IF_MATCH_INVALID: "These settings couldn't be saved. Refresh the page and try again.",
  PRECONDITION_FAILED: "Someone else changed these settings while you were editing. We've loaded the latest version — check your changes and save again.",
};

/**
 * Device Trust rejections, as the frontend guide §3.2 lists them. Nothing here
 * is a session problem: `client.js` ends a session only on a 401 and these are
 * all 403/400/409/422/503, so there is no interceptor to exclude them from —
 * the set exists so `monitor` mode can recognise a device failure and punch
 * without the proof instead (guide §4).
 */
const DEVICE_TRUST_CODES = new Set([
  "ATTENDANCE_DEVICE_REQUIRED",
  "ATTENDANCE_DEVICE_REVOKED",
  "ATTENDANCE_DEVICE_SUSPENDED",
  "DEVICE_VERIFICATION_FAILED",
  "DEVICE_CHALLENGE_INVALID",
  "DEVICE_NOT_HARDWARE_BOUND",
  "DEVICE_LIMIT_REACHED",
  "DEVICE_ALREADY_REGISTERED",
  "DEVICE_TRUST_MISCONFIGURED",
]);

// Joi / shape rejections: the server `message` is more specific than any copy we could write.
// Codes whose server message beats ours because it carries specifics we can't
// know: which field broke a rule, which work mode the contract allows, or the
// dates of the assignment already blocking this one.
const SERVER_MESSAGE_CODES = new Set([
  "VALIDATION_ERROR", "INVALID_SHIFT", "INVALID_SHIFT_DATA", "INVALID_ROTATION_DURATIONS",
  "WORK_MODE_NOT_PERMITTED", "FIELD_ASSIGNMENT_DUPLICATE", "FIELD_LOCATION_DUPLICATE",
]);

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
/**
 * The punch already matched the server's state — a double-tap, a retry, or the
 * same person punching from another device. The backend answers 409 rather than
 * failing, every caller refetches `/today` straight after, and all three
 * messages end "Your status has been refreshed". Nothing went wrong, so the card
 * states it rather than showing a red failure.
 */
export const isStateReconciliation = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ALREADY_CLOCKED_IN" || code === "NOT_CLOCKED_IN" || code === "NO_ACTIVE_BREAK";
};

/** The item was decided elsewhere (another approver, or a stale queue). */
export const isAlreadyProcessed = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ALREADY_PROCESSED" || code === "COMP_OFF_NOT_EARNED";
};

/** A device-trust refusal rather than an ordinary attendance error. */
export const isDeviceTrustError = (err) => DEVICE_TRUST_CODES.has(attendanceErrorCode(err));

/** Registering a device is the way out of this one. Suspension is NOT. */
export const isDeviceEnrollmentRequired = (err) => {
  const code = attendanceErrorCode(err);
  return code === "ATTENDANCE_DEVICE_REQUIRED" || code === "ATTENDANCE_DEVICE_REVOKED";
};

/** Only HR can clear this, so never offer registration here. */
export const isDeviceSuspended = (err) => attendanceErrorCode(err) === "ATTENDANCE_DEVICE_SUSPENDED";

/** The browser made a passkey that syncs between devices — needs its own screen. */
export const isSyncedPasskey = (err) => attendanceErrorCode(err) === "DEVICE_NOT_HARDWARE_BOUND";

/** Retriable exactly once, and only after telling the person why (guide §9). */
export const isChallengeExpired = (err) => attendanceErrorCode(err) === "DEVICE_CHALLENGE_INVALID";

/** At the device cap: `err.data.details.devices[]` is the replacement picker. */
export const isDeviceLimitReached = (err) => attendanceErrorCode(err) === "DEVICE_LIMIT_REACHED";

/**
 * The HR policy row moved under the editor's feet (412), or the If-Match token
 * never arrived (428/400). Re-read, reconcile, resubmit — never a blind retry.
 */
export const isStalePolicyEdit = (err) => {
  const code = attendanceErrorCode(err);
  return code === "PRECONDITION_FAILED" || code === "IF_MATCH_REQUIRED" || code === "IF_MATCH_INVALID"
    || err?.status === 412 || err?.status === 428;
};

export { ATTENDANCE_ERROR_MESSAGES };
