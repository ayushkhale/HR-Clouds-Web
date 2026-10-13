// ─────────────────────────────────────────────────────────────────────────────
// lib/dates.js — every date, time and duration helper.
//
// Ported from shared/attendance/dates.js, with the display functions
// reimplemented WITHOUT `Intl` (see lib/format.js's header for why). Output is
// byte-identical to the web app's `en-IN` strings, including "Sept" for
// September — ICU's en-IN short month name, verified against the web output.
//
// THE TWO RULES, both of which have cost real bugs:
//
//  1. A "YYYY-MM-DD" from the API is a CALENDAR DATE, not an instant.
//     `new Date("2026-10-13")` is UTC midnight and renders as the PREVIOUS DAY
//     west of UTC. Always parseYMDLocal().
//
//  2. "Today" is the DEVICE's local date.
//     `toISOString().split('T')[0]` returns YESTERDAY in IST between 00:00 and
//     05:29. Always todayYMD().
//
// A shift time ("09:00") is a SCHEDULE, not an instant — never timezone-convert
// one, or a 9 am shift becomes 3:30 am.
//
// `Intl` survives in only two functions (zoneMinutesFrom, formatInZone), which
// genuinely need timezone arithmetic, are never on a hot display path, and both
// fall back to the device zone in a try/catch.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS_SHORT, WEEKDAYS_SHORT } from './format';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const YMD_EXACT_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ─── Calendar dates ──────────────────────────────────────────────────────── */

