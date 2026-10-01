// ─────────────────────────────────────────────────────────────────────────────
// documents/offboardingMeta.js — Closing down a leaver's paperwork (#122–#124)
// and watching a very large publish fill in (#47's 202 → #127).
//
// Offboarding does four things at once, and the reason they are one button
// rather than four is the fourth: the emails. Archiving documents and cancelling
// requests are tidiness. Forgetting to silence the outbox is how somebody who
// left in March is still being chased in May for a handbook they never signed.
//
// Two facts the UI has to be honest about:
//   · It cannot be undone. An archived document is not reactivated; a new one
//     is uploaded. So the dry run is not a nicety, it is the safe default.
//   · Anything the person actually signed or acknowledged is never touched.
//     Only what was still outstanding is waived. That is the sentence people
//     need before they will press the button.
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";

/**
 * The four steps, in the order the server performs them. `key` is the counter
 * in the reply; `one` / `many` are the nouns for the summary line.
 */
export const OFFBOARD_STEPS = [
  {
    key: "archived_count",
    title: "Archive their documents",
    one: "document archived",
    many: "documents archived",
    blurb: "Everything verified or expired in their file moves to Archived. Nothing is deleted — it stays readable for as long as your retention period says.",
  },
  {
    key: "waived_count",
    title: "Excuse unfinished policies",
    one: "policy sign-off excused",
    many: "policy sign-offs excused",
    blurb: "Company documents they never got round to signing are marked as excused, with “employee offboarded” as the reason. Anything they did sign stays exactly as it is.",
  },
  {
    key: "cancelled_count",
    title: "Withdraw open requests",
    one: "request withdrawn",
    many: "requests withdrawn",
    blurb: "Documents still being asked of them are cancelled, so nobody chases a person who has left.",
  },
  {
    key: "notifications_skipped",
    title: "Stop the emails",
    one: "queued email stopped",
    many: "queued emails stopped",
    blurb: "Reminders already sitting in the outbox for them are dropped. This is the one that stops a former employee getting automated mail.",
  },
];

/** Why this person counts as leaving, in words rather than a code. */
export const OFFBOARD_TRIGGERS = {
  exit: "They have a recorded exit.",
  membership_removed: "They have been removed from the organisation.",
};
export const offboardTriggerLabel = (trigger) => OFFBOARD_TRIGGERS[trigger] || humanizeCode(trigger) || "";

/** Setting #80. `retain` leaves the files active and only does the other three steps. */
export const OFFBOARD_MODES = {
  archive: "Documents are archived",
  retain: "Documents are left active",
};
export const offboardModeLabel = (mode) => OFFBOARD_MODES[mode] || humanizeCode(mode) || "";

/** #122 → counters that are always numbers, so the preview never renders "undefined". */
export function offboardResultOf(res) {
  const data = res?.data ?? res ?? {};
  const counts = Object.fromEntries(OFFBOARD_STEPS.map((s) => [s.key, Number(data[s.key]) || 0]));
  return {
    trigger: data.trigger || "",
    mode: data.mode || "",
    counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}

/** "6 documents archived · 2 policy sign-offs excused", or a plain "nothing left". */
export function offboardSummary(result) {
  const parts = OFFBOARD_STEPS
    .map((step) => [Number(result?.counts?.[step.key]) || 0, step])
    .filter(([n]) => n > 0)
    .map(([n, step]) => `${n} ${n === 1 ? step.one : step.many}`);
  if (!parts.length) return "";
  return parts.join(" · ");
}

// ── Exit pack (#123 / #124) ─────────────────────────────────────────────────
export const EXIT_PACK_SCOPES = [
  { value: "all", label: "Everything", blurb: "Their own documents and the company documents issued to them." },
  { value: "employee_owned", label: "Their own documents only", blurb: "What they uploaded or what was uploaded for them." },
  { value: "org_issued", label: "Company documents only", blurb: "Policies, letters and notices addressed to them." },
];

export const EXIT_PACK_MAX_ITEMS = 500;

/** Download links in an exit pack are short-lived by design. */
export const EXIT_PACK_URL_MINUTES = 15;

/** #123 → a manifest whose items always have the fields the table reads. */
export function exitPackOf(res) {
  const data = res?.data ?? res ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    exportId: data.export_id || null,
    scope: data.scope || "all",
    generatedAt: data.generated_at || null,
    itemCount: Number.isFinite(Number(data.item_count)) ? Number(data.item_count) : items.length,
    items,
    // An item whose file couldn't be signed comes back with `url: null`. The
    // pack still succeeds, so these are counted rather than thrown away.
    unavailable: items.filter((item) => !item?.url).length,
  };
}

export const exitPackPlaneLabel = (plane) =>
  plane === "org" ? "Company document" : plane === "employee" ? "Their own document" : humanizeCode(plane) || "Document";

// ── Materialisation (#47's 202 → #127) ──────────────────────────────────────
/**
 * `request()` hands back the body without the status code, so a deferred
 * publish is recognised by what it says rather than by being a 202: the reply
 * carries `materialisation_state: "pending"` and a `poll` path. That is also
 * true of the #127 read, so one normaliser serves both.
 */
export function materialisationOf(res) {
  const data = res?.data ?? res ?? {};
  const state = data.materialisation_state || "not_required";
  const target = Number(data.recipient_target_count);
  const done = Number(data.materialised_count ?? data.recipients_created);
  const percent = Number(data.percent_complete);
  return {
    state,
    pending: state === "pending",
    complete: state === "complete",
    target: Number.isFinite(target) ? target : null,
    done: Number.isFinite(done) ? done : 0,
    percent: Number.isFinite(percent)
      ? percent
      : Number.isFinite(target) && target > 0 && Number.isFinite(done)
        ? Math.round((done / target) * 100)
        : null,
    at: data.materialised_at || null,
  };
}

/** True when a publish reply means "published, but the audience is still filling in". */
export const isDeferredPublish = (res) => materialisationOf(res).pending;

/** How many people are still to be added, or null when the total isn't known. */
export function remainingRecipients(progress) {
  if (!progress || !Number.isFinite(progress.target)) return null;
  return Math.max(0, progress.target - (progress.done || 0));
}
