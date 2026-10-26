// ─────────────────────────────────────────────────────────────────────────────
// attendance/agendaMeta.js — Domain knowledge for the forward schedule: what a
// day of the agenda is called, why a day off applies to this person, what a
// thing falling due is called, and how a lane that failed to load is described.
//
// WHAT BELONGS HERE. Labels, enum maps and the plain-English copy for
// `day_kind` / `status_reason` / item kinds / lane states / weekly-off
// provenance. No JSX, no fetching. The page and its panels read from here so
// the same day reads identically wherever it is rendered, and so a new
// `day_kind` is a one-line change.
//
// THE RULE THAT MATTERS MOST (integration guide §4, delivery §2)
//   `day_kind` is resolved BY THE SERVER, with the same code unit the roster,
//   the HR planes and the auto-absent cron use. NEVER re-derive it here from
//   which of `shift`/`holiday`/`leave` happen to be non-null. Rotation
//   arithmetic, holiday audience targeting and day precedence all affect PAY —
//   a second implementation in the browser would drift until this page
//   contradicted the payslip, which is the entire reason the endpoint exists.
//
// CONTRACT TRAPS, each of which is a real payload, not a hypothetical
//  · A weekend inside an approved leave span comes back `weekly_off`, NOT
//    `leave`, because the leave calculator never charged it. So `days[]` holds
//    FEWER leave days than the request's `request_total_days`. That is correct
//    and must not be "fixed" — we draw the span from
//    `request_start_date`/`request_end_date` and let each day keep its kind.
//  · `day_kind: "holiday"` can carry `holiday: null` — a non-working calendar
//    exception has no holiday row to name (`status_reason:
//    "exception_non_working"`). Never reach for `day.holiday.name`.
//  · `leave.leave_type_name` is nullable when the request behind an `on_leave`
//    row isn't readable. Reads "On leave", never "On leave —".
//  · `half_day_leave` is the ONE kind carrying both `shift` and `leave`, and it
//    puts 0.5 into both `working_days` and `leave_days` — those two are
//    fractional, which is why they print through `formatDayCount` (§6).
//  · Only `task_due` has `due_at` (a real timestamp). The other four kinds have
//    `due_date` and NO `due_at` key at all — fabricating a midnight would print
//    "12:00 am" on four kinds out of five.
//  · `unassigned` is valid data (new joiner, gap between assignments), not an
//    error, and never counts as a working day.
//
// ── V2, 2026-10-22 (enriched agenda & policy provenance guide) ───────────────
// The response gained four things, all additive — `range`, `summary`, `lanes`
// and `days[]` kept their shape, so nothing here had to be unpicked:
//
//  1. `employee` — department, designation, employment type, joining date. This
//     is WHY the rest applies: targeting is by department / location / shift /
//     employment type, so these fields answer "why am I on this policy?".
//     `location_id` arrives WITHOUT a location name, so the location is not
//     shown at all — an id never reaches the screen (§4), and a page that needs
//     it should ask the backend for a `location_name` beside it.
//  2. `weekly_off_policy` (top level) and `days[].weekly_off` (per day) — the
//     rule's NAME and how it found this person. The "nameless weekend" the
//     guide opens with: a day off nobody could explain.
//  3. `attendance_policy` (top level) — the same resolved policy
//     `/attendance/shift` returns, so the rules panel now has two sources and
//     survives either read failing.
//  4. Rich `task_due` items — brief, category, assigner, extension history.
//     None of that is re-worded here: the task domain already owns those words
//     in `tasks/taskMeta.js`, and a second set of priority labels is how two
//     screens end up disagreeing about what "urgent" is called (§6).
//
// `priority` ON A WEEKLY-OFF RULE IS INTERNAL. It is how the backend breaks a
// tie between two rules that both match; it means nothing to the person whose
// Saturday it is, and a raw internal number on screen is what §4 is about. The
// provenance is said in words instead.
// ─────────────────────────────────────────────────────────────────────────────

import { addDaysYMD, fmtClockTime, fmtDate, formatInZone, todayYMD, ymdInZone } from "./dates.js";
import { formatDayCount } from "../utils/formatUtils.js";
import { humanize } from "./enums.js";

