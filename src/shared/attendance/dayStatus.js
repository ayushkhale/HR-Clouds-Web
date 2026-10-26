// ─────────────────────────────────────────────────────────────────────────────
// attendance/dayStatus.js — the nine legend chips, derived once.
//
// The per-member history endpoints became DENSE on 2026-09-20: `records[]` now
// carries one entry for EVERY calendar day in the range, not only the days with
// a row in `attendance_records`. A day with no punch arrives with `id: null`,
// the resolved reason in `status`, and `null` in every metric field.
//
// That removes the guessing the calendar used to do — a missing day could have
// been a weekly off, a holiday, an absence, a future day or a gap in the data,
// and they all rendered identically. The reason is now stated.
//
// `status` supplies seven of the nine chips. LATE and UPCOMING are deliberately
// left to the client (contract §8): there is no `late` status — lateness is
// `late_minutes > 0` on an otherwise present day — and UPCOMING is a date
// comparison so it stays consistent across every attendance readout.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeStatusKey } from "./enums.js";
import { todayYMD, ymdOnly } from "./dates.js";

/**
 * A metric from a dense row. `null` means "no data", which is NOT zero:
 * `overtime_minutes: 0` on a worked day and `null` on a weekly off are
 * different facts, and averaging them together is how a month of Sundays
 * silently drags an average down (contract §10).
 *
 * @returns {number|null}
 */
export function metric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `true` when the backend synthesized this day rather than reading a punch. */
export const isSynthesizedDay = (record) => !!record && (record.id === null || record.id === undefined);

/* ─── The chart's three bars ─────────────────────────────────────────────────
   One hue, three steps (user decision, 2026-10-14): the darkest purple is the
   people who were there, the mid tone the people who weren't due in, and the
   palest the people who should have been and weren't. Read top to bottom the
   scale says "fewer and fewer of the day accounted for", so a page of bars can
   be scanned by weight alone — the eye doesn't have to learn three hues first.

   This replaced a yellow/burgundy pair and, before it, a violet→cyan ramp
   across the week. Don't put either back: the ramp tinted a bar by its POSITION
   while these tint it by its MEANING, and the two can't both be true of the
   same bar. §5 makes rose the colour of a problem, but absence here is one
   slice of a stacked day beside two others, not an error state — the palest
   purple is the deliberate choice, not a missed mapping.

   Each bar is outlined in the next step down its own ramp (TREND_STROKES).
   Bars touch (`barGap={0}`), so the outline is what separates one from the
   next, and it is the only thing that makes the palest bar visible at all on a
   white card. */
export const TREND_COLORS = {
  present: "#5B21B6",  // violet-800 — dark
  on_leave: "#8B5CF6", // violet-500 — mid
  absent: "#DDD6FE",   // violet-200 — very light
};

/** The outline for each bar: the same hue, darker, so it never adds a colour. */
export const TREND_STROKES = {
  present: "#4C1D95",  // violet-900
  on_leave: "#6D28D9", // violet-700
  absent: "#A78BFA",   // violet-400
};

/**
 * The same three steps for a chart drawn on a DARK card — the landing page's
 * dashboard preview is the only one.
 *
 * It is the scale read from the other end, not a different palette. Visual
 * weight runs opposite to lightness on a dark surface: the darkest purple is
 * the heaviest mark on white and nearly invisible on near-black, so Present
 * takes the palest step there to stay the bar you see first. Same hue, same
 * hierarchy, same chart — flipping it is what keeps the preview looking like
 * the product instead of an inversion of it.
 */
export const TREND_COLORS_ON_DARK = {
  present: "#DDD6FE",  // violet-200
  on_leave: "#A78BFA", // violet-400
  absent: "#6D28D9",   // violet-700
};

/**
 * The nine chips, in legend order. Every tone is purple-family except `rose`,
 * which stays red for absence — the one thing on this grid that is a problem.
 *
 * `heat` is the calendar-cell fill, `tone` the badge tone shared with
 * StatusBadge. Both live here so a chip can never look like one thing in the
 * grid and another in the table.
 */
export const DAY_CHIPS = {
  present:    { label: "Present",    tone: "violet", heat: "bg-[#5B21B6] border-[#4C1D95] text-white" },
  late:       { label: "Late",       tone: "violet", heat: "bg-[#7C3AED] border-[#6D28D9] text-white" },
  half_day:   { label: "Half day",   tone: "violet", heat: "bg-[#9333EA] border-[#7E22CE] text-white" },
  on_leave:   { label: "On leave",   tone: "violet", heat: "bg-[#8B5CF6] border-[#6D28D9] text-white" },
  absent:     { label: "Absent",     tone: "violet", heat: "bg-[#DDD6FE] border-[#A78BFA] text-purple-950 font-bold" },
  holiday:    { label: "Holiday",    tone: "violet", heat: "bg-[#EDE9FE] border-[#DDD6FE] text-purple-800" },
  weekly_off: { label: "Weekly off", tone: "slate",  heat: "bg-[#F5F3FF] border-[#E9D5FF] text-purple-600" },
  no_data:    { label: "No data",    tone: "slate",  heat: "bg-slate-50 border-slate-200 text-slate-400" },
  upcoming:   { label: "Upcoming",   tone: "slate",  heat: "bg-white border-dashed border-purple-200 text-purple-300" },
};

/** Legend order — worked days first, then non-working, then the two unknowns. */
export const DAY_CHIP_ORDER = [
  "present", "late", "half_day", "on_leave", "absent", "holiday", "weekly_off", "no_data", "upcoming",
];

