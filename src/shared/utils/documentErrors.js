// ─────────────────────────────────────────────────────────────────────────────
// documentErrors.js — Typed error codes of the Documents module → plain,
// actionable messages. Source: phase1_implementation_plan.md §16.1 (the error
// register), phase2_implementation_plan.md §12 (R-36…R-75), the Phase 3 note
// (documents_phase3_acknowledgements_2026_09_24.md §5) and the per-endpoint
// errors in the api_analysis documents.
//
// Always branch on the code, never on the message. `DOCUMENT_NOT_FOUND` is the
// uniform denial for every `…/documents/:id` route (missing, other org, out of
// your team, confidential, not yours) — the wording must not guess which.
// ─────────────────────────────────────────────────────────────────────────────

const GONE = "This document isn't available any more. It may have been removed, or you may no longer have access to it. Refresh to see the latest.";

export const DOCUMENT_ERROR_MESSAGES = {
  // Access
  FEATURE_NOT_AVAILABLE: "Documents aren't enabled for this organisation. Ask your administrator to turn the Documents module on.",
  MISSING_ORG_CONTEXT: "Documents are only available inside an organisation. Switch to an organisation account to continue.",
  FORBIDDEN: "You don't have permission to do this for this person or document type.",
  DOCUMENT_NOT_FOUND: GONE,
  MANAGER_ROUTE_FOR_MANAGERS: "HR decides documents from the Verification Queue; recommendations are for managers.",

  // Catalog & types
  CATALOG_ENTRY_NOT_FOUND: "One of the chosen catalog documents no longer exists. Refresh the catalog and try again — nothing was activated.",
  CATALOG_ENTRY_INACTIVE: "One of the chosen catalog documents has been withdrawn from the platform. Unselect it and try again — nothing was activated.",
  DOCUMENT_TYPE_NOT_FOUND: "That document type couldn't be found. Refresh and choose another type.",
  DOCUMENT_TYPE_INACTIVE: "This document type has been switched off, so new files can't be added to it. Ask HR to reactivate it.",
  DOCUMENT_TYPE_CODE_EXISTS: "Your organisation already has a document type with this code. Choose a different code.",
  DOCUMENT_TYPE_CODE_RESERVED: "This code belongs to a standard catalog document. Activate it from the catalog, or choose a different code.",
  DOCUMENT_TYPE_FIELD_IMMUTABLE: "The code, statutory flag and origin of a document type can't be changed. Create a new type instead.",
  DOCUMENT_TYPE_PLANE_MISMATCH: "This document type is for organisation documents, not an employee's file.",
  DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE: "Choose at least one allowed file format.",
  DOCUMENT_TYPE_IN_USE: "Documents already use this type, so it can't be removed. Deactivate it instead.",

  // Upload
  DOCUMENT_CONTENT_TYPE_NOT_ALLOWED: "This file format isn't allowed for this document type. Check the allowed formats and choose another file.",
  DOCUMENT_TOO_LARGE: "This file is larger than this document type allows. Choose a smaller file.",
  DOCUMENT_EXPIRY_REQUIRED: "This document type needs an expiry date. Add one and try again.",
  DOCUMENT_ALREADY_EXISTS: "A live document of this type already exists. Open it and use Replace to upload a newer version.",
  DOCUMENT_NOT_AWAITING_UPLOAD: "This upload has already been finished or discarded. Refresh to see its current state.",
  DOCUMENT_OBJECT_NOT_FOUND: "The file didn't reach storage. Upload it again.",
  DOCUMENT_VERIFICATION_FAILED: "The stored file didn't match what was declared (size or format). Upload the file again.",
  DOCUMENT_STORAGE_UNAVAILABLE: "Document storage isn't reachable right now. Nothing was changed — try again in a moment.",
  INVALID_REFERENCE_URL: "Enter a secure link that starts with https:// (up to 1000 characters).",

  // Review
  DOCUMENT_NOT_PENDING_VERIFICATION: "This document has already been decided. The list has been refreshed.",
  SELF_APPROVAL_NOT_ALLOWED: "Separate checker is on: you can't verify a document you uploaded or proposed. Another HR administrator must decide it.",
  RECOMMENDATION_SCOPE_STALE: "The manager who recommended this no longer manages this employee.",

  // Replace & delete
  DOCUMENT_NOT_REPLACEABLE: "Only an active or expired document can be replaced. Upload a new document instead.",
  REPLACE_ALREADY_IN_PROGRESS: "A newer version of this document is already being uploaded. Finish or discard it first.",
  DOCUMENT_VERSION_CONFLICT: "Someone else changed this document at the same time. Refresh and try again.",
  DOCUMENT_NOT_DELETABLE: "This document can't be deleted once verified. Statutory documents are always kept; for others, ask HR if a correction is needed.",

  // ── Org documents (Phase 2) ───────────────────────────────────────────────
  // Authoring a draft
  FLAG_CANNOT_BE_LOWERED: "This document type always requires acknowledgement or a signature, so that can't be switched off here. You can ask for more than the type requires, never less.",
  ACK_DUE_DAYS_REQUIRED: "Say how many days people get to acknowledge this — between 1 and 365.",
  EFFECTIVE_WINDOW_INVALID: "The end date is before the start date. Fix the dates and try again.",
  TARGET_DEPARTMENT_UNKNOWN: "One of the chosen departments no longer exists. Refresh and pick the audience again — nothing was saved.",
  TARGET_LOCATION_UNKNOWN: "One of the chosen locations no longer exists. Refresh and pick the audience again — nothing was saved.",
  TARGET_USER_UNKNOWN: "One of the chosen people is no longer an active member of this organisation. Remove them and try again.",
  IMMUTABLE_FIELD: "The document type can't be changed once the draft exists. Delete this draft and start a new one.",
  ORG_DOCUMENT_NOT_EDITABLE: "This document has already been published, so it can't be edited. Use Publish a new version to change it.",
  UPLOAD_NOT_FOUND: "The file didn't reach storage. Upload it again.",
  INVALID_FIELD_FOR_BACKEND: "A file name can only be set on an uploaded document, and a link only on a linked one. Refresh and try again.",

  // Lifecycle
  ORG_DOCUMENT_FILE_MISSING: "The server won't issue this document because it can't see its file. If you've already attached one, this is a fault on our side rather than anything you did — please report it; re-uploading won't help.",
  INVALID_STATUS_TRANSITION: "This document isn't in a state where that's possible any more. Refresh to see where it stands.",
  ORG_DOCUMENT_ALREADY_PUBLISHED: "Someone published this a moment ago. Refresh to see the live version.",
  ORG_DOCUMENT_DRAFT_EXISTS: "A new version of this document is already being drafted. Finish or delete that draft first.",
  ORG_DOCUMENT_NOT_REPLACEABLE: "Only a published document can get a new version.",
  ORG_DOCUMENT_NOT_A_PROPOSAL: "Only a manager's proposal can be declined. To withdraw a document you wrote yourself, delete the draft or retire the published version.",
  ORG_DOCUMENT_NOT_DELETABLE: "A published document can't be deleted — retire it instead, so the people who received it keep their copy.",
  PROPOSER_SCOPE_CHANGED: "The manager who proposed this no longer manages everyone it targets. You can still publish it, and that override is recorded.",

  // Recipients
  RECIPIENT_SET_TOO_LARGE: "This document would go to more people than can be issued at once. Narrow the audience and try again.",
  RECIPIENT_ALREADY_COMPLETED: "This person has already acknowledged or signed the document, so it can't be waived now.",

  // ── Acknowledging & signing (Phase 3) ─────────────────────────────────────
  ACKNOWLEDGEMENT_NOT_REQUIRED: "This document doesn't need to be acknowledged, so there's nothing to confirm. Refresh to see the latest.",
  SIGNATURE_NOT_REQUIRED: "This document doesn't need a signature, so there's nothing to sign. Refresh to see the latest.",
  RECIPIENT_WAIVED: "HR has excused you from this document, so it doesn't need anything from you.",
  ORG_DOCUMENT_NOT_ACTIONABLE: "This document isn't open for acknowledgement or signing right now — it has either not started yet or has ended. Ask HR if you think it should be.",
  // Deliberately generic: the server never says which name it expected.
  SIGNER_NAME_MISMATCH: "That name doesn't match the name on your profile. Type your first and last name, or your display name, exactly as your profile shows it.",
  SIGNATURE_PROVIDER_UNAVAILABLE: "Signing is switched off for now because your organisation has chosen a signing service that isn't connected yet. Nothing was recorded — please tell HR.",
  EXPORT_TOO_LARGE: "This report is too big to download in one go. Narrow it down with the filters and try again.",
  RECIPIENT_NOT_FOUND: "This person didn't receive this document.",

  // Manager proposals
  MANAGER_SINGLE_TARGET_REQUIRED: "A proposal is for one team member at a time. Choose exactly one person.",

  // Settings
  SCAN_PROVIDER_NOT_CONFIGURED: "Virus scanning isn't available yet, so it can't be turned on.",
  INSUFFICIENT_CHECKERS: "Separate checker needs at least two active HR administrators. Add another HR administrator first.",
  SETTINGS_CONFLICT: "Separate checker and manager direct authority can't both be on — a manager's decision would count as their own approval. Turn one off.",
  SETTING_OUT_OF_RANGE: "One of the values is outside its allowed range.",
};

