// ─────────────────────────────────────────────────────────────────────────────
// api/attendance.api.js — SELF-SERVICE ATTENDANCE ONLY.
//
// This app is the employee workspace, so there is no `/attendance/hr/*` or
// `/attendance/manager/*` method in here — not even a commented-out one. The
// self-service routes below are authorised for every org role, which is exactly
// why the app needs its own role gate (state/session.js).
//
// Contract source of truth:
//   public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md
//
// Every query goes through qs() so a cleared filter never reaches the URL as
// `?status=` — which is a 400 on several endpoints. Unknown keys are SILENTLY
// STRIPPED server-side (stripUnknown wins over allowUnknown), so a 200 is not
// evidence that a field was understood: verify by reading the record back.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';

/**
 * Query string from a params object, dropping undefined / null / "".
 * @returns {string} "" or "?a=1&b=2"
 */
export function qs(params = {}) {
  const parts = [];
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'number' && Number.isNaN(value)) return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

// Path params are URI-encoded: a malformed id must not change which endpoint
// is called.
export const seg = (value) => encodeURIComponent(String(value ?? ''));

const post = (path, payload) =>
  request(path, payload === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(payload) });

export const attendanceAPI = {
  // ── Punch (U1–U4) ──────────────────────────────────────────────────────────
  /**
   * body: { source, latitude?, longitude?, client_timestamp?, notes?,
   *         work_mode?, metadata? }
   *
   * `source` is 'mobile' for this app. Coordinates are OPTIONAL and nullable —
   * the backend accepts a punch without them and raises its own flag, so a
   * punch must NEVER be blocked on location.
   *
   * `work_mode` only for a HYBRID contract: for anyone else the server
   * overrides it, and sending it anyway raises a `work_mode_claim_mismatch`
   * flag against the employee.
   *
   * Errors: ALREADY_CLOCKED_IN (409), PREVIOUS_SHIFT_OPEN (409),
   *         PERIOD_LOCKED (403 — not DATE_LOCKED, which never existed).
   */
  clockIn: (payload) => post('/attendance/clock-in', payload),

  /** Same as clock-in MINUS `work_mode` — not a clock-out field, silently stripped. */
  clockOut: (payload) => post('/attendance/clock-out', payload),

  /** body { source, notes? }. Errors: NOT_CLOCKED_IN, MAX_BREAKS_EXCEEDED. */
  breakStart: (payload = { source: 'mobile' }) => post('/attendance/break/start', payload),
  /** body { source, notes? }. Errors: NOT_CLOCKED_IN, NO_ACTIVE_BREAK. */
  breakEnd: (payload = { source: 'mobile' }) => post('/attendance/break/end', payload),

  // ── Today & history (U5, U11, U12) ─────────────────────────────────────────
  /**
   * MAY RETURN YESTERDAY: while an overnight record is still open, this returns
   * THAT record and `date` is yesterday. Always render from the returned
   * `date`, never from your own "today".
   */
  getToday: () => request('/attendance/today'),

  /**
   * `month`/`year` are NOT accepted — build the range with monthRange().
   * @param {{from?: string, to?: string, page?: number, limit?: number}} params
   */
  getHistory: (params = {}) => request(`/attendance/history${qs(params)}`),

  /** Defaults to the current IST month. Pass both explicitly. */
  getSummary: (month, year) => request(`/attendance/summary${qs({ month, year })}`),

  // ── Day detail & insights (U16–U19) ────────────────────────────────────────
  /** An OBJECT (record, logs, sessions, breaks, anomalies) — not an array. */
  getDailyLog: (date) => request(`/attendance/daily-log${qs({ date })}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${qs({ month, year })}`),
  /** @param {string} [date] YYYY-MM-DD — the week containing this date */
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${qs({ date })}`),
  /** @param {number} [months] 1–12 (backend default 3) */
  getTrends: (months) => request(`/attendance/trends${qs({ months })}`),

  // ── Shift & holidays (U13, U20) ────────────────────────────────────────────
  /**
   * Returns a WRAPPER: { assignment, shift, rotation, weekly_offs } — not a
   * bare shift. Reading `name` off the top level leaves the shift line blank.
   * A null `shift` means no assignment, which is a valid state.
   */
  getMyShift: () => request('/attendance/shift'),

  /** Takes NO parameters — a `year` is silently ignored. Filter client-side. */
  getUpcomingHolidays: () => request('/attendance/holidays'),

  // ── Work mode & field sites (2026-10-05) ───────────────────────────────────
  /**
   * The caller's own sites plus their contractual work mode:
   *   { user_id, work_mode, assigned_office, total, records[] }
   *
   * THE ONLY source for whether to show the work-mode toggle. `work_mode` here
   * is already normalised and fail-secure (a null contract reads as "office").
   * A failed read leaves the contract null, which HIDES the toggle and the
   * sites panel — a missing feature degrades to a hidden control, never a crash.
   */
  getMyFieldAssignments: () => request('/attendance/my-field-assignments'),

  // ── Corrections (U6–U8) ────────────────────────────────────────────────────
  /**
   * → 201. body: { date, requested_clock_in?, requested_clock_out?, reason,
   *                work_mode? }
   * At least ONE of the two times is required. `reason` is 5–1000 chars.
   * For an OVERNIGHT correction send full ISO datetimes — with bare "HH:mm"
   * the backend cannot tell the clock-out belongs to the next day.
   */
  submitRegularization: (payload) => post('/attendance/regularization', payload),

  /**
   * `status` is validated and then IGNORED by the controller. Fetch
   * unfiltered and filter the loaded page client-side — and say so in the UI.
   */
  getMyRegularizations: (params = {}) => request(`/attendance/regularizations${qs(params)}`),

  /** No body. Self-scoped. Errors: FORBIDDEN, ALREADY_PROCESSED, NOT_FOUND. */
  cancelRegularization: (id) => post(`/attendance/regularizations/${seg(id)}/cancel`),

  // ── Overtime (U9) ──────────────────────────────────────────────────────────
  /** `page`/`limit` only — NO status filter exists. */
  getMyOvertime: ({ page, limit } = {}) => request(`/attendance/overtime/mine${qs({ page, limit })}`),

  // ── Flags / anomalies (U10) ────────────────────────────────────────────────
  /**
   * Records carry `is_resolved` (boolean), NOT `status` — derive the key with
   * anomalyStatusKey().
   * @param {{status?: "open"|"resolved"|"all", page?: number, limit?: number}} params
   */
  getMyAnomalies: (params = {}) => request(`/attendance/anomalies/mine${qs(params)}`),

  // ── Earned Leave / comp-offs (U14, U15) ────────────────────────────────────
  /**
   * There is NO `rejected` status: reject writes `cancelled`, so "Cancelled"
   * must read as "rejected or cancelled".
   * @param {{status?: "earned"|"approved"|"used"|"expired"|"cancelled", page?: number, limit?: number}} params
   */
  getMyCompOffs: (params = {}) => request(`/attendance/comp-offs/mine${qs(params)}`),
  getMyCompOffSummary: () => request('/attendance/comp-offs/mine/summary'),
};

export default attendanceAPI;
