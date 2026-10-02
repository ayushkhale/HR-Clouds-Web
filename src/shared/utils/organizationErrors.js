// ─────────────────────────────────────────────────────────────────────────────
// organizationErrors.js
// Maps the Organization module's error codes to plain messages. Mirrors
// leaveErrors.js / payrollErrors.js: `request()` throws with `err.data` holding
// the body, whose code arrives as `errorCode` (and on some routes `code`).
//
// The avatar codes come from the upload handshake contract
// (`public/ref docs/md_updates/5_org_details_and_hierarchy_api.md` §3.6). They
// are written for the person uploading their own photo, so they say what to do
// next — pick a smaller picture, try again later — not what the server checked.
//
// The same holds for the 2026-10-02 additions (job profile, department heads,
// invitations): each says what the reader should do next, never what was
// checked. Two of them are not failures at all and must not read like one —
// `FIELD_ALREADY_SET` is the expected end of a double-submit, and
// `DEPARTMENT_IN_USE` became reachable only because a department head now
// counts as a member, so the department HR thought was empty never was.
//
// VALIDATION_ERROR deliberately falls through to the caller's own fallback: the
// body carries a Joi sentence, which §6 says never reaches a screen. Every form
// writing to these endpoints validates the same rules client-side, so a
// VALIDATION_ERROR arriving here means something we didn't anticipate, and a
// generic "check the details" is more honest than quoting the validator.
// ─────────────────────────────────────────────────────────────────────────────

const ORGANIZATION_ERROR_MESSAGES = {
  // Reads
  ORG_NOT_FOUND: "We couldn’t find this organisation. Sign out and back in, then try again.",
  UNAUTHORIZED: "Your session has no organisation selected. Sign out and back in, then try again.",

  // Profile photo. The same codes serve the company logo (same handshake), so
  // they say "image" where they can rather than naming one of the two.
  FILE_TOO_LARGE: "That image is too large. Choose one under 5 MB.",
  UNSUPPORTED_MEDIA_TYPE: "That file isn’t an image we can use. Choose a PNG, JPG or WebP file.",
  AVATAR_RATE_LIMITED: "Too many photo changes in your organisation in the last hour. Try again a little later.",
  UPLOAD_CLAIM_NOT_FOUND: "The upload took too long and its link expired. Choose the image again.",
  UPLOAD_NOT_FOUND: "The image didn’t finish uploading. Check your connection and try again.",
  STORAGE_UNAVAILABLE: "Image storage isn’t available right now. Try again in a few minutes.",

  // Company profile and logo (6_org_profile_management_api.md §4)
  LOGO_RATE_LIMITED: "The logo has been changed too many times in the last hour. Try again a little later.",
  ORG_PROFILE_NOT_FOUND: "This organisation has no profile to change yet. Reload the page and try again.",

  // My own job profile — fill-once (4_org_employee_api.md §11).
  // FIELD_ALREADY_SET is the normal end of a double-submit or a second tab, not
  // a fault, so it reads as "someone got there first" rather than as a failure.
  FIELD_ALREADY_SET: "Some of this was already saved — these answers can only be set once. We’ve reloaded what’s on file.",
  PROFILE_NOT_FOUND: "We couldn’t find your staff record. Sign out and back in, then try again.",
  LOCATION_MISMATCH: "That department belongs to a different office. Pick a department at your own office, or set your office first.",
  DEPARTMENT_INACTIVE: "That department has been switched off. Pick another one.",
  LOCATION_INACTIVE: "That office has been switched off. Pick another one.",
  DEPARTMENT_NOT_FOUND: "That department is no longer there. Reload the list and pick again.",
  LOCATION_NOT_FOUND: "That office is no longer there. Reload the list and pick again.",

  // Departments and heads (3_org_structure_api.md §4 and §6).
  // HOD_IN_OTHER_DEPARTMENT gets its own sentence on screen, naming the person
  // and offering the move, so this is only the fallback for a caller that has
  // no name to put in it.
  HOD_IN_OTHER_DEPARTMENT: "This person already belongs to another department. Move them across first, then they can head this one.",
  HOD_PROFILE_NOT_FOUND: "This person’s staff record is incomplete, so they can’t head a department yet.",
  INVALID_HOD_ROLE: "Only managers and HR admins can head a department.",
  DEPARTMENT_IN_USE: "This department still has people in it, including its head. Move them to another department first, then switch it off.",
  DEPARTMENT_NAME_EXISTS: "A department with that name already exists.",
  MISSING_FALLBACK_MANAGER: "Their old department has no head, so choose who their team reports to after the move.",

  // Invitations (2_org_invitation_api.md §1)
  MISSING_DEPARTMENT_FOR_HOD: "Choose the department they’ll head.",
  FORBIDDEN_INVITE_FIELD: "Only HR can set these details on an invitation.",
  DUPLICATE_MEMBERSHIP: "This person is already in your organisation.",
};

const codeOf = (err) => err?.data?.errorCode || err?.data?.code || err?.data?.error?.code || null;

/**
 * The stable error code off a failed organisation call, for the screens that
 * must branch on one. Every contract in `md_organization/` says to branch on
 * `errorCode` and never on `message` — the messages are prose and change.
 * @returns {string|null}
 */
export const organizationErrorCode = (err) => codeOf(err);

/** How long a rate-limited caller should wait, in seconds, or null. */
export function retryAfterSeconds(err) {
  const fromBody = Number(err?.data?.retry_after_seconds ?? err?.data?.details?.retry_after_seconds ?? err?.data?.data?.retry_after_seconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  return Number.isFinite(err?.retryAfter) && err.retryAfter > 0 ? err.retryAfter : null;
}

/**
 * A readable message for a failed organisation-module call.
 * @param {unknown} err  error thrown by `request()`
 * @param {string} [fallback]
 */
export function organizationErrorMessage(err, fallback = "Something went wrong. Try again.") {
  const code = codeOf(err);
  if (code === "AVATAR_RATE_LIMITED" || code === "LOGO_RATE_LIMITED" || err?.status === 429) {
    const what = code === "LOGO_RATE_LIMITED" ? "logo changes" : "photo changes";
    const wait = retryAfterSeconds(err);
    if (wait) {
      const minutes = Math.max(1, Math.ceil(wait / 60));
      return `Too many ${what} in your organisation in the last hour. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return code === "LOGO_RATE_LIMITED"
      ? ORGANIZATION_ERROR_MESSAGES.LOGO_RATE_LIMITED
      : ORGANIZATION_ERROR_MESSAGES.AVATAR_RATE_LIMITED;
  }
  if (code && ORGANIZATION_ERROR_MESSAGES[code]) return ORGANIZATION_ERROR_MESSAGES[code];
  // Status-only fallbacks for the handshake, in case a proxy drops the body.
  if (err?.status === 413) return ORGANIZATION_ERROR_MESSAGES.FILE_TOO_LARGE;
  if (err?.status === 415) return ORGANIZATION_ERROR_MESSAGES.UNSUPPORTED_MEDIA_TYPE;
  if (err?.status === 503) return ORGANIZATION_ERROR_MESSAGES.STORAGE_UNAVAILABLE;
  if (err?.status === 403) return "You don’t have access to this.";
  // A Joi message ("\"content_type\" must be one of …") is never shown.
  if (code === "VALIDATION_ERROR") return fallback;
  return err?.message && !/^Request failed/.test(err.message) ? err.message : fallback;
}

export { ORGANIZATION_ERROR_MESSAGES };
