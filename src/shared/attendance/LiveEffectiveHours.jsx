// ─────────────────────────────────────────────────────────────────────────────
// attendance/LiveEffectiveHours.jsx — One implementation (previously copied in
// AttendanceDirectory, AttendanceTab and OverviewTab).
//  • Clocked out → backend `worked_duration_formatted` (breaks already
//    deducted), else `effective_hours`. Never clock-out minus clock-in.
//  • In progress with break data → live worked time, frozen during a break.
//  • In progress without break data (list endpoints) → live elapsed time,
//    explicitly labelled so it's never mistaken for effective hours.
//
// PASS `record`, NOT THE SEVEN FIELDS. Threading them by hand is what broke
// this (2026-10-22): three of the four call sites left out `breakMinutes` and
// two also left out `activeBreak`, so an open day on the HR and manager
// employee profiles counted break time as worked — the server's authoritative
// `break_duration_minutes` was never read, and a break open right now didn't
// freeze the clock. The figure was wrong in the one direction nobody notices,
// upwards, and the tooltip still promised "breaks deducted". `record` reads
// all of them off one object so a call site cannot silently omit one. The
// individual props stay for the rare caller holding loose values, and override
// `record` when given.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { computeWorkedMs } from "./liveHours.js";
import { fmtMinutes, workedLabel } from "./dates.js";

// No real shift runs longer than this; an open record older than that is a
// missed clock-out awaiting auto clock-out / regularization, not a live day.
const MAX_OPEN_MS = 24 * 60 * 60 * 1000;

const pick = (own, fromRecord) => (own === undefined ? fromRecord : own);

export default function LiveEffectiveHours({ record, effectiveHours: effectiveHoursProp, formatted: formattedProp, clockInTime: clockInTimeProp, clockOutTime: clockOutTimeProp, breaks: breaksProp, activeBreak: activeBreakProp, breakMinutes: breakMinutesProp, className = "text-slate-800" }) {
  const effectiveHours = pick(effectiveHoursProp, record?.effective_hours);
  const formatted = pick(formattedProp, record?.worked_duration_formatted);
  const clockInTime = pick(clockInTimeProp, record?.clock_in_time);
  const clockOutTime = pick(clockOutTimeProp, record?.clock_out_time);
  const breaks = pick(breaksProp, record?.breaks);
  const activeBreak = pick(activeBreakProp, record?.active_break);
  const breakMinutes = pick(breakMinutesProp, record?.break_duration_minutes);

  const clockInMs = clockInTime ? new Date(clockInTime).getTime() : NaN;
  const isStale = !clockOutTime && Number.isFinite(clockInMs) && Date.now() - clockInMs > MAX_OPEN_MS;
  const isActive = !!clockInTime && !clockOutTime && !isStale;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isActive, clockInTime]);

  const finished = workedLabel({ worked_duration_formatted: formatted, effective_hours: effectiveHours }, "0m");

  // No punch at all. Dense history rows arrive with `effective_hours: null` on
  // days where nothing was due (weekly off, holiday, a day still to come), and
  // "0m" there claims the person worked nothing rather than that nothing was
  // owed. A real zero still prints as 0m.
  if (!clockInTime) {
    return effectiveHours === null || effectiveHours === undefined
      ? <span className="text-xs text-slate-400">N/A</span>
      : <span className="text-xs text-slate-400">{finished}</span>;
  }

  if (isStale) {
    return (effectiveHours != null && effectiveHours !== "") || formatted
      ? <span className={`font-bold ${className}`}>{finished}</span>
      : <span className="text-[11px] font-bold text-fuchsia-600" title="Clocked in but never clocked out. Hours are calculated after auto clock-out or an attendance correction.">No clock-out</span>;
  }

  if (!isActive) {
    return <span className={`font-bold ${className}`}>{finished}</span>;
  }

  const { workedMs, breaksKnown, onBreak } = computeWorkedMs({ clockIn: clockInTime, breaks, activeBreak, breakMinutes, now });
  const label = fmtMinutes(Math.floor(workedMs / 60000));

  return (
    <span
      className={`font-bold ${className}`}
      title={breaksKnown ? "Live worked time (breaks deducted). Final hours are calculated at clock-out." : "Time since clock-in. Breaks are deducted when the day is calculated at clock-out."}
    >
      {label}
      {!breaksKnown && <span className="ml-1 text-[10px] font-semibold text-slate-400">elapsed</span>}
      <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${onBreak ? "bg-fuchsia-400" : "bg-violet-400 animate-pulse"}`} aria-hidden="true" />
    </span>
  );
}