// Joi rejections name the offending field; the server text is more useful here.
const SERVER_MESSAGE_CODES = new Set(["VALIDATION_ERROR", "SETTING_OUT_OF_RANGE"]);

/** The typed code (`errorCode`; `code` kept for older envelopes). */
export function documentErrorCode(err) {
  return err?.data?.errorCode || err?.data?.code || null;
}

/**
 * @param {unknown} err  error thrown by request()
 * @param {string} [fallback]
 * @returns {string}
 */
export function documentErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = documentErrorCode(err);
  const serverMessage = typeof err?.data?.message === "string" ? err.data.message.trim() : "";

  if (err?.status === 401) return "Your session has expired. Please sign in again.";
  if (code && SERVER_MESSAGE_CODES.has(code) && serverMessage) return serverMessage.replace(/"/g, "");
  if (code && DOCUMENT_ERROR_MESSAGES[code]) return DOCUMENT_ERROR_MESSAGES[code];
  if (err?.status === 503) return DOCUMENT_ERROR_MESSAGES.DOCUMENT_STORAGE_UNAVAILABLE;
  if (err?.status >= 500) return "The server ran into a problem. Please try again shortly.";
  if (err?.status === 429) return "Too many requests. Please wait a moment and try again.";
  if (serverMessage) return serverMessage;
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(err?.message || "")) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  const message = typeof err?.message === "string" ? err.message : "";
  if (message && !/^Request failed: \d+$/.test(message)) return message;
  return fallback;
}

