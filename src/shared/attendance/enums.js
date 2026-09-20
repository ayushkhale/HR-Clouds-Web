// ─────────────────────────────────────────────────────────────────────────────
// attendance/enums.js — Backend enums and their display metadata.
//
// Values come from the attendance API docs. Where a value appears in live data
// but not in the docs it is listed for DISPLAY only (never sent as a filter),
// and marked with a comment referencing the audit clarification item.
// Tailwind class strings are literal so the JIT compiler can see them.
// ─────────────────────────────────────────────────────────────────────────────

// Tone keys are semantic names (emerald = success, amber = pending, …); every
// tone renders as a purple-family shade so badges stay on theme but remain
// distinguishable from each other. Rose stays red for errors/absence.
export const TONE_CLASSES = {
  emerald: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  blue: "bg-indigo-50 text-indigo-700 border-indigo-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  sky: "bg-white text-indigo-600 border-indigo-300",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-300",
  orange: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};

export const TONE_DOT = {
  emerald: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-fuchsia-500",
  blue: "bg-indigo-500",
  purple: "bg-purple-500",
  sky: "bg-indigo-300",
  indigo: "bg-indigo-700",
  orange: "bg-fuchsia-700",
  slate: "bg-slate-300",
};

/** "half-day" / "Half Day" / "HALF_DAY" → "half_day" */
export function normalizeStatusKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** "excessive_break" → "Excessive break" */
export function humanize(value) {
  const s = String(value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// ── attendance_records.status ────────────────────────────────────────────────
export const RECORD_STATUS = {
  present: { label: "Present", tone: "emerald" },
  absent: { label: "Absent", tone: "rose" },
  half_day: { label: "Half Day", tone: "blue" },
  on_leave: { label: "On Leave", tone: "purple" },
  in_progress: { label: "In Progress", tone: "sky" },
  weekly_off: { label: "Weekly Off", tone: "slate" },
  holiday: { label: "Holiday", tone: "indigo" },
  not_marked: { label: "Not Marked", tone: "slate" },
  // The two chips the dense history endpoints leave to the client (contract
  // §8): `not_marked` splits into these by date. Listed here so a badge
  // rendered from a chip key picks up the right tone rather than the fallback.
  no_data: { label: "No data", tone: "slate" },
  upcoming: { label: "Upcoming", tone: "slate" },
  // Display-only legacy values seen in list payloads.
  late: { label: "Late", tone: "amber" },
  overtime: { label: "Overtime", tone: "orange" },
};

// Record-status filter for the HR list / daily report `status` query (§5.8, §6.1).
export const RECORD_STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half day" },
  { value: "on_leave", label: "On leave" },
  { value: "holiday", label: "Holiday" },
  { value: "weekly_off", label: "Weekly off" },
];

// ── Regularization requests (U7 filter enum) ─────────────────────────────────
export const REGULARIZATION_STATUS = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};
export const REGULARIZATION_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Comp-offs (contract §2 C11) ──────────────────────────────────────────────
// The five values the service writes. There is no `rejected` state: the reject
// endpoint writes `cancelled`, so "Cancelled" must read as "rejected or cancelled".
export const COMP_OFF_STATUS = {
  earned: { label: "Earned · awaiting approval", short: "Earned", tone: "amber" },
  approved: { label: "Approved", short: "Approved", tone: "emerald" },
  used: { label: "Used", short: "Used", tone: "blue" },
  expired: { label: "Expired", short: "Expired", tone: "slate" },
  cancelled: { label: "Rejected or cancelled", short: "Rejected / cancelled", tone: "rose" },
};
export const COMP_OFF_FILTERS = [
  { value: "", label: "All" },
  { value: "earned", label: "Earned" },
  { value: "approved", label: "Approved" },
  { value: "used", label: "Used" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Rejected / cancelled" },
];

// ── Overtime requests ────────────────────────────────────────────────────────
export const OVERTIME_STATUS = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

// ── Anomalies (contract §2 C16) ──────────────────────────────────────────────
// The query filter is `status=open|resolved|all`, but records have NO status
// column — they carry `is_resolved` (boolean). Always derive the key with
// anomalyStatusKey(). `type` and `severity` are free-form strings.
export const ANOMALY_STATUS = {
  open: { label: "Open", tone: "amber" },
  resolved: { label: "Resolved", tone: "emerald" },
};
export const anomalyStatusKey = (anomaly) => (anomaly?.is_resolved === true || !!anomaly?.resolved_at ? "resolved" : "open");
export const ANOMALY_FILTERS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export const ANOMALY_TYPE_LABELS = {
  out_of_bounds: "Punch outside office geofence",
  excessive_break: "Break exceeded policy limit",
  late_arrival: "Late arrival",
  late: "Late arrival",
  early_exit: "Early exit",
  missing_clock_out: "Missing clock-out",
  missed_clock_out: "Missing clock-out",
  auto_clock_out: "Auto clocked out",
  multiple_sessions: "Multiple sessions",
};
export const anomalyTypeLabel = (type) => ANOMALY_TYPE_LABELS[normalizeStatusKey(type)] || humanize(type) || "Anomaly";

export const SEVERITY = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "rose" },
  critical: { label: "Critical", tone: "rose" },
};

// ── Shift templates ──────────────────────────────────────────────────────────
// Descriptive tags only: every type is calculated from start/end time and the
// policy (update_shift_templates_2026_09_14.md §3.3).
export const SHIFT_TYPES = {
  fixed: { label: "Fixed", description: "Same start and end time every day" },
  flexible: { label: "Flexible", description: "No set start or end time" },
  split: { label: "Split", description: "Worked out like Fixed; no second work block" },
  night: { label: "Night", description: "Starts one day, ends the next" },
  rotational: { label: "Rotational", description: "Cycles through shifts via a rotation pattern" },
};

// ── Punch payload enums (U1) ─────────────────────────────────────────────────
export const PUNCH_SOURCE_WEB = "web";
export const WORK_MODES = [
  { value: "office", label: "Office" },
  { value: "remote", label: "Remote" },
  { value: "field", label: "Field" },
  { value: "hybrid", label: "Hybrid" },
];
export const WORK_MODE_VALUES = WORK_MODES.map((m) => m.value);

export const PUNCH_TYPE_LABELS = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  break_start: "Break started",
  break_end: "Break ended",
};

// JavaScript `Date#getDay()` convention: 0 = Sunday … 6 = Saturday (audit C8).
export const WEEKDAYS = [
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
];

const STATUS_MAPS = {
  record: RECORD_STATUS,
  regularization: REGULARIZATION_STATUS,
  compoff: COMP_OFF_STATUS,
  overtime: OVERTIME_STATUS,
  anomaly: ANOMALY_STATUS,
  severity: SEVERITY,
};

/** Resolve `{label, tone}` for a status of a given kind, with a safe fallback. */
export function statusMeta(kind, status) {
  const key = normalizeStatusKey(status);
  const map = STATUS_MAPS[kind] || RECORD_STATUS;
  const meta = map[key];
  if (meta) return { key, label: meta.short || meta.label, longLabel: meta.label, tone: meta.tone };
  return { key, label: humanize(key) || "N/A", longLabel: humanize(key) || "N/A", tone: "slate" };
}
