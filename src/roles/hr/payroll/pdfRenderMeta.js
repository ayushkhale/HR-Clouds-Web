// ─────────────────────────────────────────────────────────────────────────────
// pdfRenderMeta.js — How payroll PDFs are produced: the engine switch, the
// payslip cache and the background render queue. PDF Generation Phase 3
// (#219 prepare, #220 status, #174's new `202`, payroll settings #87–#90).
//
// Source of truth: public/ref docs/md_pdfs/phase3_api_analysis-2.md,
// phase3_business_walkthrough-2.md and the change record
// 2026-09-27_pdf_generation_phase3_payroll_render.md.
//
// Five facts shape everything here, and four of them are the reason this screen
// work is subtle rather than mechanical:
//
//  1. EVERY ORGANISATION IS ON THE CLASSIC ENGINE. `pdf_render_engine` defaults
//     to `'pdfkit'` and nothing in Phase 3 is reachable until HR deliberately
//     switches it. So the queue, the progress strip and the Prepare button are
//     gated on `usesHtmlEngine(settings)` — not on a feature probe, not on a
//     try/catch. An organisation that has not opted in must see the payroll
//     screens it saw yesterday, unchanged, with no new controls to wonder about.
//
//  2. THE ENGINE CHANGES NOTHING AN EMPLOYEE CAN CHECK, EXCEPT THE LOOK. An
//     HTML payslip is field-identical to the classic one — same labels, same
//     figures, same money formatting, proven field by field — but NOT
//     pixel-identical: the typography and spacing differ. Anyone comparing last
//     month's download with this month's will notice. That has to be said out
//     loud at the moment of switching, because it is the one question the
//     payroll inbox will get.
//
//  3. A HELD PAYSLIP IS ALWAYS CLASSIC. A payslip HR is still reviewing has no
//     published date yet, so it is never cached and always drawn the old way,
//     whatever the setting says. Which means a run mid-review can legitimately
//     show HR one layout and the employee another. `uncacheable` on #220 counts
//     exactly these, and it is why readiness is `ready + uncacheable === total`
//     and not `ready === total` — computing it any other way polls for ever.
//
//  4. `#174` MAY ANSWER `202` INSTEAD OF A FILE. On the HTML engine, a run whose
//     uncached payslips exceed `pdf_bulk_inline_miss_threshold` is queued rather
//     than rendered inline, and the caller is handed a batch to poll. It is a
//     SUCCESS, not an error, and `response.ok` is true for it — see the
//     `acceptJson` note in shared/utils/download.js for the corrupt-ZIP trap.
//
//  5. THE WHOLE THING IS REVERSIBLE IN ONE CLICK. Switching back to the classic
//     engine takes effect on the next download, needs no deployment and needs no
//     cleanup. That is the safety net worth telling HR about before they opt in,
//     because it is what makes trying it a small decision rather than a big one.
//
// VERIFIED AGAINST THE LIVE API 2026-09-28, and three things differ from the
// documents — recorded so nobody "corrects" them back:
//
//   a. `pdf_cache_retention_days` defaults to 400, NOT the 365 the endpoint
//      analysis claims. The change record, migration 00057 and the live
//      `GET /payroll/hr/settings` all agree on 400. The value is still read from
//      the server; 400 is only the fallback for a key that isn't there.
//   b. `#220`'s `batch` block carries NO `id`, though the spec's example shows
//      one. It is read defensively and nothing on screen depends on it.
//   c. `#219` does NOT reject unknown body keys — the spec says
//      `allowUnknown: false`, the live route answers 200 and ignores them. A bad
//      `run_id` IS rejected (400 VALIDATION_ERROR), so only the strictness
//      differs. Nothing here relies on either behaviour: only `run_id` is sent.
//
//   Also confirmed live: `#219` on the classic engine answers
//   `{ engine: "pdfkit", …all zeros }` with HTTP 200, exactly as `drainMessage()`
//   assumes, and `#220` answers `will_stream: false` on the classic engine even
//   for a fully-approved run — which is why readiness is only ever shown for an
//   organisation the SERVER agrees is on the new engine (see `serverIsClassic`).
// ─────────────────────────────────────────────────────────────────────────────

// ── The engine (setting #87) ────────────────────────────────────────────────
export const PDF_ENGINE_CLASSIC = "pdfkit";
export const PDF_ENGINE_HTML = "html";

/**
 * The four settings Phase 3 added (#87–#90).
 *
 * A screen sends one back only when the read returned it, so a server that
 * predates Phase 3 is never handed a key its validator would reject. This is the
 * same rule every other phase's settings follow.
 */
export const PDF_ENGINE_SETTING_KEYS = [
  "pdf_render_engine",
  "payslip_prerender_on_publish",
  "pdf_bulk_inline_miss_threshold",
  "pdf_cache_retention_days",
];

/** Has this server been given the Phase 3 settings at all? */
export const hasPdfEngineSettings = (settings) =>
  !!settings && PDF_ENGINE_SETTING_KEYS.some((key) => key in settings);

/** The engine in force. Anything unrecognised reads as classic, as the server does. */
export const pdfEngineOf = (settings) =>
  settings?.pdf_render_engine === PDF_ENGINE_HTML ? PDF_ENGINE_HTML : PDF_ENGINE_CLASSIC;

/**
 * Whether this organisation has opted into the new engine.
 *
 * The single gate for every Phase 3 control. Deliberately false while the
 * settings are still loading and false when they can't be read at all: the
 * classic experience is the safe one to fall back to, and a control that appears
 * a second late is far better than one that appears and then fails.
 */
