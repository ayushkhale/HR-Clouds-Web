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
//
// The bus is app-wide despite living in `attendance/`: the inbox counts a
// manager or HR sees span leave, claims, loans, salary proposals, tax
// declarations and letter proposals too, and each of those decisions has to clear the badge and the
// inbox card without a reload. Every kind below marked in INBOX_EVENT_KINDS is
// emitted the moment such a decision succeeds.
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
  // Decided outside attendance, but counted in the same inbox.
  LEAVE: "leave",
  CLAIM: "claim",
  LOAN: "loan",
  SALARY_PROPOSAL: "salary_proposal",
  TAX_DECLARATION: "tax_declaration",
  // A manager's letter proposal waiting on HR (PDF Generation Phase 4, #148).
  LETTER_PROPOSAL: "letter_proposal",
});

/**
 * Kinds that change an inbox count, for the sidebar badge and the inbox cards.
 * A queue whose decisions are not emitted here goes stale until a reload, so a
 * new approval queue belongs in this list on the day it is added.
 */
export const INBOX_EVENT_KINDS = [
  ATTENDANCE_EVENTS.REGULARIZATION,
  ATTENDANCE_EVENTS.OVERTIME,
  ATTENDANCE_EVENTS.COMPOFF,
  ATTENDANCE_EVENTS.ANOMALY,
  ATTENDANCE_EVENTS.LEAVE,
  ATTENDANCE_EVENTS.CLAIM,
  ATTENDANCE_EVENTS.LOAN,
  ATTENDANCE_EVENTS.SALARY_PROPOSAL,
  ATTENDANCE_EVENTS.TAX_DECLARATION,
  ATTENDANCE_EVENTS.LETTER_PROPOSAL,
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
