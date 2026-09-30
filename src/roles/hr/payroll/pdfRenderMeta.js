// ─────────────────────────────────────────────────────────────────────────────
// pdfRenderMeta.js — The payslip cache and the background render queue
// (#219 prepare, #220 status, #174's `202`, payroll settings #88–#90).
//
// Source of truth: public/ref docs/md_pdfs/phase3_api_analysis-2.md, and — for
// everything since 30 Sep 2026 — public/ref docs/new updates/
// pdf_html_only_migration_2026_09_30.md and
// 2026-09-30_html_only_renderer_migration_plan.md §11.
//
// THERE IS ONE ENGINE NOW. Until 30 Sep 2026 every organisation started on the
// in-process "classic" engine and opted into HTML rendering with
// `pdf_render_engine`; every control in this file was gated on that choice.
// PDFKit has been deleted server-side, so:
//  · `pdf_render_engine` is inert. It still validates and is still returned,
//    but it changes nothing and will be dropped — the settings screen no longer
//    shows it and no longer SENDS it (see `pdfCacheChanges`).
//  · #220 and #219 always report `engine: "html"`, so the "classic" branches
//    that used to live here are gone rather than kept as dead code.
//  · Held payslips are now drawn the same way as released ones (never cached).
//
// AND WHOLE-RUN WORK CAN BE PAUSED. Ops switch `PDF_BULK_GENERATION_ENABLED`
// (off by default) makes the run ZIP (#174) and "prepare this run" (#219 with a
// `run_id`) answer `503 PDF_BULK_GENERATION_DISABLED` — see
// shared/pdf/bulkGeneration.js. Publishing a run then prepares nothing in the
// background either; each payslip is drawn the first time it is downloaded.
// #219 WITHOUT a run id still drains whatever was queued earlier.
//
// Facts from Phase 3 that still hold:
//  1. `uncacheable` on #220 counts payslips that are never kept ready (held, or
//     approved before payslips were snapshotted), which is why readiness is the
//     server's `will_stream` — `ready + uncacheable === total` — and never
//     `ready === total`, which would poll for ever.
//  2. `#174` may answer `202` instead of a file once bulk is back on. It is a
//     SUCCESS, and `response.ok` is true for it — see the `acceptJson` note in
//     shared/utils/download.js for the corrupt-ZIP trap.
//
// Live deviations recorded 2026-09-28, still true: `pdf_cache_retention_days`
// defaults to 400 (not 365); #220's `batch` block carries no `id`; #219 ignores
// unknown body keys. Nothing here relies on the last two.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The payslip-cache settings this screen still edits (#88–#90). The inert
 * `pdf_render_engine` (#87) is deliberately NOT here: it is neither shown nor
 * sent back, as the migration notes ask.
 */
export const PDF_CACHE_SETTING_KEYS = [
  "payslip_prerender_on_publish",
  "pdf_bulk_inline_miss_threshold",
  "pdf_cache_retention_days",
];

/** Has this server returned the payslip-cache settings at all? */
export const hasPdfCacheSettings = (settings) =>
  !!settings && PDF_CACHE_SETTING_KEYS.some((key) => key in settings);

/** The numeric settings, with the server's own bounds. */
export const PDF_CACHE_NUMBERS = {
  pdf_bulk_inline_miss_threshold: {
    min: 1,
    max: 500,
    fallback: 50,
    label: "Prepare in the background above",
    unit: "payslips",
    hint: "When a run has more payslips left to prepare than this, downloading them all starts in the background instead of making you wait. Only used while whole-run downloads are switched on.",
  },
  pdf_cache_retention_days: {
    min: 30,
    max: 3650,
    fallback: 400,
    label: "Keep prepared payslips for",
    unit: "days",
    hint: "How long a prepared copy is kept before it is cleared. Clearing one costs nothing — it is rebuilt the next time somebody downloads it.",
  },
};

/** Why this number can't be saved, or "". */
export function pdfNumberProblem(key, value) {
  const rule = PDF_CACHE_NUMBERS[key];
  if (!rule) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "Enter a whole number.";
  if (n < rule.min || n > rule.max) return `Between ${rule.min} and ${rule.max} ${rule.unit}.`;
  return "";
}

/**
 * The settings body with the inert engine field taken OUT.
 *
 * The settings page PUTs the whole object it read, and the read still returns
 * `pdf_render_engine`. The migration notes ask the frontend to stop sending it
 * before the column is dropped — once it is, a PUT that still carried it would
 * be an unknown key and fail the entire save.
 *
 * An emptied number box is also dropped rather than sent: `Number("")` is 0,
 * which is below both minimums and would read as a deliberate choice.
 */
export function withoutInertPdfSettings(settings) {
  if (!settings) return settings;
  // eslint-disable-next-line no-unused-vars
  const { pdf_render_engine, ...rest } = settings;
  Object.keys(PDF_CACHE_NUMBERS).forEach((key) => {
    if (!(key in rest)) return;
    const raw = rest[key];
    if (raw === "" || raw === null || raw === undefined) delete rest[key];
    else if (Number.isFinite(Number(raw))) rest[key] = Math.round(Number(raw));
  });
  return rest;
}

// ── The render queue (#220) ─────────────────────────────────────────────────
/**
 * #220 → one flat, safely-typed object.
 *
 * Everything is coerced, because a poller that reads `undefined` as 0 would show
 * "0 of 0 ready" and call it finished. `willStream` is taken from the server and
 * never recomputed: only the server knows how many payslips are `uncacheable`
 * (held, or approved before payslips were snapshotted), and those never become
 * "ready" no matter how long you wait.
 */
export function renderStatusOf(res) {
  const data = res?.data ?? res ?? {};
  const count = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const batch = data.batch && typeof data.batch === "object" ? data.batch : null;
  return {
    runId: data.run_id || "",
    total: count(data.total),
    ready: count(data.ready),
    queued: count(data.pending?.queued),
    claimed: count(data.pending?.claimed),
    failed: count(data.failed),
    uncacheable: count(data.uncacheable),
    willStream: data.will_stream === true,
    batch: batch
      ? {
        id: batch.id || "",
        queued: count(batch.queued),
        claimed: count(batch.claimed),
        done: count(batch.done),
        failed: count(batch.failed),
        cancelled: count(batch.cancelled),
      }
      : null,
  };
}

/** Payslips still being prepared right now. */
export const stillPreparing = (status) => (status ? status.queued + status.claimed : 0);

/**
 * How far along, 0–100.
 *
 * `uncacheable` counts as settled rather than outstanding — those payslips are
 * drawn on the spot when the ZIP is built and are never waited for. Counting
 * them as unfinished would leave a run with a held payslip stuck at 99% for ever.
 */
export function renderPercent(status) {
  if (!status || status.total <= 0) return null;
  const settled = Math.min(status.total, status.ready + status.uncacheable);
  return Math.round((settled / status.total) * 100);
}

/** A run whose payslips are all prepared has nothing worth showing a progress bar for. */
export const isFullyPrepared = (status) => !!status && status.total > 0 && status.willStream;

/**
 * One sentence about where a run's payslips have got to.
 *
 * Written for somebody who does not know the word "cache": what they want to
 * know is whether pressing Download all will work now or make them wait.
 */
export function renderStatusLine(status, { bulkPaused = false } = {}) {
  if (!status) return "";
  if (status.total === 0) return "This run has no payslips yet.";
  if (status.willStream) {
    return status.failed > 0
      ? `All ${status.total} payslips are ready to download. ${status.failed} had to be prepared more than once.`
      : `All ${status.total} payslips are ready to download.`;
  }
  const waiting = stillPreparing(status);
  const done = status.ready + status.uncacheable;
  if (waiting > 0) {
    return `${done} of ${status.total} payslips ready — ${waiting} still being prepared.`;
  }
  return bulkPaused
    ? `${done} of ${status.total} payslips ready. The rest are prepared the first time each one is downloaded.`
    : `${done} of ${status.total} payslips ready. The rest are prepared as they're downloaded, or all at once with Prepare PDFs.`;
}

/** Why some payslips will never show as "ready", or "" when none apply. */
export function uncacheableNote(status) {
  if (!status?.uncacheable) return "";
  const n = status.uncacheable;
  return `${n} ${n === 1 ? "payslip is" : "payslips are"} still held back from employees, so ${n === 1 ? "it is" : "they are"} made fresh each time rather than kept ready. ${n === 1 ? "It looks" : "They look"} exactly like the released ones, and nothing is missing from the download.`;
}

// ── The async bulk download (#174 → 202) ────────────────────────────────────
/**
 * The `202` body → what the screen needs.
 *
 * `poll_url` is deliberately IGNORED. It is a full API path the server built,
 * and following it would mean a second way of calling #220 that bypasses the
 * api layer, the session token and the error shape. The run id is all that is
 * needed to ask the same question through `getPayslipRenderStatus()`.
 */
export function enqueuedBatchOf(data) {
  const body = data?.data ?? data ?? {};
  const count = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    runId: body.run_id || "",
    batchId: body.batch_id || "",
    total: count(body.total),
    ready: count(body.ready),
    queued: count(body.queued),
  };
}