/**
 * Which of the nine chips a dense row is, per contract §8.
 *
 * A half day that was also late stays HALF DAY: the day type is the more
 * important fact, and the lateness is still shown as minutes in its own column.
 * LATE therefore only ever replaces PRESENT / IN PROGRESS.
 *
 * @param {object} record  one entry from `records[]`
 * @param {string} [today] `YYYY-MM-DD`, injectable for tests
 * @returns {"present"|"late"|"half_day"|"on_leave"|"absent"|"holiday"|"weekly_off"|"no_data"|"upcoming"}
 */
export function dayChipKey(record, today = todayYMD()) {
  const status = normalizeStatusKey(record?.status);
  const date = ymdOnly(record?.date);

  // `not_marked` is the backend's "nothing to report": pre-joining, today not
  // yet marked, or a future working day. Only the date separates the last case.
  if (status === "not_marked" || !status) {
    return date && date > today ? "upcoming" : "no_data";
  }

  if (status === "present" || status === "in_progress") {
    return metric(record?.late_minutes) > 0 || record?.is_late === true ? "late" : "present";
  }

  return DAY_CHIPS[status] ? status : "no_data";
}

/** The chip's display metadata, never undefined. */
export function dayChip(record, today) {
  const key = dayChipKey(record, today);
  return { key, ...DAY_CHIPS[key] };
}

/**
 * Whether the day could ever have had a punch. Used to decide between showing
 * a dash and showing a real zero: "0m" on a Sunday claims someone worked no
 * hours, when in fact no hours were due.
 */
export function isWorkingDay(record, today) {
  const key = dayChipKey(record, today);
  return key !== "weekly_off" && key !== "holiday" && key !== "upcoming";
}

/**
 * Did this person actually turn up on this day?
 *
 * Needed before showing ANY lateness or punctuality verdict. An absent day
 * arrives with `late_minutes: 0` — a real zero, not a null — so a
 * "both fields are null" guard lets it through and the row reads "On time" for
 * somebody who never came in (UI/UX review 2026-10-06, Issue 2). Lateness is
 * only meaningful against an actual arrival, so the question is attendance, not
 * whether the minutes happen to be zero.
 */
export function attendedDay(record, today) {
  const key = dayChipKey(record, today);
  return key === "present" || key === "late" || key === "half_day";
}

/**
 * Totals over a dense range that ignore `null` rather than counting it as 0.
 * Returns `{ sum, count }` so a caller can average over the days that actually
 * carried a number.
 */
export function sumMetric(records, field) {
  let sum = 0;
  let count = 0;
  (Array.isArray(records) ? records : []).forEach((r) => {
    const v = metric(r?.[field]);
    if (v !== null) { sum += v; count += 1; }
  });
  return { sum, count };
}

/** Tally of each chip across a dense range — the grid's summary strip. */
export function chipTally(records, today) {
  const counts = {};
  DAY_CHIP_ORDER.forEach((k) => { counts[k] = 0; });
  (Array.isArray(records) ? records : []).forEach((r) => { counts[dayChipKey(r, today)] += 1; });
  return counts;
}

// ── Day-status provenance (contract 2026-10-04) ──────────────────────────────
// The read endpoints now say WHERE a day's `status` came from and whether it can
// still change on its own: `status_source` ("record" | "derived"),
// `status_reason` (which rule decided it) and `is_provisional` (true = not yet
// settled). The key fact: a derived holiday / weekly off is permanent (the
// 07:00 cron never writes those rows), but a derived `absent` / `not_marked` is
// a projection a punch or that cron may still replace. We read these only to
// explain a day honestly in the day inspector — an "absent" that really means
// "the day's cut-off hasn't run yet" must not read as a confirmed absence.
//
// Older payloads that predate the contract carry none of these keys:
// `is_provisional` is then undefined (treated as settled) and `statusReasonNote`
// returns null, so the inspector degrades to exactly what it showed before.

/** True when the day's status can still change by itself (not yet settled). */
export const isProvisionalDay = (record) => record?.is_provisional === true;

// Keyed by `status_reason`. `record`, `holiday` and `weekly_off` are deliberately
// absent: a real row explains itself, and a holiday / weekly off is named instead
// by its `status_context` rule (dayContextLabel), which is more use than a note.
const STATUS_REASON_NOTES = {
  awaiting_absent_cron: "Counted as absent because nothing was recorded and the day’s cut-off hasn’t run yet — a clock-in or correction can still change this.",
  pending_clock_in: "Still expected in today. Nothing has been clocked yet.",
  upcoming: "A working day still to come — nothing is owed yet.",
  in_progress: "Still clocked in. This settles on clock-out.",
  before_joining: "Hadn’t joined yet on this day, so nothing was due.",
};

/** A plain sentence explaining a derived / provisional status, or null. */
export function statusReasonNote(record) {
  return STATUS_REASON_NOTES[normalizeStatusKey(record?.status_reason)] || null;
}

/**
 * The holiday or weekly-off rule that decided a derived day, from the detail
 * endpoints' `status_context` (null on record-backed days). The backend sends
 * the highest-priority applicable rule — the same one that decided the day.
 * @returns {{ kind: string, name: string }|null}
 */
export function dayContextLabel(context) {
  if (!context) return null;
  if (context.holiday?.name) return { kind: "holiday", name: context.holiday.name };
  if (context.weekly_off?.name) return { kind: "weekly off", name: context.weekly_off.name };
  return null;
}
