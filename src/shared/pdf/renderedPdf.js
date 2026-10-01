// ─────────────────────────────────────────────────────────────────────────────
// renderedPdf.js — Download one generated PDF.
//
// A thin layer over `downloadFile()` (shared/utils/download.js), which already
// refuses to save an error body as a file and throws the JSON envelope in the
// shape `request()` does. The one thing it adds is the documented answer to
// `409 PDF_RENDER_IN_PROGRESS`: another request is drawing the same document
// right now, so wait ~2 s and ask once more. The second answer is either the
// file or the same 409, which the caller shows as "still being prepared".
//
// Only for single-document PDFs. The run ZIP (#174) is a whole-set call with
// its own 202/poll contract and goes through downloadFile directly.
// ─────────────────────────────────────────────────────────────────────────────

import { downloadFile } from "../utils/download";
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
