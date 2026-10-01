// ─────────────────────────────────────────────────────────────────────────────
// bulkGeneration.js — Whether "make a whole set of PDFs at once" is paused on
// this server, as far as this tab has learned.
//
// Since 30 Sep 2026 ops can switch off every fan-out PDF call with one flag
// (`PDF_BULK_GENERATION_ENABLED`, off by default). Three calls answer
// `503 PDF_BULK_GENERATION_DISABLED` while it is off: the run payslip ZIP
// (#174), bulk letter issue (#143) and "prepare this run's payslips" (#219 WITH
// a run id). Nothing ADVERTISES the switch — there is no endpoint to ask — so
// it is discovered the first time one of those calls is refused, and
// remembered for the session so every other whole-set button can say "paused"
// up front instead of letting somebody press it and be refused again.
//
// Deliberately in memory only, never localStorage: turning bulk back on needs
// no frontend release (the docs are explicit), so a reload must be enough for
// the buttons to come back. Nothing here ever retries on its own — the docs
// forbid auto-retry for this code.
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";
import { isBulkGenerationDisabled } from "./pdfRenderErrors";

let paused = false;
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => paused;

/** Record that the server refused a whole-set call. */
export function markBulkGenerationPaused() {
  if (paused) return;
  paused = true;
  listeners.forEach((notify) => notify());
}

/** Forget it — after a whole-set call succeeds, the switch is evidently back on. */
export function markBulkGenerationAvailable() {
  if (!paused) return;
  paused = false;
  listeners.forEach((notify) => notify());
}

/**
 * Remember the switch if this error is its refusal.
 * @returns {boolean} true when it was — the caller shows the paused state
 *   instead of an error.
 */
export function noteBulkRefusal(err) {
  if (!isBulkGenerationDisabled(err)) return false;
  markBulkGenerationPaused();
  return true;
}

/** True once this tab has been told whole-set PDF generation is paused. */
export const useBulkGenerationPaused = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/** The one sentence every paused whole-set action shows. */
export const BULK_PAUSED_NOTE = "Making a whole set of PDFs at once is paused on this server for now. Single downloads still work — everything already started will still finish.";