/** The server refuses a longer window with `SCHEDULE_RANGE_TOO_LARGE`. */
export const MAX_AGENDA_RANGE_DAYS = 92;

/**
 * ONE WINDOW: the next seven days, today included (user decision, 2026-10-22 —
 * the 30- and 90-day options were dropped).
 *
 * Why a week and not a month. Everything this page is for is answered inside
 * one: the shift you are on, the day off coming, the deadline you have to plan
 * around. A 90-day agenda was a scroll nobody finished, and its rows had to
 * stay thin to fit — so the longest window produced the *least* useful row. A
 * week fits as seven cards side by side, which is how a week is actually read.
 *
 * It also sits far enough under the 92-day server cap that the cap can no
 * longer be reached from the UI at all: that refusal is still mapped in
 * `attendanceErrors.js`, but only a hand-built request can now provoke it.
 */
export const AGENDA_WINDOW_DAYS = 7;

/** Kept as the hook default so no caller has to name the window. */
export const DEFAULT_AGENDA_DAYS = AGENDA_WINDOW_DAYS;

/** `{ from, to }` for a forward window of `days`, starting today. Inclusive. */
export function agendaRange(days = DEFAULT_AGENDA_DAYS) {
  const span = Math.min(Math.max(Math.round(days) || 1, 1), MAX_AGENDA_RANGE_DAYS);
  const from = todayYMD();
  return { from, to: addDaysYMD(from, span - 1) };
}

// ── Days ─────────────────────────────────────────────────────────────────────

/**
 * One entry per `day_kind`. `tone` keys are the ones in `enums.js` TONE_CLASSES
 * (they keep their old colour names and render purple — §5).
 *  · `working` carries no tone: an ordinary working day is the baseline and
 *    badging every one of them would make the exceptions invisible.
 */
export const DAY_KINDS = {
  working: { label: "Working", tone: null },
  weekly_off: { label: "Weekly off", tone: "slate" },
  holiday: { label: "Holiday", tone: "purple" },
  leave: { label: "On leave", tone: "blue" },
  half_day_leave: { label: "Half day", tone: "amber" },
  unassigned: { label: "No shift", tone: "slate" },
};

/** True when the day is not worked at all — drives the muted card treatment. */
export const isDayOff = (day) =>
  day?.day_kind === "weekly_off" || day?.day_kind === "holiday";

/**
 * What this day IS, in one phrase, switching on `day_kind` alone.
 * The `||` fallbacks are the two real nullable cases above, not defensiveness.
 */
export function dayHeadline(day) {
  if (!day) return "N/A";
  switch (day.day_kind) {
    case "working":
      return shiftWindowLabel(day.shift) || "Working day";
    case "weekly_off":
      return "Weekly off";
    case "holiday":
      // A calendar-exception day is non-working with no holiday to name.
      return day.holiday?.name || "Non-working day";
    case "leave":
      return day.leave?.leave_type_name || "On leave";
    case "half_day_leave":
      return `Half day · ${day.leave?.leave_type_name || "leave"}`;
    case "unassigned":
      return day.status_reason === "before_joining" ? "Before you joined" : "No shift assigned";
    default:
      return "N/A";
  }
}

/**
 * The short version for a day card, where the headline sits under a date and a
 * nine-word phrase would wrap three times. A working day shows its hours; the
 * rest show what the day is, named where the payload names it.
 */
export function dayCardLabel(day) {
  if (!day) return "N/A";
  switch (day.day_kind) {
    case "working":
      return day.shift?.name || "Working";
    case "weekly_off":
      // The rule NAME is provenance and belongs in the inspector, not here —
      // "Tech & Product 5-Day Work Week" in a 140px card is a truncation.
      return day.weekly_off?.day_name ? `${day.weekly_off.day_name} off` : "Weekly off";
    case "holiday":
      return day.holiday?.name || "Non-working day";
    case "leave":
      return day.leave?.leave_type_name || "On leave";
    case "half_day_leave":
      return "Half day";
    case "unassigned":
      return day.status_reason === "before_joining" ? "Before you joined" : "No shift";
    default:
      return "N/A";
  }
}

