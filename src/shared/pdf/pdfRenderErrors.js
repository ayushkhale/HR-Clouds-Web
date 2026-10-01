// ─────────────────────────────────────────────────────────────────────────────
// pdfRenderErrors.js — What a failed PDF download means, in words, for every
// PDF the backend produces (payslips, annual statements, Form 16, report PDFs,
// bank advice, F&F statements, the statutory summary — and letters).
//
// Source of truth: public/ref docs/new updates/pdf_html_only_migration_2026_09_30.md
// and 2026-09-30_html_only_renderer_migration_plan.md §11.
//
// Since 30 Sep 2026 every PDF is drawn by one external renderer; the in-process
// PDFKit engine is gone. Downloads that could never fail "for renderer reasons"
// now can, and the codes below are the whole vocabulary of that. It lives in
// shared/pdf/ because payroll and documents both speak it and neither owns it.
// No imports: payrollErrors.js and documentErrors.js both read from here.
//
// Four rules the docs set, each encoded below rather than left to screens:
//  1. `409 PDF_RENDER_IN_PROGRESS` — the SAME document is being drawn by another
//     request. Waiting ~2 s and asking once more is the answer (renderedPdf.js
//     does it silently), and a second 409 is shown as "still being prepared".
//  2. `500 PDF_RENDER_FAILED`, `502`, `504` — a manual retry is safe and never
//     creates a duplicate: a failed attempt no longer poisons the document (D5).
//  3. `503 PDF_RENDERER_NOT_CONFIGURED` and `500 PDF_PAYLOAD_TOO_LARGE` — do NOT
//     invite a retry. One is an administrator's fix, the other won't shrink.
//  4. `503 PDF_BULK_GENERATION_DISABLED` — an ops switch, not a fault. Never
//     auto-retried; the whole-run actions say they're paused (bulkGeneration.js).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Written for somebody downloading a document, not for an operator. None of
 * them names the renderer, the queue or the engine.
 */
export const PDF_RENDER_MESSAGES = {
  PDF_RENDER_IN_PROGRESS: "This PDF is still being prepared by another request. Give it a few seconds and download it again.",
  PDF_RENDER_FAILED: "The PDF couldn’t be generated. Nothing was lost — try the download again.",
  PDF_PAYLOAD_TOO_LARGE: "This document has too much in it to turn into a PDF. Download the CSV instead, or narrow what it covers.",
  PDF_RENDERER_UNAVAILABLE: "PDFs can’t be generated right now. Please try again shortly.",
  PDF_RENDER_TIMEOUT: "Generating this PDF took too long and was stopped. Nothing was lost — try the download again.",
  STORAGE_UNAVAILABLE: "The PDF was generated but couldn’t be stored. Please try again shortly.",
  PDF_RENDERER_NOT_CONFIGURED: "PDF generation isn’t available on this server yet, so no PDF can be downloaded. Ask your administrator to switch it on.",
  PDF_BULK_GENERATION_DISABLED: "Downloading a whole set of PDFs at once is paused for now. Download them one at a time instead.",
};

const codeOf = (err) => err?.data?.errorCode || err?.data?.code || "";

/** The PDF-specific code on this error, or "". */
export const pdfErrorCode = (err) => (codeOf(err) in PDF_RENDER_MESSAGES ? codeOf(err) : "");

/** The message for a PDF-specific refusal, or "" when this isn't one. */
export const pdfRenderMessage = (err) => PDF_RENDER_MESSAGES[pdfErrorCode(err)] || "";

export const isRenderInProgressError = (err) => codeOf(err) === "PDF_RENDER_IN_PROGRESS";

/** The ops switch that blocks every "whole set at once" action (#174, #143, #219 with a run). */
export const isBulkGenerationDisabled = (err) => codeOf(err) === "PDF_BULK_GENERATION_DISABLED";

/** No PDF can be made on this server at all. Not worth retrying. */
export const isRendererNotConfiguredError = (err) => codeOf(err) === "PDF_RENDERER_NOT_CONFIGURED";

/**
 * Whether pressing the button again is a sensible thing to suggest.
 *
 * True for the transient failures the docs call retry-safe; false for the two
 * that won't change on their own and for the bulk switch.
 */
export function isPdfRetryable(err) {
  const code = codeOf(err);
  if (["PDF_RENDERER_NOT_CONFIGURED", "PDF_PAYLOAD_TOO_LARGE", "PDF_BULK_GENERATION_DISABLED"].includes(code)) return false;
  if (["PDF_RENDER_FAILED", "PDF_RENDERER_UNAVAILABLE", "PDF_RENDER_TIMEOUT", "STORAGE_UNAVAILABLE", "PDF_RENDER_IN_PROGRESS"].includes(code)) return true;
  return err?.status === 502 || err?.status === 504;
}
