// ─────────────────────────────────────────────────────────────────────────────
// documents/letterProposalMeta.js — What the Phase 4 letter flows MEAN, kept
// out of the screens: the maker–checker proposal (#145/#146/#148/#149/#150) and
// the bulk batch (#143/#144/#147).
//
// Three pieces of domain knowledge live here because getting any of them wrong
// on a screen is worse than a layout bug:
//
//  · #144's SHAPE IS SETTLED, AND IT IS THE LEDGER THAT COUNTS. The two Phase 4
//    documents used to disagree (`batch.pending_count` vs `counts.pending`,
//    `queue.processing` vs `queue.claimed`); the backend reconciled it on
//    2026-09-29. The item counts live in `counts` and nowhere else — there is
//    no `batch.pending_count` — while `batch` carries only the frozen request
//    (id, template, status, total). `batch.total` and `batch.total_count` are
//    both sent and identical, so either may be read. The worker's lock state is
//    `claimed`, which is the real PostgreSQL status; `processing` never existed.
//    `queue` is DIAGNOSTIC: it counts render jobs, not letters, and is never
//    what a person is shown.
//
//  · A BATCH HANDLE EXISTS IN EXACTLY ONE PLACE. There is no "list my batches"
//    endpoint: #144 answers about an id the client was handed once. Lose it and
//    a running batch becomes unreachable. `recentLetterBatches.js` is the
//    answer, and it is why the bulk screen may not simply close on success.
//
//  · A PROPOSAL IS NOT A LETTER. It names a template and a person and nothing
//    else has happened: nothing rendered, nothing numbered, nothing in anybody's
//    portal. Every label here is written so that a manager cannot come away
//    believing a letter went out.
// ─────────────────────────────────────────────────────────────────────────────

import { documentsAPI as api } from "../api";
import { documentErrorCode, letterIssueErrorMessage } from "../utils/documentErrors";

const payload = (res) => res?.data ?? res ?? {};

// ── The maker–checker proposal ───────────────────────────────────────────────

/**
 * One adapter per audience, so the one proposals screen asks "what can this
 * viewer do?" instead of branching on the role (CLAUDE.md §2).
 *
 *   hr      — the whole organisation's queue; decides (#148/#149/#150)
 *   manager — the caller's own proposals only; raises them (#145/#146)
 *
 * A capability the plane lacks is `null` and the control is not rendered — an
 * HR administrator never sees a "New proposal" button they don't need, and a
 * manager never sees an Approve button that would 403.
 */
export const LETTER_PROPOSAL_PLANES = {
  hr: {
    key: "hr",
    // Every proposal in the organisation, whoever raised it.
    list: (params) => api.getLetterProposals(params),
    propose: null,
    approve: (id, body) => api.approveLetterProposal(id, body),
    reject: (id, body) => api.rejectLetterProposal(id, body),
    // #148 takes `proposed_by`; #146 ignores it (it is always the caller).
    filtersByProposer: true,
    catalog: () => api.getLetterTemplates({ enabled: true }),
    templateDetail: (code) => api.getLetterTemplate(code),
    settings: () => api.getSettings(),
  },
  manager: {
    key: "manager",
    list: (params) => api.getMyLetterProposals(params),
    propose: (body) => api.proposeLetter(body),
    approve: null,
    reject: null,
    filtersByProposer: false,
    /**
     * The manager plane's own catalogue read, added on 2026-09-29 because
     * Phase 4 shipped the write (#145) without it: a manager could be given the
     * right to propose a letter and no endpoint to name one from. `?enabled=true`
     * because a switched-off letter can't be proposed either.
     */
    catalog: () => api.getManagerLetterTemplates({ enabled: true }),
    templateDetail: (code) => api.getManagerLetterTemplate(code),
    settings: () => api.getManagerSettings(),
  },
};

/**
 * Can this viewer actually raise a proposal?
 *
 * Two independent facts, and the screen asks for both rather than assuming
 * either (CLAUDE.md §7): the organisation has opened the path
 * (`manager_can_propose_letters`, #93, default OFF), and at least one letter is
 * switched on to propose. A `null` setting means the read hasn't answered yet,
 * which is not the same as `false` — a button that flickers in after a slow
 * read is better than one offered before we know it will work.
 */
