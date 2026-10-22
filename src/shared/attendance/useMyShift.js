// ─────────────────────────────────────────────────────────────────────────────
// attendance/useMyShift.js — The caller's own shift and attendance policy,
// read once per session and shared.
//
// WHY A CACHE. `GET /attendance/shift` now answers the policy as well as the
// shift, which makes it interesting to screens that never needed a shift: the
// punch card (grace window, break allowance, the ring's target), the correction
// form (how far back it may reach), My Schedule. Four screens each doing their
// own read is four requests for an answer that changes when HR edits a policy
// and at no other time — and this is the app that learned from employee photos
// what a second roster fetch costs (CLAUDE.md §7, "people come from one place").
//
// WHY IT NEVER THROWS. "No shift assigned" is a valid, common answer (§12 of
// 3_user_attendance_api.md) and the punch card has a day to get on with, so a
// failed read degrades to "nothing known" and every policy-driven control
// hides. A SCREEN whose whole purpose is this payload — My Schedule — must
// still distinguish "nothing on file" from "couldn't load" (§7), so it calls
// the api directly rather than through here.
//
// INVALIDATION. `ATTENDANCE_EVENTS.CONFIG` is emitted when HR saves a policy,
// a shift or an assignment, so the cache is dropped then. A network failure is
// NOT cached: the next mount asks again rather than hiding the grace window
// from somebody for the rest of their session.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { attendanceAPI } from "../api";
import { unwrap } from "./normalize.js";
import { ATTENDANCE_EVENTS, subscribeAttendanceChanged } from "./events.js";
import { policyOf, shiftOf } from "./policyRules.js";

/** A settled "there is nothing here", as distinct from "not asked yet" (null). */
const ABSENT = Object.freeze({ assignment: null, shift: null, policy: null, rotation: null, weekly_offs: [] });

let cache = null;
let inFlight = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(cache || ABSENT));

/** The wrapper if it has already been read, else null. Lets a second screen render right on its first frame. */
export const peekMyShift = () => cache;

/**
 * Read `{ assignment, shift, policy, rotation, weekly_offs }`, from cache
 * unless `force`. Never throws and never reports a failure — see the header.
 */
export async function loadMyShift({ force = false } = {}) {
  if (!force && cache) return cache;
  // A read already on the wire is the read a forced caller wants too — four
  // mounted consumers reacting to one CONFIG event must not make four requests.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const data = unwrap(await attendanceAPI.getMyShift());
      cache = data && typeof data === "object" ? data : ABSENT;
    } catch (err) {
      // 404/403 is a settled answer worth caching. Offline or a 500 is not.
      const settled = err?.status === 404 || err?.status === 403;
      cache = settled ? ABSENT : null;
      inFlight = null;
      notify();
      return ABSENT;
    }
    inFlight = null;
    notify();
    return cache;
  })();
  return inFlight;
}

/** Re-read after HR moves a shift, a policy or an assignment. */
export const refreshMyShift = () => loadMyShift({ force: true });

/** Drop the cache on sign-out — the next person is not this one. */
export function clearMyShift() {
  cache = null;
  inFlight = null;
  notify();
}

// ONE subscription for the module, not one per mounted consumer: HR saving a
// policy is a single event, and every mounted screen reacting to it with its
// own `refresh` was a request each. Registered at import time and never torn
// down, which is correct — the cache it guards outlives every component.
subscribeAttendanceChanged((kind) => {
  if (kind === ATTENDANCE_EVENTS.CONFIG) refreshMyShift();
});

/**
 * The caller's shift and the policy their attendance is graded by.
 *
 * `wrapper` is the whole payload (for weekly offs and the rotation); `shift`
 * and `policy` are the two pieces every caller actually wants, already
 * unwrapped — reading `.name` off the wrapper is what once left the shift line
 * blank on all three dashboards.
 *
 * @param {{enabled?: boolean}} [options] `false` reads nothing, for a caller
 *   rendering outside the organisation (the guest shell), where this would 403
 *   and tell us what we already know.
 */
export function useMyShift({ enabled = true } = {}) {
  const [wrapper, setWrapper] = useState(peekMyShift);
  const [loading, setLoading] = useState(() => enabled && peekMyShift() === null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let alive = true;
    const onChange = (next) => { if (alive) { setWrapper(next); setLoading(false); } };
    listeners.add(onChange);
    loadMyShift().then((next) => { if (alive) { setWrapper(next); setLoading(false); } });
    return () => { alive = false; listeners.delete(onChange); };
  }, [enabled]);

  // For a deliberate press (the Refresh button on My Schedule) and the midnight
  // roll. The CONFIG event is handled once at module level, below.
  const reload = useCallback(() => {
    setLoading(true);
    refreshMyShift().finally(() => setLoading(false));
  }, []);

  return {
    wrapper,
    shift: shiftOf(wrapper),
    policy: policyOf(wrapper),
    loading,
    reload,
  };
}
