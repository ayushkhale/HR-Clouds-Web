// ─────────────────────────────────────────────────────────────────────────────
// attendance/events.js — Cross-screen refresh signalling.
//
// The app has no query cache, so a mutation on one screen can't invalidate
// data held by another (sidebar badge, dashboards, open lists). Mutations emit
// a kind; interested components subscribe and refetch.
//
// Subscribers (audit §7.4):
//   punch          → dashboards (today, graph), My Attendance page
//   regularization → sidebar inbox badge, manager lists, My Regularizations
//   overtime       → sidebar inbox badge, manager lists
//   compoff        → sidebar inbox badge, manager/HR lists, My Comp-offs
//   anomaly        → sidebar inbox badge, manager lists
//   config         → shift/policy selectors that are already mounted
//   lock           → lock page, recompute consumers
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export const ATTENDANCE_EVENTS = Object.freeze({
  PUNCH: "punch",
  REGULARIZATION: "regularization",
  OVERTIME: "overtime",
  COMPOFF: "compoff",
  ANOMALY: "anomaly",
  CONFIG: "config",
  LOCK: "lock",
});

/** Kinds that change the manager approvals inbox count. */
export const INBOX_EVENT_KINDS = [
  ATTENDANCE_EVENTS.REGULARIZATION,
  ATTENDANCE_EVENTS.OVERTIME,
  ATTENDANCE_EVENTS.COMPOFF,
  ATTENDANCE_EVENTS.ANOMALY,
];

const listeners = new Set();

export function emitAttendanceChanged(kind, detail) {
  listeners.forEach((listener) => {
    try {
      listener(kind, detail);
    } catch (err) {
      // A faulty subscriber must never break the mutation flow.
      if (import.meta.env?.DEV) console.error("attendance event listener failed", err);
    }
  });
}

export function subscribeAttendanceChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Run `callback(kind, detail)` whenever one of `kinds` is emitted.
 * Pass an empty array to receive every kind.
 */
export function useAttendanceChanged(kinds, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const key = (kinds || []).join("|");

  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    return subscribeAttendanceChanged((kind, detail) => {
      if (wanted.length === 0 || wanted.includes(kind)) callbackRef.current(kind, detail);
    });
  }, [key]);
}