export const canRaiseProposal = (plane, { settingOn, templates }) =>
  !!plane.propose && settingOn === true && (templates || []).some((row) => row.is_enabled && !row.is_orphaned);

/** #146 / #148 → `{ rows, total, limit, offset }`. Paginates with limit/offset, not page. */
export function proposalsPayload(res) {
  const data = payload(res);
  const rows = [data.proposals, data.rows, data.items, data.records].find(Array.isArray) || [];
  const total = Number(data.total);
  return {
    rows,
    total: Number.isFinite(total) ? total : rows.length,
    limit: Number(data.limit) || rows.length,
    offset: Number(data.offset) || 0,
  };
}

/** #145 / #150 → the proposal row. #149 nests it beside the letter it issued. */
export const proposalOf = (res) => payload(res).proposal || null;
/** #149 → the letter that now exists because the proposal was approved. */
export const approvedLetterOf = (res) => payload(res).letter || null;
/** #149 → `true` when this approval had already happened and no second letter was made. */
export const proposalWasReused = (res) => payload(res).reused === true;

/**
 * The four states a proposal can be in.
 *
 * `cancelled` is in the filter list because #146/#148 accept it, but nothing in
 * this phase can reach it — there is no endpoint for a manager to withdraw a
 * proposal. It is therefore described, never offered as an action.
 */
export const PROPOSAL_STATES = {
  pending: {
    label: "Waiting on HR",
    short: "Waiting",
    tone: "amber",
    hint: "HR hasn’t decided yet. No letter exists and nothing has reached the employee.",
  },
  approved: {
    label: "Approved — letter issued",
    short: "Issued",
    tone: "emerald",
    hint: "HR approved it and the letter was issued. It is in the employee’s portal.",
  },
  rejected: {
    label: "Turned down",
    short: "Turned down",
    tone: "rose",
    hint: "HR turned it down and gave a reason. No letter was issued.",
  },
  cancelled: {
    label: "Withdrawn",
    short: "Withdrawn",
    tone: "slate",
    hint: "This proposal was withdrawn before anyone decided it.",
  },
};

export const proposalStateMeta = (status) =>
  PROPOSAL_STATES[String(status || "").toLowerCase()] || { label: "Unknown", short: "Unknown", tone: "slate", hint: "" };

/** Tabs over the queue. HR opens on what is waiting; so does a manager. */
export const PROPOSAL_STATUS_FILTERS = [
  { value: "pending", label: "Waiting on HR" },
  { value: "approved", label: "Issued" },
  { value: "rejected", label: "Turned down" },
  { value: "", label: "All" },
];

export const isProposalPending = (row) => String(row?.status || "").toLowerCase() === "pending";

/** #150 caps the reason at 500; it is also the one field it refuses to do without. */
export const PROPOSAL_REASON_MAX = 500;
export const DECISION_REASON_MAX = 500;

/**
 * What went wrong deciding a proposal, in words.
 *
 * Two of #149's refusals use codes that already existed for uploaded documents,
 * where the shared copy talks about verifying a file — on this screen the act is
 * approving a letter, so those two are re-answered here. Everything else falls
 * through to the issue copy, because approving IS issuing and inherits every
 * render failure #139 has.
 */
export function proposalDecisionErrorMessage(err, fallback = "Couldn’t issue this letter.") {
  const code = documentErrorCode(err);
  if (code === "SELF_APPROVAL_NOT_ALLOWED") {
    return "Your organisation asks for a second pair of eyes, so whoever drafted a letter can’t be the one who approves it. Another HR administrator has to decide this one.";
  }
  if (code === "LETTER_PROPOSAL_NOT_PENDING") {
    return "Somebody has already decided this one, so nothing changed and no second letter was issued. Refresh to see what they decided.";
  }
  return letterIssueErrorMessage(err, fallback);
}

/** Why this proposal can't be decided, in words, or "" when it can. */
export function proposalDecisionBlocker(row) {
  if (!row) return "";
  if (!isProposalPending(row)) {
    const meta = proposalStateMeta(row.status);
    return `${meta.label}. A proposal is only ever decided once.`;
  }
  return "";
}

