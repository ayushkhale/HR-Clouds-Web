// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTodayAttendance.js — Live `/today` + `/shift` state for any
// dashboard that renders the punch card (employee, manager, HR).
//  • Refreshes when the tab regains focus (punches from another device, or
//    biometric punches that were processed asynchronously).
//  • Refreshes just after local midnight so a card left open rolls to the new day.
//  • Out-of-order responses are discarded.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { attendanceAPI } from "../api";
import { unwrap } from "./normalize.js";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "./events.js";

export function useTodayAttendance() {
  const [state, setState] = useState({ today: null, shift: null, loading: true, error: null });
  const todayReq = useRef(0);
  const shiftReq = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++todayReq.current;
    try {
      const res = await attendanceAPI.getToday();
      if (id !== todayReq.current) return;
      setState((s) => ({ ...s, today: unwrap(res) || null, loading: false, error: null }));
    } catch (error) {
      if (id !== todayReq.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  const loadShift = useCallback(async () => {
    const id = ++shiftReq.current;
    try {
      const res = await attendanceAPI.getMyShift();
      if (id === shiftReq.current) setState((s) => ({ ...s, shift: unwrap(res) || null }));
    } catch {
      // No active assignment is a valid state — the card shows "No shift assigned".
      if (id === shiftReq.current) setState((s) => ({ ...s, shift: null }));
    }
  }, []);

  useEffect(() => {
    refresh();
    loadShift();
  }, [refresh, loadShift]);

  useAttendanceChanged([ATTENDANCE_EVENTS.CONFIG], loadShift);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(() => {
      refresh();
      loadShift();
    }, nextMidnight - now);
    return () => clearTimeout(timer);
  }, [refresh, loadShift, state.today?.date]);

  return { ...state, refresh, reloadShift: loadShift };
}
