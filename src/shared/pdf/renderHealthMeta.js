// ─────────────────────────────────────────────────────────────────────────────
// renderHealthMeta.js — The render-queue health readout, shared by the two
// domains that have one: letters (#151, documents) and payslips (#221,
// payroll). PDF Generation Phase 5.
//
// Source of truth: public/ref docs/md_pdfs/phase5_api_analysis-2.md and
// pdf_generation_phase5_2026_09_29.md.
//
// The two endpoints answer the SAME shape with a different `scope`, which is
// the whole reason this file exists rather than two readers: an operator who
// learns to read the letter queue must be able to read the payslip queue
// without relearning anything. It lives in shared/pdf/ because the PDF module
// straddles documents and payroll, and neither domain folder owns the other.
//
// Four things about this data decide how it is allowed to be drawn, and every
// one of them is a way to lie by accident:
//
//  1. `failure_rate.rate` IS NULL WHEN NOTHING FINISHED. The server sends null
//     rather than 0 precisely so an idle queue can't report itself perfect.
//     Rendering null as "0%" would put a green tick on a pipeline nobody has
//     used — so `rate === null` reads "Nothing finished yet", never a figure.
//
//  2. `renderer.authenticated` IS NOT A PING. Both flags describe this server's
//     own configuration — whether it has a renderer address and a key. Nothing
//     here calls the renderer, so neither flag can promise the renderer is up,
//     and the wording must not imply it did.
//
//  3. `counters` ARE PER-PROCESS AND RESET ON DEPLOY. They come from whichever
//     node answered, so two refreshes can legitimately disagree. `queue` and
//     `failure_rate` are database-derived and fleet-wide. That is why counters
//     are a folded footnote and never a headline: a number that halves because
//     a deploy happened is worse than no number.
//
//  4. QUEUE DEPTH ON ITS OWN MEANS NOTHING. Four letters waiting is normal
//     thirty seconds after a batch and a fault thirty minutes after one. So the
//     judgement is made on the AGE of the oldest waiting job, not the count —
//     see `backlogMeta()`, whose thresholds come from the Phase 5 walkthrough
//     (under 5 minutes normal, over 30 minutes worth reporting).
//
// The response carries no ids, names, storage keys or error text by design, so
// there is nothing in here that §4 could object to — and nothing that would let
// a screen offer "which one failed?", which is what the batch inspector is for.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMinutes } from "../attendance/dates";

/** `window_hours` bounds the server validates. Outside them is 400. */
export const HEALTH_WINDOW_MIN = 1;
export const HEALTH_WINDOW_MAX = 168;
export const HEALTH_WINDOW_DEFAULT = 24;

/**
 * The windows offered on screen. A free number box would only invite the 400 —
 * these three answer the questions people actually have ("is it moving now?",
 * "was today alright?", "has this been going on all week?").
 */
export const HEALTH_WINDOWS = [
  { hours: 1, label: "The last hour" },
  { hours: 24, label: "The last 24 hours" },
  { hours: 168, label: "The last 7 days" },
];

export const healthWindowLabel = (hours) =>
  HEALTH_WINDOWS.find((w) => w.hours === Number(hours))?.label || `the last ${hours} hours`;

const payload = (res) => res?.data ?? res ?? {};

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** A figure the server is allowed to leave unanswered — null survives as null. */
const nullableNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * #151 / #221 → one shape.
 *
 * Counts are floored at zero because a count is never negative and a stray
 * minus would draw a nonsense bar. The two nullable figures — the oldest job's
 * age and the failure rate — are kept nullable on purpose: both have a real
 * "there is nothing to say" reading that a zero would hide.
 */
export function queueHealthOf(res) {
  const data = payload(res);
  const queue = data.queue || {};
  const rate = data.failure_rate || {};

  return {
    scope: String(data.scope || ""),
    windowHours: count(data.window_hours) || HEALTH_WINDOW_DEFAULT,
    renderer: {
      configured: data.renderer?.configured === true,
      authenticated: data.renderer?.authenticated === true,
    },
    queue: {
      queued: count(queue.queued),
      claimed: count(queue.claimed),
      done: count(queue.done),
      failed: count(queue.failed),
      cancelled: count(queue.cancelled),
      oldestQueuedAt: queue.oldest_queued_at || null,
      // Null means nothing is waiting. Zero would mean something is waiting and
      // arrived this instant — a different fact, and the one that reads worse.
      oldestAgeSeconds: nullableNumber(queue.oldest_queued_age_seconds),
    },
    failureRate: {
      terminal: count(rate.terminal),
      failed: count(rate.failed),
      rate: nullableNumber(rate.rate),
    },
    counters: data.counters && typeof data.counters === "object" ? data.counters : {},
    countersNote: typeof data.counters_note === "string" ? data.counters_note : "",
  };
}

// ── What the readout says ────────────────────────────────────────────────────

/**
 * Whether this server can draw anything at all.
 *
 * Deliberately three states, not two. "Configured but holding no key" is the
 * one an administrator can fix in an afternoon, and it is invisible until
 * somebody issues a letter and gets a 503 — which is exactly the support call
 * this readout exists to prevent.
 */
