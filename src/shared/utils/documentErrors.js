// ─────────────────────────────────────────────────────────────────────────────
// documentErrors.js — Typed error codes of the Documents module → plain,
// actionable messages. Source: phase1_implementation_plan.md §16.1 (the error
// register) and the per-endpoint errors in phase1_api_analysis.md.
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
