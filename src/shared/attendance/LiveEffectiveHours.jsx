// ─────────────────────────────────────────────────────────────────────────────
// attendance/LiveEffectiveHours.jsx — One implementation (previously copied in
// AttendanceDirectory, AttendanceTab and OverviewTab).
//  • Clocked out → backend `effective_hours` (breaks already deducted).
//  • In progress with break data → live worked time, frozen during a break.
//  • In progress without break data (list endpoints) → live elapsed time,
//    explicitly labelled so it's never mistaken for effective hours.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { computeWorkedMs } from "./liveHours.js";
import { fmtHours, fmtMinutes } from "./dates.js";

// No real shift runs longer than this; an open record older than that is a
// missed clock-out awaiting auto clock-out / regularization, not a live day.
const MAX_OPEN_MS = 24 * 60 * 60 * 1000;

export default function LiveEffectiveHours({ effectiveHours, clockInTime, clockOutTime, breaks, activeBreak, breakMinutes, className = "text-slate-800" }) {
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

  if (!clockInTime) return <span className="text-xs text-slate-400 italic">—</span>;

  if (isStale) {
    return effectiveHours != null && effectiveHours !== ""
      ? <span className={`font-bold ${className}`}>{fmtHours(effectiveHours, "—")}</span>
      : <span className="text-[11px] font-bold text-amber-600" title="Clocked in but never clocked out. Hours are calculated after auto clock-out or a regularization.">No clock-out</span>;
  }

  if (!isActive) {
    return <span className={`font-bold ${className}`}>{fmtHours(effectiveHours, "—")}</span>;
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
      <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${onBreak ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} aria-hidden="true" />
    </span>
  );
}