export function rendererStateMeta(renderer, { noun = "letters" } = {}) {
  if (!renderer?.configured) {
    return {
      key: "off",
      label: "Not set up",
      tone: "rose",
      note: `This server hasn’t been told where to draw ${noun}, so none can be produced. Everything already saved is safe — ask your administrator to switch letter rendering on.`,
    };
  }
  if (!renderer.authenticated) {
    return {
      key: "unkeyed",
      label: "Set up, no key",
      tone: "fuchsia",
      note: `A drawing service is configured but this server holds no key for it, so ${noun} are likely to be turned away. Ask your administrator to check the key.`,
    };
  }
  return {
    key: "ready",
    label: "Set up",
    tone: "violet",
    // Says exactly what was checked. Nothing here contacted the renderer.
    note: `This server has an address and a key for the service that draws ${noun}. That isn’t a test of the service itself — it means nothing is missing at this end.`,
  };
}

/** Under this, a wait is ordinary. Over the second, it is worth reporting. */
export const BACKLOG_WARN_SECONDS = 5 * 60;
export const BACKLOG_ALERT_SECONDS = 30 * 60;

/**
 * How the queue is moving, judged on the OLDEST wait rather than the depth —
 * a thousand jobs queued a moment ago is a healthy busy queue, and one job
 * queued an hour ago is a stuck one.
 */
export function backlogMeta(queue, { noun = "letters" } = {}) {
  const waiting = count(queue?.queued) + count(queue?.claimed);
  const age = queue?.oldestAgeSeconds;

  if (waiting === 0) {
    return { tone: "violet", headline: "Nothing waiting", note: `Every ${noun.replace(/s$/, "")} asked for so far has been drawn.` };
  }
  if (age === null || age < BACKLOG_WARN_SECONDS) {
    return { tone: "indigo", headline: "Moving", note: "Being drawn now. Nothing has been waiting long." };
  }
  if (age < BACKLOG_ALERT_SECONDS) {
    return {
      tone: "fuchsia",
      headline: "Slower than usual",
      note: `Something has been waiting ${fmtMinutes(Math.round(age / 60))}. Preparing them now usually clears it.`,
    };
  }
  return {
    tone: "rose",
    headline: "Held up",
    note: `Something has been waiting ${fmtMinutes(Math.round(age / 60))}. Try preparing them now, and tell your administrator if that doesn’t move it.`,
  };
}

/** Above this share of finished jobs failing, something is wrong rather than unlucky. */
export const FAILURE_RATE_ALERT = 0.02;

/**
 * The trailing failure rate, in words.
 *
 * `rate === null` is the case worth being careful about: it means nothing
 * finished inside the window, which is not a clean bill of health and must not
 * be drawn as one.
 */
export function failureRateMeta(failureRate, { windowHours = HEALTH_WINDOW_DEFAULT } = {}) {
  const rate = failureRate?.rate;
  // Lowercased: every use below is mid-sentence ("in the last 24 hours").
  const when = healthWindowLabel(windowHours).toLowerCase();

  if (rate === null || failureRate?.terminal === 0) {
    return {
      tone: "slate",
      value: "N/A",
      note: `Nothing was drawn in ${when}, so there is no success rate to report. That isn’t a problem on its own.`,
    };
  }
  const pct = formatRate(rate);
  if (rate > FAILURE_RATE_ALERT) {
    return {
      tone: "rose",
      value: pct,
      note: `${failureRate.failed} of ${failureRate.terminal} didn’t come out in ${when}. Open a recent batch to see which, and why.`,
    };
  }
  if (failureRate.failed > 0) {
    return {
      tone: "fuchsia",
      value: pct,
      note: `${failureRate.failed} of ${failureRate.terminal} in ${when}. Each batch says which of its own failed, and why.`,
    };
  }
  return {
    tone: "violet",
    value: pct,
    note: `All ${failureRate.terminal} drawn in ${when} succeeded.`,
  };
}

/**
 * A ratio as a percentage. Two decimals below 1% because the interesting
 * failure rates live there — "0%" and "0.37%" are very different answers.
 */
export function formatRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "N/A";
  const pct = n * 100;
  if (pct === 0) return "0%";
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/** How long the oldest waiting job has waited, or N/A when nothing is waiting. */
export const oldestWaitLabel = (queue) =>
  queue?.oldestAgeSeconds === null || queue?.oldestAgeSeconds === undefined
    ? "N/A"
    : fmtMinutes(Math.round(queue.oldestAgeSeconds / 60));

/**
 * The per-process counters, as rows worth showing.
 *
 * The keys arrive as `pdf.render.total|engine=html,source_type=letter` — a
 * metric name and a tag string. Nobody should have to read that, so the tags
 * become a subtitle and the counters are folded away by default. Zero-valued
 * counters are dropped: the server sends the full key space, most of it empty.
 */
export function counterRows(counters) {
  return Object.entries(counters || {})
    .map(([key, value]) => {
      const [name, tags = ""] = String(key).split("|");
      return {
        key,
        name: name.replace(/^pdf\.render\./, "").replace(/[._]/g, " "),
        tags: tags.split(",").filter(Boolean).map((t) => t.replace("=", " ")).join(" · "),
        value: Number(value) || 0,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * This server doesn't have the readout yet, as opposed to the readout failing.
 *
 * Phase 5's two health routes don't exist on an older server, which answers 404
 * (or, if `/jobs/` itself is unknown, 404 again). Either way the honest UI is to
 * show nothing at all rather than a red box about a feature nobody asked for —
 * §7's "absent key → hidden feature", applied to a whole endpoint.
 *
 * A 403 is treated the same way: the caller lacks the feature, so the readout
 * is not theirs to see. Everything else IS a failure and is reported.
 */
export const queueHealthUnavailable = (err) => err?.status === 404 || err?.status === 403;
