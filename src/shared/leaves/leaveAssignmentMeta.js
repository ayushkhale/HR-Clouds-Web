// ─────────────────────────────────────────────────────────────────────────────
// leaveAssignmentMeta.js — the domain knowledge behind Leave Assignment: what
// "coverage" means, what an assignment's state is called, which targeting values
// the bulk endpoint accepts, and how to read a preview or bulk reply.
//
// It lives out of the JSX (CLAUDE.md §1) because every one of these labels is a
// decision about wording, not markup — and the same words have to appear on the
// list, in the record inspector and in the assign dialog.
//
// Three traps are encoded here rather than left to each caller:
//
//  · "LEGACY" IS NOT "NO POLICY". Anyone who had leave rules before the backend
//    started recording which policy gave them comes back as `coverage: "legacy"`.
//    They have leave; what is missing is the paperwork. Counting them as "No
//    policy" would send HR chasing people who are already covered, so they get
//    their own label and their own filter.
//
//  · THE EMPLOYMENT TYPE AND JOB STATUS VALUES ARE CANONICAL, NOT THE ROSTER'S
//    DISPLAY STRINGS. The bulk endpoint wants `full_time`, not "Full-time"
//    (md_updates/phase7_api_analysis.md §6). `useTargetingOptions` derives its
//    lists from whatever strings the roster happens to carry, which is right for
//    the attendance rules that filter on those strings and wrong here — so the
//    two lists below are fixed, and only departments / locations / people come
//    from the live roster.
//
//  · DELETE DOES NOT EXIST. A started assignment's balances are already written
//    and cannot be honestly reversed, so the only lifecycle action is End
//    (§4.6 of the backend change record). Don't add a Delete button back when
//    the endpoint appears — it will only ever apply to future-dated assignments,
//    which we also can't create yet.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePaginated, num } from "../attendance/normalize.js";
import { ymdOnly } from "../attendance/dates.js";
import { LEAVE_ERROR_MESSAGES } from "../utils/leaveErrors.js";

/* ─── Coverage: does this person have a leave policy at all? ───────────────── */

export const COVERAGE = {
  on_policy: {
    label: "On a policy",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
    note: "Their leave days come from this policy.",
  },
  legacy: {
    label: "Policy not recorded",
    pill: "bg-indigo-50 text-indigo-700 border-indigo-200",
    note: "They have leave rules, but these were set up before we started recording which policy they came from. Assign a policy to see it here.",
  },
  none: {
    label: "No policy",
    pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    note: "They have no leave rules at all, so they cannot apply for leave. Assign a policy to give them their days.",
  },
};

/** Falls back to "none" for a row the server sent without a coverage value. */
export const coverageOf = (row) => (row?.coverage && COVERAGE[row.coverage] ? row.coverage : "none");

/* ─── State: is the policy running, waiting to start, or finished? ─────────── */