// ── The bulk batch ───────────────────────────────────────────────────────────

/** #143 → what was queued. Nothing has been drawn yet when this arrives. */
export function bulkBatchOf(res) {
  const data = payload(res);
  const id = data.batch_id || data.batchId || data.batch?.id || "";
  const total = Number(data.total ?? data.batch?.total);
  return {
    batchId: String(id || ""),
    total: Number.isFinite(total) ? total : 0,
    // `true` means this batch already existed and a second one was NOT created.
    reused: data.reused === true,
    counts: data.counts || null,
  };
}

/** A batch that has stopped moving — polling ends here. */
export const BATCH_TERMINAL_STATES = ["completed", "completed_with_failures", "cancelled"];

export const BATCH_STATES = {
  queued: { label: "Waiting to start", tone: "slate", hint: "The letters are queued. They are drawn a few minutes from now, or straight away if you ask." },
  running: { label: "Being prepared", tone: "blue", hint: "The letters are being drawn now. You can leave this page — it carries on without you." },
  completed: { label: "All done", tone: "emerald", hint: "Every letter in this batch was issued." },
  completed_with_failures: { label: "Done, with some left out", tone: "amber", hint: "Most went out. The ones below didn’t, and each says why." },
  cancelled: { label: "Stopped", tone: "slate", hint: "This batch was stopped before it finished." },
};

export const batchStateMeta = (status) =>
  BATCH_STATES[String(status || "").toLowerCase()] || { label: "Unknown", tone: "slate", hint: "" };

const firstNumber = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

/**
 * #144 → one shape the screens can rely on.
 *
 * `issued + failed + skipped` is what has finished; `pending` is what has not.
 * `total` is read from the batch rather than summed, because a sum of counts
 * taken a moment apart can exceed the batch and push a progress bar past 100%.
 * `total_count` is the documented alias of `total`, and the sum is a last
 * resort for a reply that carries neither.
 */
export function batchProgressOf(res) {
  const data = payload(res);
  const batch = data.batch || {};
  const counts = data.counts || {};
  const queue = data.queue || {};

  // The item ledger is authoritative and is the ONLY place these live.
  const pending = firstNumber(counts.pending);
  const issued = firstNumber(counts.issued);
  const failed = firstNumber(counts.failed);
  const skipped = firstNumber(counts.skipped);
  const total = firstNumber(batch.total, batch.total_count, pending + issued + failed + skipped);

  const status = String(batch.status || "").toLowerCase();
  const settled = Math.min(issued + failed + skipped, total);

  const failures = (Array.isArray(data.failures) ? data.failures : []).map((row) => ({
    id: row?.id || row?.subject_user_id || "",
    subjectUserId: row?.subject_user_id || "",
    code: row?.failure_code || "",
    reason: row?.failure_reason || "",
    at: row?.updated_at || row?.created_at || "",
  }));

  const pagination = data.pagination || {};

  return {
    batch,
    status,
    templateCode: batch.template_code || "",
    createdAt: batch.created_at || "",
    completedAt: batch.completed_at || null,
    counts: { pending, issued, failed, skipped, total },
    // Diagnostics only: these count RENDER JOBS, not letters, so they are never
    // shown as a figure — only used to say whether something is moving.
    queue: {
      queued: firstNumber(queue.queued),
      working: firstNumber(queue.claimed),
      done: firstNumber(queue.done),
      failed: firstNumber(queue.failed),
      cancelled: firstNumber(queue.cancelled),
    },
    failures,
    failureTotal: firstNumber(pagination.total, failures.length),
    settled,
    percent: total > 0 ? Math.round((settled / total) * 100) : 0,
    terminal: BATCH_TERMINAL_STATES.includes(status),
  };
}

/**
 * Why one person in a batch didn't get their letter, in words.
 *
 * A batch item carries the same failure codes an ordinary issue does, but as a
 * ledger row rather than a thrown error — so it is dressed as one and handed to
 * the copy that already exists for it, rather than printing `PDF_DATA_INCOMPLETE`
 * at somebody (CLAUDE.md §6). The server's own sentence is the fallback.
 */