/** "09:30 am – 06:30 pm", with the overnight carry spelled out rather than "+1". */
export function shiftWindowLabel(shift) {
  if (!shift?.start_time || !shift?.end_time) return "";
  const window = `${fmtClockTime(shift.start_time)} – ${fmtClockTime(shift.end_time)}`;
  return shift.is_overnight ? `${window} (ends next day)` : window;
}

/** Hours only, for a day card: "09:30 am – 06:30 pm" without the carry note. */
export function shiftHoursLabel(shift) {
  if (!shift?.start_time || !shift?.end_time) return "";
  return `${fmtClockTime(shift.start_time)} – ${fmtClockTime(shift.end_time)}`;
}

/**
 * Why the day reads as it does, in words — for the day inspector, where the
 * person has asked for more than a colour.
 *
 * `awaiting_absent_cron` is the one that must never say "Absent": the day is a
 * past working day the finalising job hasn't closed yet, and calling it an
 * absence would accuse somebody on the strength of a job that hasn't run.
 */
export const DAY_REASONS = {
  upcoming: "Hasn’t happened yet — nothing is recorded against it.",
  pending_clock_in: "You’re expected in today and haven’t clocked in yet.",
  awaiting_absent_cron: "Still being finalised — how this day counts isn’t settled.",
  weekly_off: "A rest day under your weekly-off rules.",
  holiday: "A holiday that applies to you.",
  exception_non_working: "Marked a non-working day for your organisation.",
  before_joining: "Earlier than your joining date, so nothing applies.",
  record: "Taken from the attendance already recorded for this day.",
};

export const dayReason = (day) => DAY_REASONS[day?.status_reason] || "";

/**
 * The leave span a day sits in, when it is longer than the day itself — so a
 * row can say "day 2 of 5" without a second request. Returns null when the
 * request is one day, or when the span dates didn't come back.
 */
export function leaveSpan(day) {
  const leave = day?.leave;
  if (!leave?.request_start_date || !leave?.request_end_date) return null;
  if (leave.request_start_date === leave.request_end_date) return null;
  return {
    from: leave.request_start_date,
    to: leave.request_end_date,
    label: `${fmtDate(leave.request_start_date)} – ${fmtDate(leave.request_end_date)}`,
    total: formatDayCount(leave.request_total_days, { fallback: "" }),
  };
}

/** `full` → "Whole day"; the halves name which half, which is what people ask. */
export const LEAVE_PORTIONS = {
  full: "Whole day",
  first_half: "First half of the day",
  second_half: "Second half of the day",
};

/** `assignment` needs no explaining; the other two do. */
export const SHIFT_SOURCES = {
  assignment: "",
  rotation: "From your rotation — this is what the cycle lands on for this date, not a permanent move.",
  default: "Your organisation’s default hours, as nothing more specific is set for you.",
};

// ── Why a day off is yours (v2 provenance) ───────────────────────────────────

/**
 * How a weekly-off rule found this person, as the group it applies to.
 *
 * `matched_by` is the raw targeting enum and never reaches the screen (§4).
 * `matched_entity_name` is a real name ("Engineering") when the backend has
 * one, so each entry takes it and falls back to the group in general terms —
 * "everyone in your department" still answers the question.
 *
 * @param {string} matchedBy one of department | location | shift |
 *   employment_type | user | org_default
 * @param {string|null} entity the named group, when the payload has one
 * @returns {string} e.g. "Everyone in Engineering has these days off."
 */
export function weeklyOffAudience(matchedBy, entity) {
  const named = entity && String(entity).trim() ? String(entity).trim() : "";
  switch (matchedBy) {
    case "department":
      return named ? `Everyone in ${named} has these days off.` : "Everyone in your department has these days off.";
    case "location":
      return named ? `Everyone working at ${named} has these days off.` : "Everyone at your workplace has these days off.";
    case "shift":
      return named ? `Everyone on ${named} has these days off.` : "Everyone on your shift has these days off.";
    case "employment_type":
      return named ? `Everyone on ${named} terms has these days off.` : "Everyone on your kind of contract has these days off.";
    case "user":
      return "Set for you specifically, rather than for a group you’re in.";
    case "org_default":
      return "Your organisation’s standard days off, as nothing more specific is set for you.";
    default:
      return "";
  }
}

