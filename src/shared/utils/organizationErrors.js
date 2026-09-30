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
// ─────────────────────────────────────────────────────────────────────────────

const ORGANIZATION_ERROR_MESSAGES = {
  // Reads
  ORG_NOT_FOUND: "We couldn’t find this organisation. Sign out and back in, then try again.",
  UNAUTHORIZED: "Your session has no organisation selected. Sign out and back in, then try again.",

  // Profile photo
  FILE_TOO_LARGE: "That picture is too large. Choose one under 5 MB.",
  UNSUPPORTED_MEDIA_TYPE: "That file isn’t a picture we can use. Choose a PNG, JPG or WebP image.",
  AVATAR_RATE_LIMITED: "Too many photo changes in your organisation in the last hour. Try again a little later.",
  UPLOAD_CLAIM_NOT_FOUND: "The upload took too long and its link expired. Choose the picture again.",
  UPLOAD_NOT_FOUND: "The picture didn’t finish uploading. Check your connection and try again.",
  STORAGE_UNAVAILABLE: "Photo storage isn’t available right now. Try again in a few minutes.",
};

const codeOf = (err) => err?.data?.errorCode || err?.data?.code || err?.data?.error?.code || null;

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
  if (code === "AVATAR_RATE_LIMITED" || err?.status === 429) {
    const wait = retryAfterSeconds(err);
    if (wait) {
      const minutes = Math.max(1, Math.ceil(wait / 60));
      return `Too many photo changes in your organisation in the last hour. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return ORGANIZATION_ERROR_MESSAGES.AVATAR_RATE_LIMITED;
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
