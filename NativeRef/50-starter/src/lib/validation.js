// ─────────────────────────────────────────────────────────────────────────────
// attendance/validation.js — Pure form validators.
// Each returns `{ errors, payload }`: `errors` maps field → message (empty when
// valid) and `payload` is the exact request body to send.
//
// Field names, types and ranges mirror the backend Joi validators documented in
// ATTENDANCE_API_CONTRACT.md §4–§5. The backend strips unknown keys silently
// (§1.8), so a payload must never carry a key the schema doesn't declare.
// Where the backend does NOT enforce a rule (half ≤ full day, per-shift-type
// times, rotation cycle = Σ durations) these validators are the only guard.
// ─────────────────────────────────────────────────────────────────────────────

import { combineLocalDateTime, parseYMDLocal, todayYMD } from "./dates.js";
import { WORK_MODE_VALUES } from "./enums.js";

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const toNumber = (v) => (isBlank(v) ? NaN : Number(v));
const isInt = (v) => Number.isInteger(toNumber(v));
const nullable = (n) => (n === undefined ? null : n);
const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0;
export const NAME_MAX = 150;

function rangeMessage(label, min, max, exclusiveMin) {
  if (max === Infinity) return exclusiveMin ? `${label} must be greater than ${min}.` : `${label} must be at least ${min}.`;
  return exclusiveMin ? `${label} must be greater than ${min} and at most ${max}.` : `${label} must be between ${min} and ${max}.`;
}

function intInRange(errors, key, value, { min, max = Infinity, label, required = true }) {
  if (isBlank(value)) {
    if (required) errors[key] = `${label} is required.`;
    return undefined;
  }
  const n = toNumber(value);
  if (!Number.isInteger(n)) errors[key] = `${label} must be a whole number.`;
  else if (n < min || n > max) errors[key] = rangeMessage(label, min, max, false);
  return n;
}

function decimalInRange(errors, key, value, { min, max = Infinity, label, required = true, exclusiveMin = false }) {
  if (isBlank(value)) {
    if (required) errors[key] = `${label} is required.`;
    return undefined;
  }
  const n = toNumber(value);
  if (!Number.isFinite(n)) errors[key] = `${label} must be a number.`;
  else if ((exclusiveMin ? n <= min : n < min) || n > max) errors[key] = rangeMessage(label, min, max, exclusiveMin);
  return n;
}

function requiredName(errors, value, label) {
  const name = String(value || "").trim();
  if (!name) errors.name = `${label} is required.`;
  else if (name.length > NAME_MAX) errors.name = `${label} can't exceed ${NAME_MAX} characters.`;
  return name;
}

function optionalEndDate(errors, key, from, to, label = "End date") {
  if (isBlank(to)) return null;
  if (!parseYMDLocal(to)) errors[key] = `Enter a valid ${label.toLowerCase()}.`;
  else if (from && to < from) errors[key] = `${label} can't be before the start date.`;
  return to;
}

// ── §4.4 POST /attendance/regularization ────────────────────────────────────
export const REGULARIZATION_REASON_MIN = 5;
export const REGULARIZATION_REASON_MAX = 1000;

/**
 * Times are sent as full ISO datetimes so overnight corrections are unambiguous (§1.7).
 * @param {{date: string, clockIn?: string, clockOut?: string, outNextDay?: boolean, reason: string, work_mode?: string}} form
 */
export function validateRegularization(form, { today = todayYMD(), now = new Date() } = {}) {
  const errors = {};
  const reason = String(form.reason || "").trim();

  if (!form.date || !parseYMDLocal(form.date)) errors.date = "Select the date you want to correct.";
  else if (form.date >= today) errors.date = "Only past dates can be corrected.";

  // Schema: .or('requested_clock_in', 'requested_clock_out')
  if (!form.clockIn && !form.clockOut) errors.times = "Enter a corrected clock-in time, clock-out time, or both.";

  const inIso = form.clockIn && form.date ? combineLocalDateTime(form.date, form.clockIn) : "";
  const outIso = form.clockOut && form.date ? combineLocalDateTime(form.date, form.clockOut, { nextDay: !!form.outNextDay }) : "";

  if (form.clockIn && !inIso && !errors.date) errors.clockIn = "Enter a valid clock-in time.";
  if (form.clockOut && !outIso && !errors.date) errors.clockOut = "Enter a valid clock-out time.";

  if (inIso && outIso) {
    const diff = new Date(outIso) - new Date(inIso);
    if (diff <= 0) errors.clockOut = "Clock-out must be after clock-in. If the shift ended after midnight, tick “Next day”.";
    else if (diff > 24 * 60 * 60 * 1000) errors.clockOut = "A corrected day can't be longer than 24 hours.";
  }
  if (outIso && new Date(outIso) > now && !errors.clockOut) errors.clockOut = "Clock-out can't be in the future.";

  if (reason.length < REGULARIZATION_REASON_MIN) errors.reason = `Reason must be at least ${REGULARIZATION_REASON_MIN} characters.`;
  else if (reason.length > REGULARIZATION_REASON_MAX) errors.reason = `Reason can't exceed ${REGULARIZATION_REASON_MAX} characters.`;

  if (form.work_mode && !WORK_MODE_VALUES.includes(form.work_mode)) errors.work_mode = "Choose a valid work mode.";

  const payload = { date: form.date, reason };
  if (inIso) payload.requested_clock_in = inIso;
  if (outIso) payload.requested_clock_out = outIso;
  if (form.work_mode && WORK_MODE_VALUES.includes(form.work_mode)) payload.work_mode = form.work_mode;
  return { errors, payload };
}

// ── §4.1 punch notes / §6.3 decision remarks ────────────────────────────────
export const PUNCH_NOTES_MAX = 500;
export const DECISION_REMARKS_MAX = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// TRIMMED FOR THE EMPLOYEE APP.
// The web file also carries validatePolicy, validateShift, validateRotation,
// validateLock, validateCompOffPolicy, validateWeeklyOff, validateAssignment
// and validateEndAssignment — all HR configuration forms this app never shows.
// Port them from src/shared/attendance/validation.js if the manager/HR app
// ever lands here. Add the employee form validators (leave, claim, bank,
// declaration) below, in the same { errors, payload } shape.
// ─────────────────────────────────────────────────────────────────────────────
