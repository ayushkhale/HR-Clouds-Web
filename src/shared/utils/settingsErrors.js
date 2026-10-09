// ─────────────────────────────────────────────────────────────────────────────
// settingsErrors.js — The settings gateway's error codes in plain words.
// Mirrors payrollErrors.js / organizationErrors.js.
//
// Source: the error tables in public/ref docs/md_settings/combined_api_analysis.md.
//
// Most of these are not the reader's fault and not fixable by retrying — they
// say a group is off-limits to their role, or not in their plan. So each one
// says which of those it is, because "you don't have access to this" sends an
// HR admin to ask IT about a permission when the real answer is that the
// company doesn't pay for that module.
//
// Phase 2's write codes (412 precondition, the reason and confirmation gates)
// are deliberately absent: there is no write plane yet, so a message for one
// could only ever be dead copy that drifts before it is used.
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_ERROR_MESSAGES = {
  // ── Access ───────────────────────────────────────────────────────────────
  // Note the shape of this one: the gateway refuses platform admins too, and
  // an employee outright. "Your account can't open this" is true for all of
  // them without implying a mistake was made.
  FORBIDDEN: "Your account can’t open the company settings.",
  UNAUTHORIZED: "Your session has ended. Sign in again to see these settings.",
  ORG_NOT_ACTIVE: "This organisation is switched off, so its settings can’t be read. Contact support.",

  // ── Plan ─────────────────────────────────────────────────────────────────
  FEATURE_NOT_AVAILABLE: "Your plan doesn’t include this part of the product, so it has no settings to show.",
  ENTITLEMENT_DEPENDENCY_FAILURE: "We couldn’t check what your plan includes just now. Try again in a moment.",

  // ── Lookups ──────────────────────────────────────────────────────────────
  GROUP_NOT_FOUND: "That group of settings doesn’t exist any more. Reload the page.",
  SETTING_NOT_FOUND: "That setting doesn’t exist any more. Reload the page.",
  UNKNOWN_MODULE: "That isn’t a part of the product we have settings for. Reload the page.",

  // ── Our own request bugs. The reader can do nothing about either, so both
  //    say "reload" rather than describing a filter they never typed.
  INVALID_FILTER_COMBINATION: "We asked for these settings the wrong way. Reload the page.",
};

/** The code a settings error arrived with, or "". */
export const settingsErrorCode = (error) =>
  error?.data?.errorCode || error?.data?.code || "";

/**
 * A plain message for a settings error. VALIDATION_ERROR falls through to the
 * caller's fallback: its body is a Joi sentence, and §6 keeps those off screen.
 */
export function settingsErrorMessage(error, fallback = "We couldn’t load your settings. Try again.") {
  const code = settingsErrorCode(error);
  if (code && SETTINGS_ERROR_MESSAGES[code]) return SETTINGS_ERROR_MESSAGES[code];
  if (error?.status === 403) return SETTINGS_ERROR_MESSAGES.FORBIDDEN;
  if (error?.status === 503) return SETTINGS_ERROR_MESSAGES.ENTITLEMENT_DEPENDENCY_FAILURE;
  return fallback;
}

/* ─── Why a group isn't on screen ───────────────────────────────────────────
   #244 answers 200 even when it couldn't serve every group, listing each one
   it skipped in `unavailable_groups[]` with a reason. These are the three
   reasons, in words — and they are NOT errors. A group the plan doesn't cover
   is a sales fact; a group this role may not read is a boundary working as
   intended. Only READ_FAILED is a fault, and it is the only one that invites a
   retry (§7: "couldn't load" and "nothing on file" must not look alike). */
export const UNAVAILABLE_REASON = {
  NOT_READABLE: {
    label: "Not yours to see",
    detail: "These settings belong to an HR administrator.",
    retry: false,
  },
  NOT_ENTITLED: {
    label: "Not in your plan",
    detail: "Your plan doesn’t include this part of the product.",
    retry: false,
  },
  READ_FAILED: {
    label: "Couldn’t load",
    detail: "We couldn’t reach these settings just now. Everything else on this page is up to date.",
    retry: true,
  },
};

export const unavailableReason = (reason) =>
  UNAVAILABLE_REASON[reason] || { label: "Unavailable", detail: "These settings aren’t available right now.", retry: true };

/** Only a READ_FAILED is worth a Try again button. */
export const isRetryableUnavailable = (reason) => Boolean(UNAVAILABLE_REASON[reason]?.retry);

export default settingsErrorMessage;
