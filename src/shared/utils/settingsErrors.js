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

  // ── Writing (Phase 2) ────────────────────────────────────────────────────
  // The concurrency guard. This is NOT a failure of theirs and must not read
  // like one: their edits are still on screen, and the only thing lost is the
  // assumption that nobody else was editing.
  SETTINGS_PRECONDITION_FAILED: "Somebody else changed these settings while you were editing. Nothing of yours was saved — reload to see theirs, then make your change again.",

  // The two safety gates. Both are answered by the confirm dialog rather than
  // shown as errors, so these are the wording of last resort.
  SETTINGS_REASON_REQUIRED: "This change needs a short reason before it can be saved.",
  SETTINGS_CONFIRMATION_REQUIRED: "This change needs confirming before it can be saved.",

  // Writability. Each one means the gateway refused a key, which is our bug or
  // a stale page — never something the reader typed wrong.
  SETTINGS_GROUP_READ_ONLY: "These settings can’t be changed from here.",
  SETTING_NOT_WRITABLE: "Some of those can’t be changed from this screen. Reload the page and try again.",
  SETTING_NOT_RESETTABLE: "Some of those can’t be put back to their default.",
  NO_WRITABLE_KEYS: "There was nothing here we could save.",
  SETTINGS_PAYLOAD_INVALID: "That’s more than we can save in one go. Change fewer settings at a time.",
  SETTINGS_IF_MATCH_REQUIRED: "We couldn’t save that safely. Reload the page and try again.",
  SETTINGS_IF_MATCH_INVALID: "We couldn’t save that safely. Reload the page and try again.",

  // Refusals from the owning module — the rules that live with the domain, not
  // with the settings gateway. Each says what the organisation must look like
  // for the change to be allowed.
  INSUFFICIENT_CHECKERS: "You need at least two active HR admins before a second approver can be required.",
  SETTINGS_CONFLICT: "That clashes with another setting that’s already switched on. Turn the other one off first.",
  SCAN_PROVIDER_NOT_CONFIGURED: "Document scanning isn’t set up yet, so it can’t be switched on. Contact support.",
  SETTING_OUT_OF_RANGE: "That value is outside what we allow. Check the range shown beside the field.",
  INVALID_PAYOUT_COMPONENT: "That isn’t a salary component we can pay out. Pick another.",
  LETTER_REFERENCE_PATTERN_INVALID: "That reference pattern isn’t valid. It needs a sequence number in it.",
  ORG_PROFILE_NOT_FOUND: "This organisation has no profile yet, so there’s nothing to save against. Open Company Profile and fill it in first.",
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

/* ─── Writing: the refusals a screen has to ACT on ──────────────────────────
   Three of the write errors are not really errors — they are the server
   asking for one more thing before it will proceed. Each gets a predicate, so
   the card can open the right dialog instead of printing a sentence and
   leaving the person stuck. */

/**
 * Someone else saved first. The edits are still in the form, and the only
 * correct recovery is re-read, reconcile, resubmit with the fresh ETag —
 * NEVER a blind retry, which could clobber their change.
 */
export const isPreconditionFailed = (error) =>
  settingsErrorCode(error) === "SETTINGS_PRECONDITION_FAILED" || error?.status === 412;

/** The server wants a written reason before it will save this. */
export const needsReason = (error) => settingsErrorCode(error) === "SETTINGS_REASON_REQUIRED";

/** The server wants an explicit confirmation — it carries the warnings to show. */
export const needsConfirmation = (error) => settingsErrorCode(error) === "SETTINGS_CONFIRMATION_REQUIRED";

/** Either gate: the save can proceed, but only after the person is asked. */
export const needsConfirmDialog = (error) => needsReason(error) || needsConfirmation(error);

/**
 * The group's current ETag, handed back on a 412 so the screen can re-read
 * without guessing. Null when the server didn't say.
 */
export const currentEtagOf = (error) => error?.data?.details?.current_etag || null;

/**
 * Which keys the refusal is about (`details.keys[]`), for the gates and for
 * the writability refusals. Always an array.
 */
export function offendingKeys(error) {
  const keys = error?.data?.details?.keys;
  return Array.isArray(keys) ? keys : [];
}

/**
 * The catalogue's own plain-language warnings for a high-risk change
 * (`details.warnings[]` on a 409). These are written by the backend for
 * exactly this moment, so they are shown VERBATIM rather than reworded — they
 * say what the change does, and we have no better source for that.
 */
export function riskWarnings(error) {
  const warnings = error?.data?.details?.warnings;
  return Array.isArray(warnings) ? warnings.filter(Boolean) : [];
}

export default settingsErrorMessage;
