// ─────────────────────────────────────────────────────────────────────────────
// taskFormMeta.js — The field styling and the deadline conversions the task
// forms share. Here rather than in TaskFormFields.jsx because that file exports
// components, and mixing helpers into it breaks fast refresh (CLAUDE.md §8).
//
// The class strings are the house form look: an 11px uppercase label above a
// 44px-high field, rose border when it's wrong. They match the Create
// Attendance Policy dialog field for field, so a task form and a policy form
// read as the same product.
// ─────────────────────────────────────────────────────────────────────────────

import { combineLocalDateTime, toLocalHHMM, toLocalYMD } from "../attendance/dates";

export const labelClass = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5";

export const inputClass = (invalid) =>
  `w-full h-11 bg-slate-50/70 border rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all ${invalid ? "border-rose-300" : "border-slate-200"}`;

export const textareaClass = (invalid) =>
  `w-full bg-slate-50/70 border rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all resize-y ${invalid ? "border-rose-300" : "border-slate-200"}`;

/**
 * An ISO instant split into the two controls a deadline is edited with.
 * A deadline is an instant, not a date (the server compares it with
 * `now + 15 minutes`), so it is always edited as date + time of day.
 */
export function splitDueDate(iso) {
  if (!iso) return { date: "", time: "" };
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return { date: "", time: "" };
  return { date: toLocalYMD(when), time: toLocalHHMM(iso) };
}

/**
 * The two controls back into an ISO instant, or "" when either is missing.
 * `combineLocalDateTime` already returns the ISO string, so nothing here
 * re-parses it — doing that is how a date crosses a timezone twice.
 */
export function joinDueDate({ date, time }) {
  if (!date || !time) return "";
  return combineLocalDateTime(date, time);
}
