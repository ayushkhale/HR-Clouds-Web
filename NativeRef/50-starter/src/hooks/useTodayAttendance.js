// ─────────────────────────────────────────────────────────────────────────────
// hooks/useTodayAttendance.js — the state behind the punch card.
//
// Ported from shared/attendance/useTodayAttendance.js. It owns two reads that
// always travel together:
//   • /attendance/today  → the open (or closed) day: punches, breaks, status
//   • /attendance/shift  → the assigned shift, for the expected-hours line
//
// FOUR THINGS REFRESH IT, and all four are load-bearing:
//   1. a punch, break or correction anywhere in the app (the event bus)
//   2. the app returning to the foreground — a punch from the web app, a
//      kiosk or a biometric device processed asynchronously, means the card
//      in your hand is stale the moment you put the phone down
//   3. just after local midnight — a card left open overnight must roll to the
//      new day rather than show yesterday's clock-in as live
//   4. pull-to-refresh, via the returned `refresh`
//
// WHAT IT DOES NOT DO: poll. There is no interval here. The server state only
// changes when somebody punches, and (2) covers the other-device case. The
// SECOND-BY-SECOND clock on the card is local arithmetic — useLiveWorked below,
// which needs no network at all. Adding a poll here was considered and rejected:
// a 30s poll is ~2,900 requests per person per day of standing still.
//
// A missing shift is a VALID state, not an error (contract: no active
// assignment → 404/empty). `shift: null` means "No shift assigned", and the
// card hides the expected-hours line rather than showing N/A against it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceAPI } from '../api';
import { unwrap } from '../lib/normalize';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../lib/events';
import { computeWorkedMs, totalBreakMinutes } from '../lib/liveHours';
import { useAppActive, useOnAppActive } from './useAppActive';

export function useTodayAttendance() {
  const [state, setState] = useState({ today: null, shift: null, loading: true, error: null });

  // Request tokens, not a `cancelled` flag: `refresh` is called from four
  // places and two of them can overlap (foreground + an event in the same
  // tick), so the guard has to discard an OLD response, not just a response
  // after unmount.
  const todayReq = useRef(0);
  const shiftReq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    const id = ++todayReq.current;
    try {
      const res = await attendanceAPI.getToday();
      if (id !== todayReq.current || !mounted.current) return;
      setState((s) => ({ ...s, today: unwrap(res) || null, loading: false, error: null }));
    } catch (error) {
      if (id !== todayReq.current || !mounted.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  const loadShift = useCallback(async () => {
    const id = ++shiftReq.current;
    try {
      const res = await attendanceAPI.getMyShift();
      if (id === shiftReq.current && mounted.current) {
        setState((s) => ({ ...s, shift: unwrap(res) || null }));
      }
    } catch {
      // Swallowed on purpose. No active assignment is a normal state for a new
      // joiner and for anyone on a flexible policy; it is not a failure to
      // report, and it must not set `error` or the whole card goes red.
      if (id === shiftReq.current && mounted.current) setState((s) => ({ ...s, shift: null }));
    }
  }, []);

  useEffect(() => {
    refresh();
    loadShift();
  }, [refresh, loadShift]);

  // A punch, break, regularization decision or correction changes today's row.
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION, ATTENDANCE_EVENTS.ANOMALY],
    refresh,
  );
  // A shift or policy change changes the expected-hours line.
  useAttendanceChanged([ATTENDANCE_EVENTS.CONFIG], loadShift);

  // (2) Back in the foreground.
  useOnAppActive(() => {
    refresh();
    loadShift();
  });

  // (3) Local midnight, +5s of slack so the server's own day has rolled too.
  // Re-armed whenever the loaded day changes, which is how it chains night to
  // night for a phone left on the desk.
  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(() => {
      refresh();
      loadShift();
    }, next.getTime() - now.getTime());
    return () => clearTimeout(timer);
  }, [refresh, loadShift, state.today?.date]);

  return { ...state, refresh, reloadShift: loadShift };
}

/* ─── The visible clock ────────────────────────────────────────────────────────
   Separate hook, separate concern: the numbers on the card tick every second
   while `today` stays put. Keeping them apart is what lets the card animate
   without a request behind it. */

const FIELD = (today, ...keys) => keys.map((k) => today?.[k]).find((v) => v != null) ?? null;

/**
 * The live "worked so far" figures for an open day.
 *
 * Ticks once a second while clocked in and NOT on a break; a break freezes the
 * worked clock (the break's own minutes keep counting instead) and a clocked-out
 * day stops entirely — nothing re-renders a settled card.
 *
 * It intentionally stops ticking when the app is backgrounded. `Date.now()` is
 * read on every tick rather than accumulated, so the first tick after coming
 * back is correct however long the phone slept.
 *
 * @param {object|null} today the `today` object from useTodayAttendance
 * @returns {{workedMinutes: number, breakMinutes: number|null, onBreak: boolean,
 *            isClockedIn: boolean, breaksKnown: boolean}}
 */
export function useLiveWorked(today) {
  const clockIn = FIELD(today, 'clock_in_time', 'clock_in', 'first_in_time');
  const clockOut = FIELD(today, 'clock_out_time', 'clock_out', 'last_out_time');
  const breaks = Array.isArray(today?.breaks) ? today.breaks : null;
  const activeBreak = today?.active_break || null;
  const breakCol = FIELD(today, 'break_duration_minutes', 'total_break_minutes');

  const isClockedIn = !!clockIn && !clockOut;
  const onBreak = isClockedIn && !!(activeBreak || breaks?.some((b) => !(b?.end_time ?? b?.ended_at ?? b?.break_end)));
  // A settled day never needs a tick; an open day on a break needs one only to
  // keep the BREAK counter moving.
  const live = isClockedIn;

  const [now, setNow] = useState(() => Date.now());
  const active = useAppActive();

  useEffect(() => {
    if (!live || !active) return undefined;
    setNow(Date.now()); // catch up immediately on resume
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live, active]);

  const { workedMs, breaksKnown } = computeWorkedMs({
    clockIn, clockOut, breaks, activeBreak, breakMinutes: breakCol, now,
  });

  return {
    workedMinutes: Math.floor(workedMs / 60000),
    breakMinutes: totalBreakMinutes(breaks, now, breakCol, activeBreak),
    onBreak,
    isClockedIn,
    breaksKnown,
  };
}

// Re-exported so a screen rendering the punch card needs one import, not two.
export { useAppActive, useOnAppActive } from './useAppActive';
