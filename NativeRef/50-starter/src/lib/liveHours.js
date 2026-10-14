// ─────────────────────────────────────────────────────────────────────────────
// attendance/liveHours.js — Live "worked so far" computation for an open day.
//
// The backend computes the authoritative `effective_hours` at clock-out. While
// a day is in progress the UI shows a running estimate: elapsed time since
// clock-in minus breaks, frozen while a break is active.
//
// Contract §2 C22: `break_duration_minutes` is a persisted column and is
// authoritative for CLOSED breaks; `active_break` is the open entry of
// `breaks[]`. So: server minutes as the base, plus live elapsed time of the open
// break. Summing `breaks[]` is only the fallback for payloads without the column.
// When neither is available the value is gross elapsed time and callers label it.
// ─────────────────────────────────────────────────────────────────────────────

const ms = (value) => {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
};

const startOf = (b) => ms(b?.start_time ?? b?.started_at ?? b?.break_start);
const isOpenBreak = (b) => !(b?.end_time ?? b?.ended_at ?? b?.break_end);
const finiteMinutes = (value) => (value === null || value === undefined || value === "" ? NaN : Number(value));

/** Duration of one closed break in milliseconds. */
function breakDurationMs(b) {
  const start = startOf(b);
  const end = ms(b?.end_time ?? b?.ended_at ?? b?.break_end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  const minutes = Number(b?.duration_minutes ?? b?.duration);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : 0;
}

function openBreakOf(breaks, activeBreak) {
  if (activeBreak) return activeBreak;
  return Array.isArray(breaks) ? breaks.find(isOpenBreak) || null : null;
}

/**
 * @param {{clockIn: string, clockOut?: string, breaks?: any[], activeBreak?: any, breakMinutes?: number|string, now?: number}} input
 * @returns {{workedMs: number, breaksKnown: boolean, onBreak: boolean}}
 */
export function computeWorkedMs({ clockIn, clockOut, breaks, activeBreak, breakMinutes, now = Date.now() }) {
  const start = ms(clockIn);
  if (!Number.isFinite(start)) return { workedMs: 0, breaksKnown: false, onBreak: false };

  const openBreak = openBreakOf(breaks, activeBreak);
  const openStart = startOf(openBreak);

  let end = Number.isFinite(ms(clockOut)) ? ms(clockOut) : now;
  // Frozen at the start of the open break (its time isn't worked).
  if (openBreak && Number.isFinite(openStart) && openStart < end) end = openStart;

  let breaksMs = 0;
  let breaksKnown = false;
  const serverMinutes = finiteMinutes(breakMinutes);
  if (Number.isFinite(serverMinutes)) {
    breaksKnown = true;
    breaksMs = serverMinutes * 60000;
  } else if (Array.isArray(breaks)) {
    breaksKnown = true;
    breaksMs = breaks.filter((b) => !isOpenBreak(b)).reduce((sum, b) => sum + breakDurationMs(b), 0);
  }

  return { workedMs: Math.max(0, end - start - breaksMs), breaksKnown, onBreak: !!openBreak && !clockOut };
}

/**
 * Break minutes so far (closed + the open break's live elapsed time), or null
 * when no break data exists at all.
 */
export function totalBreakMinutes(breaks, now = Date.now(), breakMinutes, activeBreak) {
  const open = openBreakOf(breaks, activeBreak);
  const openStart = startOf(open);
  const openMs = open && Number.isFinite(openStart) ? Math.max(0, now - openStart) : 0;

  const serverMinutes = finiteMinutes(breakMinutes);
  if (Number.isFinite(serverMinutes)) return Math.round(serverMinutes + openMs / 60000);
  if (!Array.isArray(breaks)) return open ? Math.round(openMs / 60000) : null;
  const closedMs = breaks.filter((b) => !isOpenBreak(b)).reduce((sum, b) => sum + breakDurationMs(b), 0);
  return Math.round((closedMs + openMs) / 60000);
}
