// ─────────────────────────────────────────────────────────────────────────────
// download.js — Authenticated file downloads (PDF · CSV · ZIP).
//
// `request()` always parses the body as JSON, so it cannot carry a binary
// response. Payslip PDFs, report exports, bank advice and bulk ZIPs stream real
// files, so they are fetched here: same Bearer token, failures surfaced in the
// same shape `request()` throws (so payrollErrorMessage reads them), and the
// browser's save dialog driven from a blob.
//
// The server always sends `Content-Disposition: attachment`. Reading that
// filename back requires the API to expose the header to the browser (CORS
// `exposedHeaders`); when it isn't readable we fall back to the caller's name,
// so a file never lands on disk called "download".
//
// `fetchFileBlob()` is the same fetch without the save dialog: it hands back the
// blob so a caller can show the file on screen (the letter previews render an
// inline PDF in an iframe). Both go through `fetchBinary()`, so a refusal is
// thrown in exactly the same shape either way.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE_URL, tokenHelper } from "../api/client";

/** Arrays repeat the key (`component_code=A&component_code=B`), which is what the report filters send. */
function buildQuery(params) {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") query.append(key, item);
      });
      return;
    }
    query.append(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** `filename*=UTF-8''…` wins over `filename="…"`, per RFC 6266. */
function filenameFromDisposition(header) {
  if (!header) return "";
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // A malformed encoding falls through to the plain filename below.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : "";
}

const safeName = (name) => String(name || "download").replace(/[\\/:*?"<>|]+/g, "-");

/**
 * The shared half of both downloads: send the request with the session token,
 * turn a refusal into the error shape `request()` throws, and refuse an empty
 * body. Kept private — callers want one of the two functions below.
 */
async function fetchBinary(endpoint, { params, method = "GET", body } = {}) {
  const token = tokenHelper.get();
  const response = await fetch(`${API_BASE_URL}${endpoint}${buildQuery(params)}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // A refusal (403 held payslip, 409 unpaid run, 422 too large) still comes back
  // as the normal JSON envelope — throw it the way `request()` does.
  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      // A non-JSON error body carries nothing worth showing.
    }
    const error = new Error(data?.message || `Download failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    const error = new Error("The server returned an empty file.");
    error.status = response.status;
    throw error;
  }
  return { blob, response };
}

/**
 * Fetch a file with the session token and hand it to the browser to save.
 * @param {string} endpoint path after the API base, e.g. "/payroll/hr/runs/x/bank-advice"
 * @param {{ params?: object, filename?: string, method?: string, body?: object }} [options]
 *   `filename` is the fallback used when the response's own name can't be read.
 * @returns {Promise<{ filename: string, size: number }>}
 */
export async function downloadFile(endpoint, { params, filename = "download", method = "GET", body } = {}) {
  const { blob, response } = await fetchBinary(endpoint, { params, method, body });

  const name = safeName(filenameFromDisposition(response.headers.get("Content-Disposition")) || filename);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Safari cancels the save if the object URL is revoked immediately.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename: name, size: blob.size };
}

/**
 * The same fetch, but the file comes back instead of being saved — for a
 * response the page has to SHOW rather than hand to the operating system (the
 * letter previews stream `application/pdf` inline and are rendered in an
 * iframe). The caller owns the blob: make an object URL from it and revoke that
 * URL when the view closes, or the bytes stay in memory for the whole session.
 *
 * `Cache-Control: private, no-store` on these responses is the server's, and it
 * is the reason a preview is re-fetched on every open rather than remembered.
 *
 * @param {string} endpoint path after the API base
 * @param {{ params?: object, method?: string, body?: object, filename?: string }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, contentType: string, size: number }>}
 */
export async function fetchFileBlob(endpoint, { params, method = "GET", body, filename = "download" } = {}) {
  const { blob, response } = await fetchBinary(endpoint, { params, method, body });
  return {
    blob,
    filename: safeName(filenameFromDisposition(response.headers.get("Content-Disposition")) || filename),
    contentType: response.headers.get("Content-Type") || blob.type || "",
    size: blob.size,
  };
}