/** Local calendar date → "YYYY-MM-DD". "" for invalid input. */
export function toLocalYMD(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's LOCAL date as "YYYY-MM-DD". */
export const todayYMD = () => toLocalYMD(new Date());

/**
 * Normalise anything date-like from the API to "YYYY-MM-DD". Strings keep
 * their leading calendar date (no timezone shift); Dates use the local date.
 * This — never toISOString() — is what you send to a date field.
 */
export function ymdOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return toLocalYMD(value);
  const m = String(value).match(YMD_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** "YYYY-MM-DD" → local Date at 00:00, or null. Rejects overflow (2026-02-31). */
export function parseYMDLocal(ymd) {
  const m = String(ymd || '').match(YMD_RE);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** Add whole days to a "YYYY-MM-DD" (DST-safe). */
export function addDaysYMD(ymd, days) {
  const d = parseYMDLocal(ymd);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}

/** Compare two YMD strings: -1, 0, 1. Lexicographic order is chronological. */
export function compareYMD(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Is `ymd` strictly before today (local)? */
export const isPastYMD = (ymd, today = todayYMD()) => !!ymd && ymd < today;

/* ─── Months ──────────────────────────────────────────────────────────────── */

/**
 * First and last calendar day of a month (month is 1-12).
 * This is how you query /attendance/history, which does NOT accept month/year.
 */
export function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/** Shift a {year, month} pair by `offset` months. */
export function shiftMonth(year, month, offset) {
  const d = new Date(Number(year), Number(month) - 1 + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Is the given month later than the current local month? → disable "next". */
export function isFutureMonth(year, month, now = new Date()) {
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
}

/** "September 2026" */
export function monthLabel(year, month) {
  const idx = Number(month) - 1;
  return `${MONTHS_LONG[idx] || ''} ${year}`.trim();
}

/** "Sept 2026" — for steppers and chips, where the full name doesn't fit. */
export function monthLabelShort(year, month) {
  const idx = Number(month) - 1;
  return `${MONTHS_SHORT[idx] || ''} ${year}`.trim();
}

/* ─── Display ─────────────────────────────────────────────────────────────── */

/** Any date-like → Date or null. YMD strings are parsed as LOCAL dates. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  if (YMD_EXACT_RE.test(s)) return parseYMDLocal(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "15 Aug 2026" */
export function fmtDate(value, fallback = 'N/A') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sat, 15 Aug" */
export function fmtDateShort(value, fallback = 'N/A') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** 24h hours+minutes → "09:05 am" (en-IN's lowercase meridiem). */
function clock12(hours, minutes) {
  const h24 = ((Math.trunc(hours) % 24) + 24) % 24;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad(h12)}:${pad(minutes)} ${suffix}`;
}

/** ISO instant → "09:05 am", in the DEVICE's zone. */
export function fmtTime(value, fallback = 'N/A') {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return clock12(d.getHours(), d.getMinutes());
}

/** ISO instant → "15 Aug 2026, 09:05 am". */
export function fmtDateTime(value, fallback = 'N/A') {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${fmtDate(d)}, ${clock12(d.getHours(), d.getMinutes())}`;
}

/* ─── Wall-clock times — schedules, never timezone-converted ──────────────── */

/** "09:00:00" → "09:00". */
export function fmtClock(hhmm, fallback = 'N/A') {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : fallback;
}

/** "09:30" → 570. Minutes since midnight, or null. */
export function clockMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Minutes since midnight (may exceed 1440) → "06:00 pm", or short "6 pm".
 * No timezone conversion.
 */
export function fmtClockMinutes(minutes, { short = false } = {}, fallback = 'N/A') {
  if (!Number.isFinite(minutes)) return fallback;
  const norm = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(norm / 60);
  const mins = norm % 60;
  if (short) {
    const suffix = h24 < 12 ? 'am' : 'pm';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12} ${suffix}`;
  }
  return clock12(h24, mins);
}

/** Shift wall-clock "HH:mm" → "10:00 am" (a schedule — no conversion). */
export const fmtClockTime = (hhmm, fallback = 'N/A') =>
  fmtClockMinutes(clockMinutes(hhmm) ?? NaN, {}, fallback);

/* ─── Combining and splitting ─────────────────────────────────────────────── */

/**
 * Local calendar date + wall-clock time → an ISO instant.
 * `nextDay` supports overnight shifts — a correction's clock-out after
 * midnight MUST use this, or the server can't tell which day it belongs to.
 * @returns {string} ISO string, or "" when input is invalid.
 */
export function combineLocalDateTime(ymd, hhmm, { nextDay = false } = {}) {
  const d = parseYMDLocal(ymd);
  const t = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return '';
  const hours = Number(t[1]);
  const minutes = Number(t[2]);
  if (hours > 23 || minutes > 59) return '';
  d.setDate(d.getDate() + (nextDay ? 1 : 0));
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** ISO instant → local "HH:mm", for a TimeField. */
export function toLocalHHMM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─── Durations ───────────────────────────────────────────────────────────── */

/** Minutes → "1h 5m" / "45m" / "0m". null/undefined → fallback. */
export function fmtMinutes(value, fallback = '0m') {
  if (value === null || value === undefined || value === '') return fallback;
  const total = Math.round(Number(value));
  if (!Number.isFinite(total)) return fallback;
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/**
 * Decimal hours (number or "8.50") → "8h 30m".
 * Every caller shows a DURATION, which is never below zero; the server can
 * return e.g. -0.02 when breaks outlast the punches, so negatives read "0m".
 */
export function fmtHours(value, fallback = '0m') {
  if (value === null || value === undefined || value === '') return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return fmtMinutes(Math.max(0, Math.round(n * 60)), fallback);
}

/** Elapsed milliseconds → "HH:MM:SS". The live timer only. */
export function fmtDuration(ms) {
  const safe = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// The server writes "8h 0m" and "0h 0m"; fmtMinutes writes "8h" and "0m". The
// same day showed both ways on two web screens until this tidied it.
function tidyDuration(textValue) {
  const m = /^(\d+)h (\d+)m$/.exec(textValue);
  if (!m) return textValue;
  return fmtMinutes(Number(m[1]) * 60 + Number(m[2]), '0m');
}

/**
 * Time worked on a day, AS THE BACKEND STATES IT.
 * `worked_duration_formatted` ("8h 32m", breaks already taken off, the same
 * figure the policy and overtime use) is the source of truth;
 * `effective_hours` is only the fallback for reads that don't carry it yet.
 *
 * NEVER derive this from clock-in/clock-out — you will disagree with payroll.
 */
export function workedLabel(record, fallback = '0m') {
  const t = typeof record?.worked_duration_formatted === 'string' ? record.worked_duration_formatted.trim() : '';
  if (t) return tidyDuration(t);
  return fmtHours(record?.effective_hours, fallback);
}

/** A month's total worked time: `total_worked_duration_formatted`, else hours. */
export function totalWorkedLabel(summary, fallback = '0m') {
  const t = typeof summary?.total_worked_duration_formatted === 'string'
    ? summary.total_worked_duration_formatted.trim()
    : '';
  if (t) return t;
  return fmtHours(summary?.total_hours_worked, fallback);
}

/* ─── Timezones — the only Intl users in this file ────────────────────────── */

/** The device's IANA timezone, e.g. "Asia/Kolkata". "" if unavailable. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * Wall-clock minutes of an instant in `timeZone`, measured from midnight of
 * the calendar date `ymd` in that zone — 1500 means 01:00 the NEXT day. Lets
 * a night-shift punch be compared against its schedule. null for bad input.
 */
export function zoneMinutesFrom(ymd, iso, timeZone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  };
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: timeZone || undefined }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const base = parseYMDLocal(ymd);
  const actual = parseYMDLocal(`${get('year')}-${get('month')}-${get('day')}`);
  if (!base || !actual) return minutes;
  return minutes + Math.round((actual - base) / 86400000) * 1440;
}

/** Format an instant in a specific IANA zone (falls back to the device zone). */
export function formatInZone(iso, timeZone) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timeZone || undefined,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return clock12(Number(get('hour')), Number(get('minute')));
  } catch {
    return fmtTime(iso);
  }
}
