// ─────────────────────────────────────────────────────────────────────────────
// attendance/dates.js — Date/time helpers for the Attendance module.
//
// Rules (audit §7.5):
//  • Backend DATEONLY values ("YYYY-MM-DD") are calendar dates, never instants.
//    Parse them as LOCAL dates — `new Date("2026-08-15")` is UTC midnight and
//    renders as the previous day in negative-offset zones.
//  • "Today" must be the user's LOCAL date — `toISOString().split("T")[0]`
//    returns yesterday in IST between 00:00 and 05:29.
//  • Instants (clock_in_time etc.) are ISO strings; the browser formats them.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const YMD_EXACT_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date → "YYYY-MM-DD". Returns "" for invalid input. */
export function toLocalYMD(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local date as "YYYY-MM-DD". */
export const todayYMD = () => toLocalYMD(new Date());

/**
 * Normalise anything date-like coming from the API to "YYYY-MM-DD".
 * Strings keep their leading calendar date (no timezone shift); Date objects
 * use the local calendar date.
 */
export function ymdOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return toLocalYMD(value);
  const m = String(value).match(YMD_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** "YYYY-MM-DD" → local Date at 00:00, or null. */
export function parseYMDLocal(ymd) {
  const m = String(ymd || "").match(YMD_RE);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Reject overflow such as 2026-02-31.
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** Add whole days to a "YYYY-MM-DD" string (DST-safe). */
export function addDaysYMD(ymd, days) {
  const d = parseYMDLocal(ymd);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}

/** Compare two YMD strings: -1, 0, 1. Lexicographic order is chronological. */
export function compareYMD(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** First and last calendar day of a month (month is 1-12). */
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

/** Is the given month later than the current local month? */
export function isFutureMonth(year, month, now = new Date()) {
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
}

/** "September 2026" */
export function monthLabel(year, month, locale = "en-IN") {
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(locale, { month: "long", year: "numeric" });
}

/**
 * Combine a local calendar date and a wall-clock time into an ISO instant.
 * `nextDay` supports overnight shifts (clock-out after midnight).
 * @returns {string} ISO string, or "" when input is invalid.
 */
export function combineLocalDateTime(ymd, hhmm, { nextDay = false } = {}) {
  const d = parseYMDLocal(ymd);
  const t = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return "";
  const hours = Number(t[1]);
  const minutes = Number(t[2]);
  if (hours > 23 || minutes > 59) return "";
  d.setDate(d.getDate() + (nextDay ? 1 : 0));
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** ISO instant → local "HH:mm" for <input type="time">. */
export function toLocalHHMM(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Any date-like → Date or null. YMD strings are parsed as local dates. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  if (YMD_EXACT_RE.test(s)) return parseYMDLocal(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "15 Aug 2026" (or custom Intl options). */
export function fmtDate(value, options = { day: "numeric", month: "short", year: "numeric" }, fallback = "—") {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-IN", options) : fallback;
}

/** "Fri, 15 Aug" */
export const fmtDateShort = (value, fallback = "—") =>
  fmtDate(value, { weekday: "short", day: "numeric", month: "short" }, fallback);

/** ISO instant → "09:05 am". */
export function fmtTime(value, fallback = "—") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** ISO instant → "15 Aug 2026, 09:05 am". */
export function fmtDateTime(value, fallback = "—") {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Shift wall-clock "HH:mm[:ss]" → "09:00" (no timezone conversion — it is a schedule). */
export function fmtClock(hhmm, fallback = "—") {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : fallback;
}

/** Minutes → "1h 5m" / "45m" / "0m". null/undefined → fallback. */
export function fmtMinutes(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const total = Math.round(Number(value));
  if (!Number.isFinite(total)) return fallback;
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** Decimal hours (number or "8.50") → "8h 30m". null → fallback. */
export function fmtHours(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return fmtMinutes(Math.round(n * 60), fallback);
}

/** Elapsed milliseconds → "HH:MM:SS". */
export function fmtDuration(ms) {
  const safe = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** The browser's IANA timezone, e.g. "Asia/Kolkata". */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Format an instant in a specific IANA zone (falls back to browser zone). */
export function formatInZone(iso, timeZone, options = { hour: "2-digit", minute: "2-digit" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString("en-IN", { ...options, timeZone: timeZone || undefined });
  } catch {
    return d.toLocaleString("en-IN", options);
  }
}

/** Is `ymd` strictly before today (local)? */
export const isPastYMD = (ymd, today = todayYMD()) => !!ymd && ymd < today;
