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
  else if (form.date >= today) errors.date = "Only past dates can be regularized.";

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

// ── §5.1 Attendance policy ──────────────────────────────────────────────────
export const MISSING_PUNCH_ACTIONS = [
  { value: "flag", label: "Flag for review" },
  { value: "half_day", label: "Mark as half day" },
  { value: "absent", label: "Mark as absent" },
];

/** Every settable field is sent on create and update; nullable limits are sent as `null` to clear them. */
export function validatePolicy(form) {
  const errors = {};
  const name = requiredName(errors, form.name, "Policy name");

  const grace = intInRange(errors, "grace_minutes", form.grace_minutes, { min: 0, max: 120, label: "Grace period" });
  const lateThreshold = intInRange(errors, "late_threshold_minutes", form.late_threshold_minutes, { min: 0, max: 480, label: "Late threshold", required: false });
  const half = decimalInRange(errors, "half_day_min_hours", form.half_day_min_hours, { min: 1, max: 24, label: "Half-day hours" });
  const full = decimalInRange(errors, "full_day_min_hours", form.full_day_min_hours, { min: 1, max: 24, label: "Full-day hours" });
  // Not validated by the backend (§5.1) — this is the only guard.
  if (!errors.half_day_min_hours && !errors.full_day_min_hours && half > full) {
    errors.half_day_min_hours = "Half-day hours can't be more than full-day hours.";
  }
  const earlyExit = intInRange(errors, "early_exit_threshold_minutes", form.early_exit_threshold_minutes, { min: 0, max: 480, label: "Early exit threshold", required: false });

  const maxBreak = intInRange(errors, "max_break_duration_minutes", form.max_break_duration_minutes, { min: 0, max: 1440, label: "Maximum break duration", required: false });
  const maxBreaks = intInRange(errors, "max_breaks_per_day", form.max_breaks_per_day, { min: 0, max: 100, label: "Maximum breaks per day", required: false });

  const otEnabled = !!form.overtime_enabled;
  const otMin = otEnabled ? intInRange(errors, "overtime_min_minutes", form.overtime_min_minutes, { min: 0, max: 480, label: "Minimum overtime" }) : undefined;

  const autoOut = !!form.auto_clock_out_enabled;
  const autoOutHours = autoOut
    ? decimalInRange(errors, "auto_clock_out_after_hours", form.auto_clock_out_after_hours, { min: 1, max: 24, label: "Auto clock-out after" })
    : undefined;

  const regAllowed = !!form.regularization_allowed;
  const window = regAllowed
    ? intInRange(errors, "regularization_window_days", form.regularization_window_days, { min: 1, max: 365, label: "Correction window" })
    : undefined;

  const missingPunch = form.missing_punch_action || "flag";
  if (!MISSING_PUNCH_ACTIONS.some((a) => a.value === missingPunch)) errors.missing_punch_action = "Choose what happens to a missing punch.";

  const lateCountHalf = intInRange(errors, "late_count_half_day_threshold", form.late_count_half_day_threshold, { min: 1, max: 365, label: "Late arrivals per half day", required: false });
  const consecutiveLate = intInRange(errors, "consecutive_late_penalty_days", form.consecutive_late_penalty_days, { min: 1, max: 365, label: "Consecutive late days", required: false });

  const payload = {
    name,
    is_default: !!form.is_default,
    grace_minutes: grace,
    late_threshold_minutes: lateThreshold ?? 0,
    half_day_min_hours: half,
    full_day_min_hours: full,
    early_exit_threshold_minutes: earlyExit ?? 0,
    max_break_duration_minutes: nullable(maxBreak),
    max_breaks_per_day: nullable(maxBreaks),
    overtime_enabled: otEnabled,
    overtime_requires_approval: form.overtime_requires_approval !== false,
    auto_clock_out_enabled: autoOut,
    auto_detect_shift: !!form.auto_detect_shift,
    missing_punch_action: missingPunch,
    regularization_allowed: regAllowed,
    comp_off_on_holiday_work: !!form.comp_off_on_holiday_work,
    late_count_half_day_threshold: nullable(lateCountHalf),
    consecutive_late_penalty_days: nullable(consecutiveLate),
  };
  if (otMin !== undefined) payload.overtime_min_minutes = otMin;
  if (autoOutHours !== undefined) payload.auto_clock_out_after_hours = autoOutHours;
  if (window !== undefined) payload.regularization_window_days = window;
  return { errors, payload };
}