export const isDocumentsDisabled = (err) => {
  const code = documentErrorCode(err);
  return code === "FEATURE_NOT_AVAILABLE" || code === "MISSING_ORG_CONTEXT";
};

export const isStaleRecommendation = (err) => documentErrorCode(err) === "RECOMMENDATION_SCOPE_STALE";
export const isAlreadyDecided = (err) => documentErrorCode(err) === "DOCUMENT_NOT_PENDING_VERIFICATION";

/** Publish refused because the proposing manager lost scope — HR may override (#47). */
export const isProposerScopeChanged = (err) => documentErrorCode(err) === "PROPOSER_SCOPE_CHANGED";

/** Publish refused because the draft has no confirmed file and no link (R-56). */
export const isFileMissing = (err) => documentErrorCode(err) === "ORG_DOCUMENT_FILE_MISSING";

/** Replace refused because a draft is already open; `details.document_id` points at it (#48). */
export const isDraftAlreadyOpen = (err) => documentErrorCode(err) === "ORG_DOCUMENT_DRAFT_EXISTS";
export const openDraftId = (err) => err?.data?.details?.document_id || null;

/** The audience resolved larger than the publish limit (#47). */
export function recipientLimitDetail(err) {
  if (documentErrorCode(err) !== "RECIPIENT_SET_TOO_LARGE") return null;
  const d = err?.data?.details || {};
  return { resolved: Number(d.resolved_count) || null, limit: Number(d.limit) || null };
}

/** The document moved on under us and the screen should re-read it. */
export const isOrgDocumentStale = (err) =>
  ["INVALID_STATUS_TRANSITION", "ORG_DOCUMENT_ALREADY_PUBLISHED", "ORG_DOCUMENT_NOT_EDITABLE", "RECIPIENT_ALREADY_COMPLETED"].includes(documentErrorCode(err));

// ── Phase 3 ─────────────────────────────────────────────────────────────────
/** The recipient's state moved under us (excused, or the document stopped being open). Re-read, don't retry. */
export const isComplianceStale = (err) =>
  ["RECIPIENT_WAIVED", "ORG_DOCUMENT_NOT_ACTIONABLE", "ACKNOWLEDGEMENT_NOT_REQUIRED", "SIGNATURE_NOT_REQUIRED"].includes(documentErrorCode(err));

export const isSignerNameMismatch = (err) => documentErrorCode(err) === "SIGNER_NAME_MISMATCH";

/** 404 on an evidence read (#75 / #78) just means nothing has been recorded yet. */
export const isNoEvidence = (err) => err?.status === 404 && documentErrorCode(err) === "DOCUMENT_NOT_FOUND";

/** #77 refused because the filters match too many rows. */
export function exportTooLargeDetail(err) {
  if (documentErrorCode(err) !== "EXPORT_TOO_LARGE") return null;
  const d = err?.data?.details || {};
  return { rows: Number(d.row_count) || null, max: Number(d.max_rows) || null };
}

/** #79 answers 403 when the organisation has turned team document visibility off. */
export const isTeamVisibilityOff = (err) => err?.status === 403 && (documentErrorCode(err) === "FORBIDDEN" || !documentErrorCode(err));
