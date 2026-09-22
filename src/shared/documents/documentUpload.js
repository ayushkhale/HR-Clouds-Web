// ─────────────────────────────────────────────────────────────────────────────
// documents/documentUpload.js — The browser → S3 upload for an employee
// document (plan §13.2): issue (or replace) → PUT the bytes to the signed URL →
// confirm. The binary never passes through the HRMS API.
//
// The PUT is a bare fetch (putToSignedUrl): no Authorization header and no
// Content-Length, which the browser derives from the File. Only the declared
// Content-Type is echoed, because the signature pins it.
//
// Failure after issue leaves the row in `pending_upload`. The caller shows it
// as "Upload not finished", where it can be retried or discarded; the server
// reaps it after the upload-link TTL anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { putToSignedUrl } from "../utils/payrollAttachments";
import { documentErrorMessage } from "../utils/documentErrors";
import { contentTypeOfFile, trimFileName } from "./documentMeta";

export class DocumentUploadError extends Error {
  /** @param {"issue"|"put"|"confirm"} stage */
  constructor(stage, cause, issued = null) {
    super(cause?.message || "Couldn't upload the file.");
    this.name = "DocumentUploadError";
    this.stage = stage;
    this.cause = cause;
    // The issued link, so a retry can resend the same draft instead of opening a second one.
    this.issued = issued;
    this.documentId = issued?.document_id ?? null;
  }
}

/** A readable message that says which step failed. */
export function documentUploadMessage(err) {
  if (err instanceof DocumentUploadError) {
    if (err.stage === "put") return "The file couldn't be sent to secure storage. Check your connection and try again.";
    if (err.stage === "confirm") return documentErrorMessage(err.cause, "The file was sent but couldn't be checked. Try again from the document list.");
    return documentErrorMessage(err.cause, "Couldn't start the upload. Try again.");
  }
  return documentErrorMessage(err, "Couldn't upload the file. Try again.");
}

/**
 * @param {object} opts
 * @param {(payload: object) => Promise} opts.issue   issue or replace call, bound to its subject/predecessor
 * @param {(documentId: string) => Promise} opts.confirm
 * @param {File} opts.file
 * @param {object} opts.meta  document_type_id, title, issued_on, expires_on, document_number, is_confidential
 * @param {(stage: "issue"|"put"|"confirm") => void} [opts.onStage]
 * @param {object} [opts.resume]  `err.issued` from a failed attempt: skips issue and resends to the same link
 * @returns {Promise<object>} the confirmed document
 */
export async function uploadDocument({ issue, confirm, file, meta, onStage, resume }) {
  const content_type = contentTypeOfFile(file);
  const payload = {
    ...meta,
    file_name: trimFileName(file.name),
    content_type,
    size_bytes: file.size,
  };

  let issued = resume && Date.parse(resume.expires_at || 0) > Date.now() + 5000 ? resume : null;
  if (!issued) {
    onStage?.("issue");
    try {
      const res = await issue(payload);
      const data = res?.data ?? res;
      issued = { ...data, document_id: data?.document_id ?? data?.id };
    } catch (err) {
      throw new DocumentUploadError("issue", err);
    }
  }
  const documentId = issued?.document_id;
  if (!documentId || !issued?.upload_url) {
    throw new DocumentUploadError("issue", new Error("Storage didn't return an upload link."));
  }

  onStage?.("put");
  try {
    await putToSignedUrl(issued.upload_url, file, issued.required_headers, content_type);
  } catch (err) {
    throw new DocumentUploadError("put", err, issued);
  }

  onStage?.("confirm");
  try {
    const res = await confirm(documentId);
    return res?.data ?? res ?? { id: documentId };
  } catch (err) {
    throw new DocumentUploadError("confirm", err, issued);
  }
}

/**
 * Save a file from a signed URL whose response is `Content-Disposition:
 * attachment`. Followed in place (no new tab): the browser saves it and the
 * page stays put. A new tab opened after an await can be treated as a pop-up
 * and blocked (Safari), which silently lost the download.
 */
export function triggerDownload(url) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
