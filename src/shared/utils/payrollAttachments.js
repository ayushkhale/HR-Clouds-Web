// ─────────────────────────────────────────────────────────────────────────────
// payrollAttachments.js — The browser → S3 upload handshake and the file-type
// rules for Phase 5 documents (claim receipts, tax proofs, Form 16 Part A).
//
// The upload is: issue a pre-signed URL (payroll API) → PUT the file straight to
// S3 with a bare fetch → confirm (payroll API). The PUT must NOT go through
// request(): it would add an Authorization header and the API base URL, and S3
// would reject the signature. It must also NOT set Content-Length — browsers
// forbid it and derive it from the Blob. (See PAYROLL_PHASE5_FRONTEND_PLAN §5.3.)
// ─────────────────────────────────────────────────────────────────────────────

import { payrollErrorMessage } from "./payrollErrors";

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Allowed content types. `PART_A_TYPES` is the narrower set for a Form 16 Part A.
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const PART_A_TYPES = ["application/pdf"];

export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
export const PART_A_ACCEPT_ATTR = ".pdf,application/pdf";

// HR cannot confirm a Part A upload (#163 is owner-only), so the upload variant
// is off until Q-2 is answered; the reference-link variant ships. (Gap G5-1.)
export const PART_A_UPLOAD_ENABLED = false;

const EXT_TO_TYPE = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** The content type of a file: its own `type`, else inferred from the extension, else "". */
export function contentTypeOf(file) {
  if (file?.type && EXT_TO_TYPE[extOf(file.name)] === file.type) return file.type;
  if (file?.type && ALLOWED_TYPES.includes(file.type)) return file.type;
  const byExt = EXT_TO_TYPE[extOf(file?.name)];
  return byExt || file?.type || "";
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

/** File name cut to 255 characters, keeping the extension. */
export function trimFileName(name) {
  const text = String(name || "file");
  if (text.length <= 255) return text;
  const ext = extOf(text);
  const dot = ext ? `.${ext}` : "";
  return text.slice(0, 255 - dot.length) + dot;
}

/**
 * A plain problem message for a chosen file, or "" when it's fine. Checks before
 * any request so an over-size or wrong-type file never leaves the browser.
 */
export function fileProblem(file, types = ALLOWED_TYPES) {
  if (!file) return "Choose a file.";
  if (!file.size) return "That file is empty. Choose another one.";
  if (file.size > MAX_BYTES) return "That file is larger than 10 MB. Choose a smaller file.";
  const type = contentTypeOf(file);
  if (!types.includes(type)) {
    return types === PART_A_TYPES ? "Use a PDF file." : "Use a PDF, JPG, PNG or WebP file.";
  }
  return "";
}

/** Typed error carrying which stage of the upload failed. */
export class UploadError extends Error {
  constructor(stage, cause) {
    super(cause?.message || "Couldn't upload the file.");
    this.name = "UploadError";
    this.stage = stage; // "issue" | "put" | "confirm"
    this.cause = cause;
  }
}

/** A readable message for an UploadError (or any error), for the upload button. */
export function uploadErrorMessage(err) {
  if (err instanceof UploadError) {
    if (err.stage === "put") return "Couldn't send the file to storage. Try again.";
    return payrollErrorMessage(err.cause, "Couldn't upload the file. Try again.");
  }
  return payrollErrorMessage(err, "Couldn't upload the file. Try again.");
}

/**
 * PUT a file to a pre-signed S3 URL. Bare fetch: no Authorization, no
 * Content-Length. `required_headers` from the issue step are echoed back except
 * those two. Throws on a non-2xx response or a network/CORS TypeError.
 */
export async function putToSignedUrl(url, file, requiredHeaders, contentType) {
  const headers = {};
  const ct = (requiredHeaders && (requiredHeaders["Content-Type"] || requiredHeaders["content-type"])) || contentType || file.type;
  if (ct) headers["Content-Type"] = ct;
  if (requiredHeaders && typeof requiredHeaders === "object") {
    for (const [key, value] of Object.entries(requiredHeaders)) {
      if (/^content-length$/i.test(key) || /^content-type$/i.test(key)) continue;
      headers[key] = value;
    }
  }
  const res = await fetch(url, { method: "PUT", body: file, headers });
  if (!res.ok) {
    const e = new Error(`Storage rejected the upload (${res.status}).`);
    e.status = res.status;
    throw e;
  }
  return true;
}

/**
 * The full handshake for one file.
 * @param {object} opts
 * @param {(meta: {file_name, content_type, size_bytes}) => Promise} opts.issue
 * @param {(attachmentId: string) => Promise} opts.confirm
 * @param {File} opts.file
 * @returns {Promise<object>} the confirmed `available` attachment
 */
export async function uploadFile({ issue, confirm, file }) {
  const content_type = contentTypeOf(file);
  let issued;
  try {
    const res = await issue({ file_name: trimFileName(file.name), content_type, size_bytes: file.size });
    issued = res?.data ?? res;
  } catch (err) {
    throw new UploadError("issue", err);
  }
  const attachmentId = issued?.attachment_id ?? issued?.id;
  const uploadUrl = issued?.upload_url;
  if (!attachmentId || !uploadUrl) throw new UploadError("issue", new Error("Storage didn't return an upload link."));

  try {
    await putToSignedUrl(uploadUrl, file, issued?.required_headers, content_type);
  } catch (err) {
    throw new UploadError("put", err);
  }

  try {
    const res = await confirm(attachmentId);
    return res?.data ?? res ?? { id: attachmentId };
  } catch (err) {
    throw new UploadError("confirm", err);
  }
}

/** Fetch a short-lived view URL. Never cache the result — it expires (5 min). */
export async function fetchViewUrl(getViewUrl, id, params) {
  const res = await getViewUrl(id, params);
  const data = res?.data ?? res ?? {};
  return { view_url: data.view_url || data.url || "", expires_at: data.expires_at ?? null };
}

/** Is this attachment an external reference (e.g. a TRACES link), not an S3 object? */
export const isReferenceAttachment = (att) => att?.storage_backend === "reference" || !!att?.reference_url;

/** Is this attachment previewable as an image inline? */
export const isImageType = (contentType) => /^image\//.test(String(contentType || ""));
/** Is this attachment a PDF? */
export const isPdfType = (contentType) => String(contentType || "").toLowerCase() === "application/pdf";