export const usesHtmlEngine = (settings) => pdfEngineOf(settings) === PDF_ENGINE_HTML;

/** The two engines, in the words of somebody who has never heard of Puppeteer. */
export const PDF_ENGINE_OPTIONS = [
  {
    value: PDF_ENGINE_CLASSIC,
    label: "Classic",
    blurb: "How payroll PDFs have always been made. Every organisation starts here.",
  },
  {
    value: PDF_ENGINE_HTML,
    label: "New",
    blurb: "Same figures, tidier layout, and released payslips are kept ready so downloads are instant.",
  },
];

/** The numeric settings, with the server's own bounds. */
export const PDF_ENGINE_NUMBERS = {
  pdf_bulk_inline_miss_threshold: {
    min: 1,
    max: 500,
    fallback: 50,
    label: "Prepare in the background above",
    unit: "payslips",
    hint: "When a run has more payslips left to prepare than this, downloading them all starts in the background instead of making you wait.",
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
  const rule = PDF_ENGINE_NUMBERS[key];
  if (!rule) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "Enter a whole number.";
  if (n < rule.min || n > rule.max) return `Between ${rule.min} and ${rule.max} ${rule.unit}.`;
  return "";
}

/**
 * The Phase 3 keys in the shape the PUT wants, and ONLY the ones the read
 * returned.
 *
 * `updateSettings` sends the whole settings object, so a key invented here would
 * be sent to a server that never mentioned it — an unknown field, and a 400 that
 * would block every other setting on the page from saving too.
 */
export function pdfEngineChanges(form, saved) {
  const out = {};
  if (!saved) return out;
  if ("pdf_render_engine" in saved) out.pdf_render_engine = pdfEngineOf(form);
  if ("payslip_prerender_on_publish" in saved) out.payslip_prerender_on_publish = form?.payslip_prerender_on_publish !== false;
  Object.keys(PDF_ENGINE_NUMBERS).forEach((key) => {
    if (!(key in saved)) return;
    // An emptied box is "" and `Number("")` is 0 — which would send a zero the
    // server refuses (both of these have a minimum well above it) and look like
    // a deliberate choice. A blank keeps whatever is stored instead.
    const raw = form?.[key];
    if (raw === "" || raw === null || raw === undefined) return;
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = Math.round(n);
  });
  return out;
}

/**
 * Is HR switching the engine ON with this save? Only that direction needs a
 * warning — switching back to classic is the documented, always-allowed rollback
 * and deserves no friction at all.
 */
export const isSwitchingToHtml = (form, saved) =>
  usesHtmlEngine(form) && !usesHtmlEngine(saved);

/** What to ask before an organisation's payroll PDFs change appearance. */
export const ENGINE_SWITCH_CONFIRM =
  "Switch this organisation to the new way of making payroll PDFs?\n\n"
  + "Payslips, annual statements and Form 16 will show exactly the same figures, names and dates — but the layout and typefaces change, so anyone comparing an old download with a new one will see the difference. Tell your people before they notice it themselves.\n\n"
  + "Nothing already downloaded changes, and you can switch straight back at any time.";

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
    engine: data.engine === PDF_ENGINE_HTML ? PDF_ENGINE_HTML : PDF_ENGINE_CLASSIC,
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
 * The SERVER says this organisation is on the classic engine, whatever the
 * settings we read at mount said.
 *
 * Settings are read once; #220 is read continuously. If the two disagree — HR
 * switched back in another tab, or a stale read — the fresher answer wins for
 * anything on screen. It matters because #220 reports `will_stream: false` on
 * the classic engine even for a finished run (verified live), so a readiness
 * strip driven by the stale value would sit at "0 of 10 ready" and never move.
 *
 * Deliberately NOT folded into the gate that decides whether to CALL #220: that
 * would clear the status, which would re-open the gate, which would fetch again.
 */
export const serverIsClassic = (status) => !!status && status.engine === PDF_ENGINE_CLASSIC;

/**
 * One sentence about where a run's payslips have got to.
 *
 * Written for somebody who does not know the word "cache": what they want to
 * know is whether pressing Download all will work now or make them wait.
 */
export function renderStatusLine(status) {
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
  return `${done} of ${status.total} payslips ready. The rest are prepared as they're downloaded, or all at once with Prepare PDFs.`;
}

/** Why some payslips will never show as "ready", or "" when none apply. */
export function uncacheableNote(status) {
  if (!status?.uncacheable) return "";
  const n = status.uncacheable;
  return `${n} ${n === 1 ? "payslip is" : "payslips are"} still held back from employees, so ${n === 1 ? "it is" : "they are"} made fresh each time rather than kept ready. That is normal and nothing is missing from the download.`;
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
    engine: data.engine === PDF_ENGINE_HTML ? PDF_ENGINE_HTML : PDF_ENGINE_CLASSIC,
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
 * The classic-engine answer (all zeros) is a SUCCESS and must read like one:
 * the server did exactly what it should, which is nothing. Reporting "0 payslips
 * prepared" as though something went wrong would send HR looking for a fault
 * that doesn't exist.
 */
export function drainMessage(result) {
  if (!result) return "Nothing to prepare.";
  if (result.engine === PDF_ENGINE_CLASSIC) {
    return "Payslip PDFs are made on the spot on the classic engine, so there was nothing to prepare.";
  }
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