/**
 * The weekly-off rule in plain words: what it is called and who it covers.
 * Takes either the top-level `weekly_off_policy` or a day's own `weekly_off` —
 * both carry `rule_name` and `matched_by`, and only the top-level one carries
 * `matched_entity_name`, which is why the entity may be passed separately.
 *
 * Returns null when there is no rule, which is what hides the provenance line:
 * an employee with no weekly-off rule has nothing to explain (§7 — absent key,
 * hidden feature).
 */
export function weeklyOffRule(rule, { entity } = {}) {
  if (!rule?.rule_name && !rule?.matched_by) return null;
  return {
    name: rule.rule_name || "Your weekly days off",
    audience: weeklyOffAudience(rule.matched_by, entity ?? rule.matched_entity_name),
    // 0 = Sunday, same as `/attendance/shift`'s rules, so this feeds the
    // existing `weeklyOffNames` rather than being mapped to names again here.
    days: Array.isArray(rule.days_of_week) ? rule.days_of_week : null,
    from: rule.effective_from || "",
    to: rule.effective_to || "",
  };
}

/**
 * Who the person is, as the sentence that explains the targeting above.
 *
 * Every field is optional and an absent one simply drops out — a trimmed
 * profile must read as a shorter sentence, never as "null terms" (§5, §7).
 * `employment_type` is an enum, so it goes through `humanize` rather than
 * printing `full_time` (§4). `location_id` is deliberately unused: there is no
 * name beside it, and an id is not shown.
 */
export function employeeTargeting(employee) {
  if (!employee) return "";
  const { designation, department, employment_type: type } = employee;
  // Each shape is built in full rather than joined from fragments: a missing
  // designation used to leave "set up as in Engineering".
  const role = designation && department
    ? `${designation} in ${department}`
    : designation || (department ? `part of ${department}` : "");
  const terms = type ? `on ${humanize(type).toLowerCase()} terms` : "";
  if (!role && !terms) return "";
  const who = role
    ? `You’re set up as ${role}${terms ? `, ${terms}` : ""}`
    : `You’re set up ${terms}`;
  return `${who} — that’s what decides which shift, days off and rules apply to you.`;
}

// ── Things falling due ───────────────────────────────────────────────────────

/**
 * Which lane each item kind arrives in. Needed because a lane that FAILED must
 * not render as "nothing due" (guide §6) — the panel has to know which lane to
 * blame for an empty list.
 */
export const ITEM_LANE = {
  task_due: "tasks",
  document_request_due: "documents",
  document_expiry: "documents",
  comp_off_expiry: "comp_offs",
  shift_change: "shift_changes",
};

/** The optional lanes, in the order their absence should be reported. */
export const ITEM_LANES = ["tasks", "documents", "comp_offs", "shift_changes"];

export const LANE_LABELS = {
  tasks: "task deadlines",
  documents: "document dates",
  comp_offs: "comp-off expiry",
  shift_changes: "shift changes",
};

/**
 * What the thing is, said as the consequence rather than the record type (§6).
 * `kind` is the discriminator — never infer a kind from which fields are set.
 */
export function itemHeadline(item) {
  if (!item) return "N/A";
  switch (item.kind) {
    case "task_due":
      return item.title || "A task is due";
    case "document_request_due":
      return `Upload your ${item.document_type_name || "document"}`;
    case "document_expiry":
      return `${item.document_name || item.document_type_name || "A document"} runs out`;
    case "comp_off_expiry":
      return "A day off you earned runs out";
    case "shift_change":
      return item.is_rotation
        ? `You move onto ${item.shift_name || "a new rotation"}`
        : `You move onto ${item.shift_name || "a new shift"}`;
    default:
      return "N/A";
  }
}

/**
 * A second line, only where there is something worth adding.
 *
 * `task_due` says nothing here even though it now could: its brief, assigner
 * and extension history are a card of their own, and a task past its deadline
 * is already drawn in rose with the word on it.
 */
