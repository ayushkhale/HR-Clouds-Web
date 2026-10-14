// ─────────────────────────────────────────────────────────────────────────────
// renderedPdf.js — Download, or show on screen, one generated PDF.
//
// A thin layer over `downloadFile()` (shared/utils/download.js), which already
// refuses to save an error body as a file and throws the JSON envelope in the
// shape `request()` does. The one thing it adds is the documented answer to
// `409 PDF_RENDER_IN_PROGRESS`: another request is drawing the same document
// right now, so wait ~2 s and ask once more. The second answer is either the
// file or the same 409, which the caller shows as "still being prepared".
//
// `previewRenderedPdf()` is the same call for a viewer rather than a save: it
// keeps the bytes instead of writing a file, and asks for `disposition=inline`
// (2026-10-14 change record §3).
//
// CONTRACT TRAP, and it is the reassuring kind: that change record claims every
// payroll PDF route honours the parameter (§3.1) but lists only some of them
// (§3.2) — the HR annual statement and HR Form 16 are absent. It does not
// matter here. Nothing reads `Content-Disposition`: the bytes are fetched and
// shown from an object URL, so a route that ignores the parameter still
// previews. The parameter is sent because it is correct where it is honoured,
// never because the preview depends on it. `format=csv` pins `attachment`
// deliberately, so never route a CSV through here.
//
// That table's PATHS are loose too — it writes the manager route as
// `/manager/subordinates/:id/payslips/...` and the self annual statement as
// `/me/annual-statements/:fy/pdf`, where the live routes (and `api_registry.md`)
// are `/manager/employees/:userId/payslips/:runId/pdf` and
// `/me/annual-statement/pdf`. The endpoints in `payroll.api.js` are the working
// ones; don't "correct" them against that table.
//
// Only for single-document PDFs. The run ZIP (#174) is a whole-set call with
// its own 202/poll contract and goes through downloadFile directly.
// ─────────────────────────────────────────────────────────────────────────────

import { downloadFile, fetchFileBlob } from "../utils/download";
import { isRenderInProgressError } from "./pdfRenderErrors";

export const RENDER_IN_PROGRESS_RETRY_MS = 2000;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * @param {string} endpoint path after the API base
 * @param {{ params?: object, filename?: string }} [options] passed to downloadFile
 * @returns {Promise<{ filename: string, size: number }>}
 */
export async function downloadRenderedPdf(endpoint, options = {}) {
  try {
    return await downloadFile(endpoint, options);
  } catch (err) {
    if (!isRenderInProgressError(err)) throw err;
    await wait(RENDER_IN_PROGRESS_RETRY_MS);
    return downloadFile(endpoint, options);
  }
}

/**
 * The same PDF, kept in memory for a viewer. Same 409 retry, because a document
 * being drawn is just as likely on the way to the screen as on the way to disk.
 *
 * @param {string} endpoint path after the API base
 * @param {{ params?: object, filename?: string }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, contentType: string, size: number }>}
 */
export async function previewRenderedPdf(endpoint, options = {}) {
  // `disposition` is added rather than replacing `params`, so a caller's
  // `version`, `financial_year` or `format` still goes out with it.
  const withInline = { ...options, params: { ...(options.params || {}), disposition: "inline" } };
  try {
    return await fetchFileBlob(endpoint, withInline);
  } catch (err) {
    if (!isRenderInProgressError(err)) throw err;
    await wait(RENDER_IN_PROGRESS_RETRY_MS);
    return fetchFileBlob(endpoint, withInline);
  }
}