// ── §5.2 Shift template ─────────────────────────────────────────────────────
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Per-type time requirements are not enforced by the backend (§5.2). */
export function validateShift(form, { isEdit = false, hadPolicy = false } = {}) {
  const errors = {};
  const type = form.type || "fixed";
  const name = requiredName(errors, form.name, "Shift name");

  const time = (key, label) => {
    if (!HHMM_RE.test(String(form[key] || ""))) errors[key] = `${label} is required.`;
    return form[key];
  };

  const payload = { name, type };
  if (form.policy_id) payload.policy_id = form.policy_id;
  else if (isEdit && hadPolicy) payload.policy_id = null;

  if (type === "fixed" || type === "night" || type === "split") {
    const start = time("start_time", type === "split" ? "First block start" : "Start time");
    const end = time("end_time", type === "split" ? "First block end" : "End time");
    if (!errors.start_time && !errors.end_time && start === end) errors.end_time = "End time must differ from the start time.";
    payload.start_time = start;
    payload.end_time = end;
    if (type === "night" || (type === "fixed" && end < start)) payload.is_overnight = true;
    else payload.is_overnight = false;
    if (type === "split" && !errors.start_time && !errors.end_time && end < start) {
      errors.end_time = "Each split block must end on the same day it starts.";
    }
  }

  if (type === "split") {
    const s2 = time("split_start_time_2", "Second block start");
    const e2 = time("split_end_time_2", "Second block end");
    if (!errors.split_start_time_2 && !errors.split_end_time_2 && e2 <= s2) errors.split_end_time_2 = "Second block must end after it starts.";
    if (!errors.end_time && !errors.split_start_time_2 && s2 < form.end_time) errors.split_start_time_2 = "Second block must start after the first block ends.";
    payload.split_start_time_2 = s2;
    payload.split_end_time_2 = e2;
  }

  if (type === "flexible") {
    payload.min_hours = decimalInRange(errors, "min_hours", form.min_hours, { min: 0, max: 24, exclusiveMin: true, label: "Minimum hours" });
    payload.is_overnight = false;
    const hasCore = form.core_start_time || form.core_end_time;
    if (hasCore) {
      const cs = time("core_start_time", "Core start");
      const ce = time("core_end_time", "Core end");
      if (!errors.core_start_time && !errors.core_end_time && ce <= cs) errors.core_end_time = "Core hours must end after they start.";
      payload.core_start_time = cs;
      payload.core_end_time = ce;
    } else if (isEdit) {
      payload.core_start_time = null;
      payload.core_end_time = null;
    }
  }

  const before = intInRange(errors, "buffer_minutes_before", form.buffer_minutes_before, { min: 0, max: 480, label: "Early entry buffer", required: false });
  const after = intInRange(errors, "buffer_minutes_after", form.buffer_minutes_after, { min: 0, max: 480, label: "Late entry buffer", required: false });
  payload.buffer_minutes_before = before ?? 0;
  payload.buffer_minutes_after = after ?? 0;

  return { errors, payload };
}

// ── §5.3 Rotation pattern ───────────────────────────────────────────────────
export const ROTATION_CYCLE_MAX = 365;

/**
 * Every entry must reference a shift: the backend schema has `shift_id` as a
 * required UUID and no off-day flag (contract §2 C5), so off-day phases can't
 * be expressed. Rest days come from weekly-off rules targeted at the shifts.
 * `rotation_cycle_days` is required and NOT checked against Σ duration_days by
 * the backend, so it is always derived here.
 * @param {{name: string, start_reference_date: string, entries: Array<{shift_id: string, duration_days: number|string}>}} form
 */
export function validateRotation(form) {
  const errors = {};
  const name = requiredName(errors, form.name, "Rotation name");
  if (!form.start_reference_date || !parseYMDLocal(form.start_reference_date)) errors.start_reference_date = "Select the date the cycle starts from.";

  const entries = Array.isArray(form.entries) ? form.entries : [];
  if (entries.length === 0) errors.entries = "Add at least one shift phase.";
  let total = 0;
  const entryErrors = entries.map((entry) => {
    const e = {};
    if (!entry.shift_id) e.shift_id = "Select a shift for this phase.";
    if (!isInt(entry.duration_days) || Number(entry.duration_days) < 1) e.duration_days = "At least 1 day.";
    else total += Number(entry.duration_days);
    return e;
  });
  if (entryErrors.some(hasErrors)) errors.entryErrors = entryErrors;
  if (total > ROTATION_CYCLE_MAX) errors.entries = `A rotation cycle can't be longer than ${ROTATION_CYCLE_MAX} days.`;

  const payload = {
    name,
    rotation_cycle_days: total,
    start_reference_date: form.start_reference_date,
    entries: entries.map((entry, index) => ({
      shift_id: entry.shift_id,
      sequence_order: index + 1,
      duration_days: Number(entry.duration_days),
    })),
  };
  return { errors, payload };
}

// ── §5.7 Payroll lock ───────────────────────────────────────────────────────
export const LOCK_REASON_MAX = 255;

/** Schema: `{ start_date, end_date, reason? }` with end ≥ start. */
export function validateLock(form) {
  const errors = {};
  const reason = String(form.reason || "").trim();
  if (!form.start_date || !parseYMDLocal(form.start_date)) errors.start_date = "Select a start date.";
  if (!form.end_date || !parseYMDLocal(form.end_date)) errors.end_date = "Select an end date.";
  if (!errors.start_date && !errors.end_date && form.end_date < form.start_date) errors.end_date = "End date can't be before the start date.";
  if (reason.length > LOCK_REASON_MAX) errors.reason = `Reason can't exceed ${LOCK_REASON_MAX} characters.`;
  const payload = { start_date: form.start_date, end_date: form.end_date };
  if (reason) payload.reason = reason;
  return { errors, payload };
}

