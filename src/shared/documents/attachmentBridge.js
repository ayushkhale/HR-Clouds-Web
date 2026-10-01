// ─────────────────────────────────────────────────────────────────────────────
// documents/attachmentBridge.js — Telling the two kinds of leave attachment
// apart (Phase 5, #128).
//
// A leave request's `document_url` is either an ordinary https link somebody
// pasted in, or the relative path of a document already held in this portal:
// `/api/v1/documents/attachments/:id/view-url`. The second cannot be followed
// by a browser — it needs the session token, and the server works out at that
// moment whether the caller is the applicant, their manager or HR.
//
// One string, three readers, one set of rules. Everything else collapses to the
// same flat "not found".
// ─────────────────────────────────────────────────────────────────────────────

/** The id out of `/api/v1/documents/attachments/<uuid>/view-url`, or "". */
export function attachmentIdFromUrl(url) {
  const match = /\/documents\/attachments\/([0-9a-f-]{16,})\/view-url\b/i.exec(String(url || ""));
  return match ? match[1] : "";
}

/** True when this `document_url` points at a document held in this portal. */
export const isPortalAttachment = (url) => !!attachmentIdFromUrl(url);
