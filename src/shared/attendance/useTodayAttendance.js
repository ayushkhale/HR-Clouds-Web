// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTodayAttendance.js — Live `/today` + `/shift` state for any
// dashboard that renders the punch card (employee, manager, HR).
//  • Refreshes when the tab regains focus (punches from another device, or
//    biometric punches that were processed asynchronously).
//  • Refreshes just after local midnight so a card left open rolls to the new day.
//  • Out-of-order responses are discarded.
//
// The `/shift` half is NOT read here — it goes through `useMyShift`, which
// caches it for the session and shares it with the correction form and My
// Schedule (2026-10-21). It changes only when HR edits a policy, a shift or an
// assignment, and that emits `CONFIG`, which `useMyShift` already subscribes
// to. `shift` keeps its old shape (the whole wrapper) because AttendanceCard
// reads `policy` off it as well as the shift itself.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { attendanceAPI } from "../api";
import { unwrap } from "./normalize.js";
import { useMyShift } from "./useMyShift.js";

export function useTodayAttendance() {
  const [state, setState] = useState({ today: null, loading: true, error: null });
  const todayReq = useRef(0);
  const { wrapper: shift, reload: reloadShift } = useMyShift();

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

  useEffect(() => { refresh(); }, [refresh]);

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
      // A rotational shift is resolved for TODAY, so the day rolling over can
      // change which shift is in force even though nothing was edited.
      reloadShift();
    }, nextMidnight - now);
    return () => clearTimeout(timer);
  }, [refresh, reloadShift, state.today?.date]);

  return { ...state, shift, refresh, reloadShift };
}