// ── §5.6 Comp-off policy ────────────────────────────────────────────────────
export function validateCompOffPolicy(form) {
  const errors = {};
  const name = requiredName(errors, form.name, "Policy name");
  const half = decimalInRange(errors, "min_hours_for_half_day", form.min_hours_for_half_day, { min: 0, max: 24, label: "Half-day minimum hours", required: false });
  const full = decimalInRange(errors, "min_hours_for_full_day", form.min_hours_for_full_day, { min: 0, max: 24, label: "Full-day minimum hours", required: false });
  if (half !== undefined && full !== undefined && !errors.min_hours_for_half_day && !errors.min_hours_for_full_day && half > full) {
    errors.min_hours_for_half_day = "Half-day hours can't be more than full-day hours.";
  }
  // Backend allows 0, but a zero multiplier credits nothing — guarded here.
  const multiplier = decimalInRange(errors, "multiplier", form.multiplier, { min: 0, max: 10, exclusiveMin: true, label: "Multiplier" });
  const validity = intInRange(errors, "validity_days", form.validity_days, { min: 1, max: 365, label: "Validity", required: false });
  const maxAccumulation = intInRange(errors, "max_accumulation", form.max_accumulation, { min: 1, max: 365, label: "Maximum balance", required: false });
  const priority = intInRange(errors, "priority", form.priority, { min: 0, max: 999, label: "Priority", required: false });
  return {
    errors,
    payload: {
      name,
      min_hours_for_half_day: nullable(half),
      min_hours_for_full_day: nullable(full),
      multiplier,
      validity_days: nullable(validity),
      requires_approval: !!form.requires_approval,
      max_accumulation: nullable(maxAccumulation),
      priority: priority ?? 0,
      target_departments: idList(form.target_departments),
      target_locations: idList(form.target_locations),
      target_employment_types: idList(form.target_employment_types),
      target_job_statuses: idList(form.target_job_statuses),
    },
  };
}

// ── §5.5 Weekly-off rule ────────────────────────────────────────────────────
/**
 * Weekly-off rules target `target_users` — they have NO `included_users` /
 * `excluded_users` (those exist on holidays only; §5.5). Days use Date#getDay()
 * numbering (0 = Sunday).
 */
export function validateWeeklyOff(form) {
  const errors = {};
  const name = requiredName(errors, form.name, "Rule name");
  const days = [...new Set((form.days_of_week || []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (days.length === 0) errors.days_of_week = "Select at least one day.";
  const priority = intInRange(errors, "priority", form.priority, { min: 0, max: 999, label: "Priority" });
  if (!form.effective_from || !parseYMDLocal(form.effective_from)) errors.effective_from = "Choose the date this rule starts applying.";
  const effectiveTo = optionalEndDate(errors, "effective_to", form.effective_from, form.effective_to, "End date");
  return {
    errors,
    payload: {
      name,
      days_of_week: days,
      priority,
      effective_from: form.effective_from,
      effective_to: effectiveTo,
      target_departments: idList(form.target_departments),
      target_locations: idList(form.target_locations),
      target_shifts: idList(form.target_shifts),
      target_users: idList(form.target_users),
      target_employment_types: idList(form.target_employment_types),
      target_job_statuses: idList(form.target_job_statuses),
    },
  };
}

// ── §2 C6 Assign shift / §5.4 End assignment ────────────────────────────────
/** Schema is `.xor('shift_id', 'rotation_pattern_id')` — exactly one is sent. */
export function validateAssignment(form) {
  const errors = {};
  const isRotation = form.assignType === "rotation";
  if (!form.user_id) errors.user_id = "Select an employee.";
  if (isRotation && !form.rotation_pattern_id) errors.rotation_pattern_id = "Select a rotation pattern.";
  if (!isRotation && !form.shift_id) errors.shift_id = "Select a shift.";
  if (!form.effective_from || !parseYMDLocal(form.effective_from)) errors.effective_from = "Select the date this assignment starts.";
  const effectiveTo = optionalEndDate(errors, "effective_to", form.effective_from, form.effective_to, "End date");

  const payload = { user_id: form.user_id, effective_from: form.effective_from };
  if (isRotation) payload.rotation_pattern_id = form.rotation_pattern_id;
  else payload.shift_id = form.shift_id;
  if (effectiveTo) payload.effective_to = effectiveTo;
  return { errors, payload };
}

export function validateEndAssignment({ effective_to, effective_from }) {
  const errors = {};
  if (!effective_to || !parseYMDLocal(effective_to)) errors.effective_to = "Select an end date.";
  else if (effective_from && effective_to < effective_from) errors.effective_to = "End date can't be before the assignment's start date.";
  return { errors, payload: { effective_to } };
}