/** Did `downloadFile()` come back with a queued batch instead of a file? */
export const wasEnqueued = (result) => result?.enqueued === true;

// ── Polling (#220) ──────────────────────────────────────────────────────────
/**
 * Every 3 seconds, for at most 10 minutes.
 *
 * The interval is the documented one (2–3s). The ceiling exists because a poller
 * with no end is a poller that runs until the tab is closed: a stuck queue would
 * quietly hammer the server all afternoon and nobody would ever be told. Ten
 * minutes covers a few thousand payslips at the worker's cadence, and hitting it
 * shows a message rather than failing silently.
 */
export const RENDER_POLL_MS = 3000;
export const RENDER_POLL_CEILING_MS = 10 * 60 * 1000;
export const RENDER_POLL_MAX_TICKS = Math.ceil(RENDER_POLL_CEILING_MS / RENDER_POLL_MS);

// ── Preparing on demand (#219) ──────────────────────────────────────────────
/** #219 → its tallies, safely typed. */
export function drainResultOf(res) {
  const data = res?.data ?? res ?? {};
  const count = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    enqueued: count(data.enqueued),
    claimed: count(data.claimed),
    done: count(data.done),
    failed: count(data.failed),
    remaining: count(data.remaining),
  };
}

/**
 * What to say after pressing Prepare.
 *
 * All zeros is a SUCCESS and must read like one: nothing was waiting. (It used
 * to also be the classic engine's answer; that engine is gone, and #219 now
 * always reports `engine: "html"`.)
 */
export function drainMessage(result) {
  if (!result) return "Nothing to prepare.";
  if (result.done > 0) {
    const rest = result.remaining > 0 ? ` ${result.remaining} still to go — press it again in a moment.` : "";
    return `${result.done} payslip${result.done === 1 ? "" : "s"} prepared.${rest}`;
  }
  if (result.remaining > 0) {
    return `${result.remaining} payslip${result.remaining === 1 ? " is" : "s are"} queued and being prepared in the background.`;
  }
  if (result.failed > 0) {
    return `${result.failed} payslip${result.failed === 1 ? "" : "s"} couldn’t be prepared. They will still download — they are made on the spot instead.`;
  }
  return "Everything is already prepared.";
}