export function itemDetail(item) {
  switch (item?.kind) {
    case "task_due":
      return "";
    case "document_request_due":
      return "HR asked you for this one.";
    case "document_expiry":
      return "Replace it before this date to stay on file.";
    case "comp_off_expiry":
      return item.earned_on ? `Earned on ${fmtDate(item.earned_on)}. Use it or it lapses.` : "Use it or it lapses.";
    case "shift_change":
      return "Your hours change from this date.";
    default:
      return "";
  }
}

/**
 * When it falls due. Only `task_due` has a time of day; the rest are calendar
 * dates and get no clock, because inventing midnight would read as "12:00 am".
 *
 * `due_at` already carries its own offset and is already expressed in the
 * response's zone — it is formatted IN that zone, never the browser's, or a
 * field employee on another shift sees the wrong day.
 */
export function itemDueLabel(item, timezone) {
  if (item?.kind === "task_due" && item.due_at) {
    const time = timezone ? formatInZone(item.due_at, timezone) : "";
    return time ? `${fmtDate(item.due_at)}, ${time}` : fmtDate(item.due_at);
  }
  return fmtDate(item?.due_date);
}

/** Just the clock time of a timed item, for a row that already shows the date. */
export function itemDueTime(item, timezone) {
  if (item?.kind !== "task_due" || !item.due_at) return "";
  return timezone ? formatInZone(item.due_at, timezone) : "";
}

/**
 * Tone for the row: rose only for something already late (§5).
 *
 * PRIORITY IS NOT A TONE. An urgent task is not an error, and rose is reserved
 * for errors, lateness and deductions — `taskMeta.js` made the same call for
 * the task screens, and the two must agree.
 */
export const itemTone = (item) => (item?.kind === "task_due" && item.is_overdue ? "rose" : "purple");

export const itemKey = (item, index) => `${item?.kind || "item"}:${item?.id || index}`;

/**
 * A `task_due` agenda item reshaped into the row the task screens pass around,
 * so the real task record inspector can open on it (`TaskDetailDialog`).
 *
 * `due_at` → `due_date` is the rename that matters: the agenda names the
 * deadline `due_at` while every task endpoint calls it `due_date`, and the
 * dialog reads the task spelling. `assigner` → `assigned_by` for the same
 * reason. Everything else is already the same key, and the dialog merges the
 * full record over this the moment its own read lands — so a field missing
 * here shows as a spinner, never as "N/A" (its header explains why).
 */
export function taskRowFromItem(item) {
  if (item?.kind !== "task_due" || !item.id) return null;
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    status: item.status,
    priority: item.priority,
    is_overdue: item.is_overdue,
    due_date: item.due_at,
    original_due_date: item.original_due_date,
    extension_count: item.extension_count,
    rework_count: item.rework_count,
    is_viewed: item.is_viewed,
    external_links: item.external_links,
    assigned_by: item.assigner,
  };
}

/**
 * The inverse: a `/tasks/me` row reshaped into the agenda item this panel
 * renders. Used ONLY to recover the tasks lane when the server reports it
 * `unavailable` — the lane's own source is an endpoint the employee may call
 * directly, so one extra read puts the real deadlines back on screen instead
 * of an apology for them (§7: gate on what the server returned).
 *
 * `date` is the day the deadline lands on IN THE SCHEDULE'S ZONE, not the
 * browser's, because it has to agree with the day headings the reader just saw
 * on the week board. A row with no deadline is dropped: it belongs to no day.
 */
export function agendaItemFromTaskRow(row, timezone) {
  if (!row?.id || !row.due_date) return null;
  return {
    kind: "task_due",
    id: row.id,
    date: ymdInZone(row.due_date, timezone),
    due_at: row.due_date,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    is_overdue: row.is_overdue,
    original_due_date: row.original_due_date,
    extension_count: row.extension_count,
    rework_count: row.rework_count,
    is_viewed: row.is_viewed,
    external_links: row.external_links,
    assigner: row.assigned_by,
  };
}

/**
 * Every item in the window as one list, soonest first, each carrying the date
 * it belongs to. The server already orders items within a day (timed before
 * date-only) and `days[]` is ascending, so this preserves that order rather
 * than re-sorting — a re-sort on a formatted date string is how the "due 1 Nov
 * before 2 Oct" class of bug starts.
 */