export const ASSIGNMENT_STATE = {
  ongoing: { label: "Ongoing", pill: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  upcoming: { label: "Upcoming", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-500" },
  ended: { label: "Ended", pill: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400" },
};

/**
 * Derived from the dates rather than read from `state`, for the same reason
 * AttendanceRosterPage does it: the server's own `state` is only `ongoing` or
 * `ended` today, and a future-dated row would otherwise read "Ongoing".
 * @returns {"ongoing"|"upcoming"|"ended"|null} null when there is no assignment.
 */
export function assignmentState(assignment, today) {
  if (!assignment) return null;
  const from = ymdOnly(assignment.effective_from);
  const to = ymdOnly(assignment.effective_to);
  if (to && to < today) return "ended";
  if (from && from > today) return "upcoming";
  return "ongoing";
}

/** True while this assignment can still be given an end date. */
export const canEnd = (assignment, today) => {
  const state = assignmentState(assignment, today);
  return !!assignment?.id && !assignment.effective_to && (state === "ongoing" || state === "upcoming");
};

/* ─── The filter strip ────────────────────────────────────────────────────── */

export const COVERAGE_FILTERS = [
  { value: "all", label: "All" },
  { value: "on_policy", label: "On a policy" },
  { value: "legacy", label: "Policy not recorded" },
  { value: "none", label: "No policy" },
  { value: "overrides", label: "Custom rules" },
];

/** A filter tab as query params. Unknown keys are a 400 on this endpoint. */
export function filterToQuery(filter) {
  if (filter === "overrides") return { has_overrides: "true" };
  if (filter === "all" || !filter) return {};
  return { coverage: filter };
}

/* ─── Reading the list ────────────────────────────────────────────────────── */

/**
 * The seam that absorbs the list's shape. Rows arrive as
 * `{ user, coverage, assignment }`, which is nothing like the flat shift
 * assignment rows this screen was modelled on — flattening here keeps every
 * `row.user.name` out of the JSX and leaves one place to change if the shape
 * moves again.
 * @returns {{ rows: object[], total: number, page: number, limit: number, totalPages: number }}
 */
export function normalizeAssignmentRows(res, requested = {}) {
  const { items, total, page, limit, totalPages } = normalizePaginated(res, ["rows", "assignments"], requested);
  const rows = items.map((row) => {
    const user = row.user || row;
    const assignment = row.assignment || null;
    return {
      userId: user.user_id || user.id || null,
      name: user.name || "Loading…",
      email: user.email || "",
      employeeCode: user.employee_code || "",
      department: user.department || "",
      designation: user.designation || "",
      role: user.role || "",
      coverage: coverageOf(row),
      assignment,
      // GenderAvatar reads gender / avatar_url off whatever it is handed. The
      // presigned photo link dies in ~5 minutes, so this object is derived on
      // every read and never cached (CLAUDE.md §7).
      person: user,
    };
  });
  return { rows, total, page, limit, totalPages };
}

/** The tiles, tolerant of a summary endpoint that isn't there yet. */
export function normalizeSummary(res) {
  const data = res?.data ?? res ?? {};
  const templates = Array.isArray(data.templates) ? data.templates : [];
  return {
    onPolicy: num(data.on_policy, 0),
    legacy: num(data.legacy, 0),
    unassigned: num(data.unassigned, 0),
    withOverrides: num(data.with_overrides, 0),
    templates,
    // Absent key → hidden feature (§7), not a zero: a server that never sends
    // the per-policy headcount must not be reported as "0 policies in use".
    templatesInUse: templates.some((t) => t.assigned_user_count !== undefined)
      ? templates.filter((t) => num(t.assigned_user_count, 0) > 0).length
      : undefined,
  };
}

/* ─── Why somebody can't be given a policy ────────────────────────────────── */

export const BLOCK_REASON = {
  NO_JOINING_DATE: "No joining date on file, so their leave days can't be worked out",
  NO_ROLE_PROFILE: "Their staff record is incomplete, so leave can't be set up yet",
};

export const SKIP_REASON = {
  ALREADY_ON_TEMPLATE: "Already on this policy",
};

export const blockReason = (code) => BLOCK_REASON[code] || "Can't be given this policy yet";
export const skipReason = (code) => SKIP_REASON[code] || "Left as they are";

/**
 * Why one person in a bulk run failed. The preview's own two reasons read better
 * here than the generic error copy, so they win; anything else is a real error
 * code and goes through the domain's error map rather than reaching the screen
 * raw (CLAUDE.md §6).
 */
export const failureReason = (code) =>
  BLOCK_REASON[code] || LEAVE_ERROR_MESSAGES[code] || "Couldn't be given this policy";

/* ─── The three buckets of a preview ──────────────────────────────────────── */

export const PREVIEW_BUCKETS = [
  {
    key: "changing",
    title: "Will change",
    tone: "border-purple-200 bg-purple-50/60 text-purple-800",
    note: "These people get the days from this policy. Taken leave is kept; their balance moves by the difference in days per year.",
  },
  {
    key: "unchanged",
    title: "Already on it",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
    note: "Nothing is written for these people and anything customised for them stays as it is.",
  },
  {
    key: "blocked",
    title: "Can't be done yet",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
    note: "These people are skipped. Fix what's missing on their profile, then run this again.",
  },
];

/* ─── Targeting values the bulk endpoint accepts ──────────────────────────── */

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

export const JOB_STATUS_OPTIONS = [
  { value: "probation", label: "Still in their wait after joining" },
  { value: "confirmed", label: "Confirmed" },
  { value: "notice_period", label: "Serving notice" },
  { value: "trainee", label: "Trainee" },
  { value: "contract", label: "On a contract" },
  { value: "temporary", label: "Temporary" },
  { value: "terminated", label: "Left the organisation" },
];

/** Only employees carry an employment type — managers and HR never match one. */
export const EMPLOYMENT_TYPE_NOTE = "Only employees have an employment type, so picking one here leaves out managers and HR.";

/* ─── Customisation ───────────────────────────────────────────────────────── */

export const ACCRUAL_LABEL = { upfront: "All at once", monthly: "Every month" };