export function batchFailureMessage(failure) {
  if (!failure) return "";
  if (!failure.code) return failure.reason || "It couldn’t be drawn, and the server didn’t say why.";
  return letterIssueErrorMessage(
    { status: 422, data: { errorCode: failure.code, message: failure.reason } },
    failure.reason || "This one couldn’t be drawn.",
  );
}

/** #147 → what that drain actually did. */
export function drainSummaryOf(res) {
  const data = payload(res);
  return {
    claimed: firstNumber(data.claimed),
    done: firstNumber(data.done),
    retried: firstNumber(data.retried),
    failed: firstNumber(data.failed),
    cancelled: firstNumber(data.cancelled),
    remaining: firstNumber(data.remaining),
  };
}

/** What a drain did, in one sentence for a toast. */
export function drainMessage(summary) {
  if (!summary || summary.claimed === 0) {
    return summary?.remaining
      ? "Nothing was ready to draw just now — the rest is already being worked on. Try again in a moment."
      : "There was nothing left to draw.";
  }
  const parts = [];
  if (summary.done) parts.push(`${summary.done} ${summary.done === 1 ? "letter" : "letters"} issued`);
  if (summary.failed) parts.push(`${summary.failed} couldn’t be drawn`);
  if (summary.retried) parts.push(`${summary.retried} will be tried again shortly`);
  if (!parts.length) parts.push("the queue was worked through");
  const tail = summary.remaining ? ` · ${summary.remaining} still waiting` : "";
  return `${parts.join(" · ")}${tail}`;
}

/**
 * How often to ask #144 again.
 *
 * Deliberately not a second: a batch is drawn by a worker that runs every 15
 * minutes, so a fast poll would be hundreds of reads for one change. Slower
 * once a batch is merely queued and nothing can have moved yet.
 */
export const BATCH_POLL_MS = 4000;
export const BATCH_POLL_IDLE_MS = 15000;

/** #143's list cap when the organisation's own setting hasn't been read. */
export const BULK_MAX_SUBJECTS_FALLBACK = 200;
/** The server's own hard ceiling, whatever an organisation sets (#91). */
export const BULK_MAX_SUBJECTS_CEILING = 2000;

/** #92 accepts at most five templates. */
export const AUTO_ISSUE_MAX_TEMPLATES = 5;

/** The four settings Phase 4 adds (#91–#94), only sent once the server returns them. */
export const LETTER_PHASE4_SETTING_KEYS = [
  "letter_bulk_max_subjects",
  "letter_auto_issue_on_exit",
  "manager_can_propose_letters",
  "document_notify_letter_issued",
];

// ── The hourly batch allowance (PDF Generation Phase 5, #96) ─────────────────

/** `letter_bulk_rate_per_hour` when the organisation's settings can't be read. */
export const BULK_RATE_PER_HOUR_FALLBACK = 10;
/** The bounds #24 validates. Outside them is a 400, not a clamp. */
export const BULK_RATE_PER_HOUR_MIN = 1;
export const BULK_RATE_PER_HOUR_MAX = 500;

/**
 * A wait, in the words somebody would use out loud.
 *
 * Not `fmtMinutes` ("23m"), because this is read as a sentence rather than
 * scanned in a column — "23 minutes" belongs in "try again in 23 minutes" and
 * "23m" does not. It rounds UP: telling somebody to wait slightly too long
 * costs nothing, and telling them too little sends them back into the refusal.
 */
export function cooldownLabel(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 60) return `${Math.ceil(n)} ${Math.ceil(n) === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(n / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return rest ? `${head} and ${rest} ${rest === 1 ? "minute" : "minutes"}` : head;
}

/**
 * The two settings Phase 5 adds (#95 retention, #96 the hourly allowance),
 * only sent back once the server has returned them — same rule as every other
 * phase's keys.
 */
export const LETTER_PHASE5_SETTING_KEYS = [
  "letter_record_retention_days",
  "letter_bulk_rate_per_hour",
];

/** #95's statutory floor. Below this the server refuses, and so does the box. */
export const LETTER_RETENTION_MIN_DAYS = 365;