export function flattenAgendaItems(days) {
  const out = [];
  (Array.isArray(days) ? days : []).forEach((day) => {
    (Array.isArray(day?.items) ? day.items : []).forEach((item) => {
      out.push({ ...item, date: day.date, day_kind: day.day_kind });
    });
  });
  return out;
}

/**
 * Agenda items with a separately-read lane folded back in, in the order the
 * server would have sent them: by date, and within a date the server's own
 * items first. Merging on `date` rather than appending keeps this panel in step
 * with the week board above it — a recovered deadline sinking to the bottom of
 * a list the reader scans chronologically is worse than the error it replaced.
 *
 * Deduped on kind + id, so a lane that comes back while a recovery is in flight
 * cannot show the same deadline twice.
 */
export function mergeAgendaItems(items, recovered) {
  const base = Array.isArray(items) ? items : [];
  const extra = (Array.isArray(recovered) ? recovered : []).filter((item) => item?.date);
  if (extra.length === 0) return base;

  const seen = new Set(base.map((item) => itemKey(item)));
  const byDate = new Map();
  const push = (item) => {
    const date = item.date || "";
    byDate.set(date, [...(byDate.get(date) || []), item]);
  };
  base.forEach(push);
  extra.forEach((item) => { if (!seen.has(itemKey(item))) push(item); });

  return [...byDate.keys()].sort().flatMap((date) => byDate.get(date));
}

// ── Lanes ────────────────────────────────────────────────────────────────────

/**
 * The state of the lanes feeding a panel, reduced to the one that matters.
 * `unavailable` beats `truncated` beats `ok`; `excluded` only survives when
 * EVERY lane was excluded, because one excluded lane among loaded ones is not
 * a reason to hide the panel.
 *
 * This is the field that stops the page lying: a failed documents query with an
 * empty item list must never render as "nothing expires soon" — that is a
 * person missing a renewal because of a transient blip.
 */
export function worstLaneState(lanes, keys = ITEM_LANES) {
  const states = keys.map((key) => lanes?.[key]).filter(Boolean);
  if (states.length === 0) return "ok";
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("truncated")) return "truncated";
  if (states.every((s) => s === "excluded")) return "excluded";
  return "ok";
}

/** Which lanes failed, named for a message the reader can act on. */
export const failedLaneNames = (lanes, keys = ITEM_LANES) =>
  keys.filter((key) => lanes?.[key] === "unavailable").map((key) => LANE_LABELS[key] || key);

export const LANE_TRUNCATED_NOTE =
  "There’s more than we can show at once, so this list may be missing a few.";

// ── Summary ──────────────────────────────────────────────────────────────────

/**
 * The headline figures, server-computed. Day counts print through
 * `formatDayCount` because half-day leave makes `working_days` and `leave_days`
 * fractional — `4.5` must read "4d and 1/2 d", never "4.5" (§6). The phrase
 * carries its own unit, so no tile adds a "days" caption.
 *
 * `items_due` is a count of THINGS, not of days, so it stays a plain number.
 *
 * Weekly offs and holidays are added into one "off" figure: over a week the
 * difference is already visible on the day cards themselves, and two tiles
 * reading "2d" and "0d" said less than one reading "2d".
 */
export function summaryTiles(summary) {
  if (!summary) return [];
  const offs = (summary.weekly_offs || 0) + (summary.holidays || 0);
  return [
    { key: "working_days", label: "Working", value: formatDayCount(summary.working_days, { fallback: "0d" }) },
    { key: "days_off", label: "Off", value: formatDayCount(offs, { fallback: "0d" }) },
    { key: "leave_days", label: "On leave", value: formatDayCount(summary.leave_days, { fallback: "0d" }) },
    { key: "items_due", label: "Falling due", value: String(summary.items_due ?? 0) },
  ];
}

// ── Errors ───────────────────────────────────────────────────────────────────
//
// There is deliberately NO error copy in this file. Every one of these
// endpoints' failures — `SCHEDULE_RANGE_TOO_LARGE`, `TEAM_TOO_LARGE`,
// `CANNOT_ACCESS_OUTSIDE_HIERARCHY`, the feature flag — is mapped in
// `utils/attendanceErrors.js`, which is the attendance domain's one error map
// (§6). A second copy here would be the version that went stale.
