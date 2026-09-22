// ─────────────────────────────────────────────────────────────────────────────
// AttendanceCard — the daily punch card (employee, manager and HR dashboards).
//
// State is driven by the backend `/today` payload (U5), never re-derived:
//   idle    → no clock-in yet (with holiday / weekly-off / leave context)
//   working → clocked in (break controls; End Break only while on a break)
//   done    → clocked out (authoritative calculation result)
// Punches resolve browser location first. Location failures are explained and
// the user may retry or explicitly continue without location (the backend
// accepts it and flags the punch) — never a silent drop.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import { attendanceAPI } from "../../../shared/api";
import { attendanceErrorCode, attendanceErrorMessage } from "../../../shared/utils/attendanceErrors";
import { getBrowserLocation, GEO_STATUS } from "../../../shared/attendance/geolocation";
import { computeWorkedMs, totalBreakMinutes } from "../../../shared/attendance/liveHours";
import { fmtClock, fmtDate, fmtDuration, fmtHours, fmtMinutes, fmtTime, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { PUNCH_SOURCE_WEB, SHIFT_TYPES, WORK_MODES, WORK_MODE_VALUES, humanize } from "../../../shared/attendance/enums";
import { PUNCH_NOTES_MAX } from "../../../shared/attendance/validation";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../shared/attendance/events";
import { ErrorState, InlineAlert, Spinner, StatusBadge, Toast, useToast } from "../../../shared/attendance/ui";
import { HiClock, HiLocationMarker, HiOutlineClock, HiPencilAlt } from "react-icons/hi";
import { BiCoffeeTogo, BiStopwatch } from "react-icons/bi";

const WORK_MODE_KEY = "hrclouds_attendance_work_mode";
const readWorkMode = () => {
  try {
    const v = localStorage.getItem(WORK_MODE_KEY);
    return WORK_MODE_VALUES.includes(v) ? v : "";
  } catch {
    return "";
  }
};

const RING = 2 * Math.PI * 40;

const ACTION_BTN = "w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed";
const PRIMARY_ACTION = `${ACTION_BTN} bg-purple-600 hover:bg-purple-700 text-white`;
const BREAK_START_ACTION = `${ACTION_BTN} bg-white border-2 border-indigo-100 hover:border-indigo-200 text-indigo-700`;
const BREAK_END_ACTION = `${ACTION_BTN} bg-indigo-600 hover:bg-indigo-700 text-white`;
const CLOCK_OUT_ACTION = `${ACTION_BTN} bg-rose-500 hover:bg-rose-600 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none`;

// One cell of the finished-day strip. The dividers run between cells only, so
// the first cell of each row keeps its left edge clean at both breakpoints.
function DayStat({ icon: Icon, label, value, accent = false }) {
  return (
    <div className="min-w-0 px-4 py-3.5 border-slate-100 border-l [&:nth-child(odd)]:border-l-0 sm:[&:nth-child(odd)]:border-l sm:first:border-l-0 border-t [&:nth-child(-n+2)]:border-t-0 sm:border-t-0">
      <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2"><Icon className="w-4 h-4" /></span>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-base font-bold mt-0.5 truncate tabular-nums ${accent ? "text-purple-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

// layout: "stacked" (a dashboard column) or "horizontal" (one full-width row:
// the day on the left, hours in the middle, actions on the right).
function AttendanceCard({ currentState: today, fetchStatus, shiftData, loading = false, error = null, className, layout = "stacked" }) {
  const horizontal = layout === "horizontal";
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(null); // clock-in | clock-out | break-start | break-end | locating
  const busyRef = useRef(false);
  const [workMode, setWorkMode] = useState(readWorkMode);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [geoIssue, setGeoIssue] = useState(null); // { status, message, kind }
  const [lastResult, setLastResult] = useState(null);
  const [inlineError, setInlineError] = useState("");
  const { toast, showToast, clearToast } = useToast(5000);

  const status = today?.status;
  const clockIn = today?.clock_in_time;
  const clockOut = today?.clock_out_time;
  // `/today` documents a `not_marked` payload, but a `data: null` response must
  // still offer Clock In rather than a card with no actions.
  const phase = !today ? (loading || error ? "unknown" : "idle") : status === "in_progress" || (clockIn && !clockOut) ? "working" : clockOut ? "done" : "idle";
  const onBreak = phase === "working" && !!today?.active_break;
  // Contract §4.1: while yesterday's overnight record is still open, `/today`
  // returns THAT record with `date` = yesterday. Render from the returned date.
  const recordDate = ymdOnly(today?.date);
  const carriedOver = phase === "working" && !!recordDate && recordDate < todayYMD();

  useEffect(() => {
    if (phase !== "working") return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Drop a previous clock-out result once the payload moves to another day/state.
  useEffect(() => {
    if (phase !== "done") setLastResult(null);
  }, [phase, today?.date]);

  const shift = shiftData || today?.shift || null;
  const policy = shiftData?.policy || null;
  const fullDayMinutes = Number(policy?.full_day_threshold_minutes) || null;

  const worked = phase === "working"
    ? computeWorkedMs({ clockIn, breaks: today?.breaks, activeBreak: today?.active_break, breakMinutes: today?.break_duration_minutes, now })
    : null;
  const result = phase === "done" ? { ...today, ...(lastResult || {}) } : null;
  // Breaks longer than the time between punches make the server's figure
  // negative; hours worked can't go below zero, so it reads 0m.
  const effectiveHours = result && result.effective_hours != null ? Math.max(0, parseFloat(result.effective_hours) || 0) : result?.effective_hours;
  const workedMinutes = worked ? worked.workedMs / 60000 : result ? (effectiveHours || 0) * 60 : 0;
  const dayNotes = result ? [
    Number(result.late_minutes) > 0 && ["Late by", fmtMinutes(result.late_minutes)],
    Number(result.early_exit_minutes) > 0 && ["Left early", fmtMinutes(result.early_exit_minutes)],
    result.half_day_type && ["Half day", humanize(result.half_day_type)],
  ].filter(Boolean) : [];
  const progress = fullDayMinutes && phase !== "idle" ? Math.min(1, workedMinutes / fullDayMinutes) : 0;
  // Server `break_duration_minutes` (closed breaks) + live open-break time (§2 C22).
  const breakMinutes = totalBreakMinutes(today?.breaks, now, today?.break_duration_minutes, today?.active_break);

  const persistWorkMode = (value) => {
    const next = value === workMode ? "" : value;
    setWorkMode(next);
    try {
      if (next) localStorage.setItem(WORK_MODE_KEY, next);
      else localStorage.removeItem(WORK_MODE_KEY);
    } catch {
      /* storage unavailable — keep in memory only */
    }
  };

  const run = useCallback(async (key, task) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setInlineError("");
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, []);

  // The caller always refetches /today afterwards, so a stale card (e.g. already
  // clocked in from another device) self-corrects; the message explains why.
  const fail = (err, fallback) => {
    const code = attendanceErrorCode(err);
    setInlineError(code === "ALREADY_CLOCKED_IN" ? attendanceErrorMessage(err) : attendanceErrorMessage(err, fallback));
  };

  const punch = (kind, { skipLocation = false } = {}) =>
    run(kind, async () => {
      let coords = null;
      if (!skipLocation) {
        setBusy("locating");
        const loc = await getBrowserLocation();
        if (loc.status !== GEO_STATUS.GRANTED) {
          setGeoIssue({ ...loc, kind });
          return;
        }
        coords = loc.coords;
        setBusy(kind);
      }
      setGeoIssue(null);

      // `client_timestamp` is diagnostic metadata only — the server never uses
      // it as the punch time (§8.3). `work_mode` exists on clock-IN only (§2 C18).
      const payload = { source: PUNCH_SOURCE_WEB, client_timestamp: new Date().toISOString() };
      if (coords) {
        payload.latitude = coords.latitude;
        payload.longitude = coords.longitude;
      }
      const trimmed = notes.trim().slice(0, PUNCH_NOTES_MAX);
      if (trimmed) payload.notes = trimmed;

      try {
        if (kind === "clock-in") {
          if (workMode) payload.work_mode = workMode;
          const res = await attendanceAPI.clockIn(payload);
          const d = res?.data || {};
          const late = Number(d.late_minutes) || 0;
          const at = d.clock_in_time ? ` at ${fmtTime(d.clock_in_time)}` : "";
          if (d.is_holiday || d.is_weekly_off) {
            showToast(`Clocked in${at}. Today is ${d.is_holiday ? "a holiday" : "your weekly off"} — this work is recorded separately.`, "info");
          } else if (late > 0 && !d.within_grace) {
            showToast(`Clocked in${at} · ${fmtMinutes(late)} late.`, "info");
          } else if (late > 0) {
            showToast(`Clocked in${at} · within the ${fmtMinutes(late)} grace window.`);
          } else {
            showToast(`Clocked in${at}.`);
          }
        } else {
          const res = await attendanceAPI.clockOut(payload);
          setLastResult(res?.data || null);
          showToast("Clocked out. Your day has been calculated.");
        }
        setNotes("");
        setShowNotes(false);
        emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH, { kind });
      } catch (err) {
        fail(err, kind === "clock-in" ? "Couldn't clock you in." : "Couldn't clock you out.");
      } finally {
        fetchStatus?.();
      }
    });

  const breakAction = (kind) =>
    run(kind, async () => {
      try {
        if (kind === "break-start") await attendanceAPI.breakStart({ source: PUNCH_SOURCE_WEB });
        else await attendanceAPI.breakEnd({ source: PUNCH_SOURCE_WEB });
        showToast(kind === "break-start" ? "Break started." : "Break ended — welcome back.");
        emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH, { kind });
      } catch (err) {
        fail(err, kind === "break-start" ? "Couldn't start your break." : "Couldn't end your break.");
      } finally {
        fetchStatus?.();
      }
    });

  const confirmClockOut = async () => {
    if (busyRef.current) return;
    const summary = worked ? ` You've worked about ${fmtMinutes(Math.floor(worked.workedMs / 60000))} so far.` : "";
    if (!(await window.confirm(`Clock out for today?${summary} You won't be able to clock in again today.`))) return;
    punch("clock-out");
  };

  const disabled = !!busy;
  const base = className !== undefined
    ? className
    : horizontal
      ? "bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-slate-100 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8"
      : "bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-slate-100 flex flex-col h-full";
  // Clocking in or out must not resize the card: the actions are pinned to the
  // bottom and the stacked card floors at the height of its tallest state.
  const cardClass = horizontal ? base : `${base} min-h-[17rem]`;

  if (!today && loading) {
    return (
      <div className={cardClass} aria-busy="true">
        <div className={`h-5 w-24 bg-slate-100 rounded animate-pulse ${horizontal ? "" : "mb-6"}`} />
        <div className={`bg-slate-100/70 rounded-2xl animate-pulse ${horizontal ? "h-24 w-24 rounded-full" : "h-32 mb-6"}`} />
        <div className={`h-12 bg-slate-100 rounded-xl animate-pulse ${horizontal ? "flex-1 w-full" : ""}`} />
      </div>
    );
  }
  if (!today && error) {
    return (
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-slate-800">Today</h3>
        <ErrorState error={error} onRetry={fetchStatus} fallback="Couldn't load today's attendance." />
      </div>
    );
  }

  // The badge already names the day type (holiday / weekly off / leave); the
  // hint only adds what the badge can't say.
  const hint = phase === "idle" && (today?.is_holiday || status === "holiday" || today?.is_weekly_off || status === "weekly_off")
    ? "You can still clock in if you're working today."
    : null;

  const badge = onBreak
    ? <StatusBadge kind="record" status="late" label="On Break" />
    : <StatusBadge kind="record" status={status || "not_marked"} />;

  // Shift (U13): name + timings inline; type and grace live in the tooltip.
  const shiftType = shift?.shift_type || shift?.type;
  const shiftLabel = shift
    ? [shift.name, shift.start_time && shift.end_time ? `${fmtClock(shift.start_time)}–${fmtClock(shift.end_time)}` : null].filter(Boolean).join(" · ")
    : "No shift assigned";
  const shiftTitle = shift
    ? [shiftType ? SHIFT_TYPES[shiftType]?.label || humanize(shiftType) : null, policy?.grace_minutes != null ? `${policy.grace_minutes}m grace` : null].filter(Boolean).join(" · ")
    : "Contact HR if this is unexpected.";

  const toggleNotes = () => {
    if (showNotes) setNotes("");
    setShowNotes(!showNotes);
  };

  const stateLine = phase === "working" ? (
    <p className="flex items-start gap-2 text-sm font-medium text-slate-500">
      <HiOutlineClock className="w-5 h-5 text-slate-400 shrink-0 mt-px" />
      <span>
        {onBreak ? `On break since ${fmtTime(today.active_break?.start_time)}.` : `Clocked in at ${fmtTime(clockIn)}.`}
        {breakMinutes ? ` Breaks so far: ${fmtMinutes(breakMinutes)}.` : ""}
      </span>
    </p>
  ) : phase === "done" ? (
    <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
      <HiOutlineClock className="w-5 h-5 text-slate-400 shrink-0" /> Day complete.
    </p>
  ) : null;

  const ring = phase === "idle" ? null : (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-100" />
        {progress > 0 && (
          <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} className={`${onBreak ? "text-fuchsia-400" : "text-purple-600"} transition-all duration-700`} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-extrabold text-slate-800 tracking-tight tabular-nums">
          {phase === "working" ? fmtDuration(worked.workedMs).slice(0, 5) : phase === "done" ? fmtHours(effectiveHours, "--:--") : "--:--"}
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
          {phase === "working" ? (worked.breaksKnown ? "worked" : "elapsed") : phase === "done" ? "effective" : "hrs"}
        </span>
      </div>
    </div>
  );

  const dayHeader = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-xl font-bold text-slate-800">{carriedOver ? "Open shift" : "Today"}</h3>
          {badge}
        </div>
        {today?.date && <p className="text-xs text-slate-400 font-medium mt-0.5">{carriedOver ? "Started " : ""}{fmtDate(recordDate, { weekday: "long", day: "numeric", month: "short" }, "")}</p>}
        {shiftLabel && (
          <p className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold mt-1.5 truncate" title={shiftTitle || undefined}>
            <HiClock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="truncate">{shiftLabel}</span>
          </p>
        )}
        {stateLine && <div className="mt-3">{stateLine}</div>}
      </div>

      {hint && <p className="text-xs font-medium text-slate-500 mt-3">{hint}</p>}

      {carriedOver && (
        <p className="text-[11px] font-semibold text-indigo-600 mt-3">Your shift from {fmtDate(recordDate, { weekday: "short", day: "numeric", month: "short" })} is still open. Clock out to finish it before starting a new day.</p>
      )}
    </>
  );

  return (
    <div className={cardClass}>
      {horizontal ? (
        <>
          <div className="lg:w-72 shrink-0 min-w-0">{dayHeader}</div>
          {ring && <div className="shrink-0 lg:px-8 lg:border-x lg:border-slate-100">{ring}</div>}
        </>
      ) : (
        // The ring sits beside the day rather than under it: the day, the shift
        // and the state line fill its height, so the card is one block with no
        // empty band running across the middle.
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">{dayHeader}</div>
          {ring}
        </div>
      )}

      <div className={horizontal ? "w-full lg:flex-1 lg:max-w-xl lg:ml-auto space-y-3 min-w-0" : "w-full space-y-3 mt-auto"}>
        {inlineError && <InlineAlert tone="rose">{inlineError}</InlineAlert>}

        {geoIssue && (
          <InlineAlert tone="amber">
            <p>{geoIssue.message}</p>
            <p className="font-medium mt-1">Punches without location may be flagged for your manager to review.</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {geoIssue.status !== GEO_STATUS.UNSUPPORTED && geoIssue.status !== GEO_STATUS.INSECURE && (
                <button type="button" onClick={() => punch(geoIssue.kind)} disabled={disabled} className="px-3 py-1.5 rounded-lg bg-white border border-fuchsia-300 text-fuchsia-800 font-bold disabled:opacity-50">
                  Try again
                </button>
              )}
              <button type="button" onClick={() => punch(geoIssue.kind, { skipLocation: true })} disabled={disabled} className="px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white font-bold disabled:opacity-50">
                {geoIssue.kind === "clock-in" ? "Clock in without location" : "Clock out without location"}
              </button>
              <button type="button" onClick={() => setGeoIssue(null)} disabled={disabled} className="px-3 py-1.5 rounded-lg text-fuchsia-800 font-bold disabled:opacity-50">
                Cancel
              </button>
            </div>
          </InlineAlert>
        )}

        {(phase === "idle" || (phase === "working" && !onBreak)) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {phase === "idle" && (
                <div className="flex-1 min-w-0 grid grid-cols-4 gap-0.5 p-1 bg-slate-100/80 rounded-xl" role="radiogroup" aria-label="Working from">
                  {WORK_MODES.map((m) => (
                    <button key={m.value} type="button" role="radio" aria-checked={workMode === m.value} disabled={disabled} onClick={() => persistWorkMode(m.value)} className={`py-1.5 rounded-lg text-[11px] font-bold truncate transition ${workMode === m.value ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={toggleNotes} disabled={disabled} aria-pressed={showNotes} title={showNotes ? "Remove note" : "Add a note"} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold transition ${showNotes ? "bg-purple-50 text-purple-700" : "text-slate-500 hover:text-purple-600 hover:bg-slate-50"}`}>
                <HiPencilAlt className="w-3.5 h-3.5" /> Note
              </button>
            </div>
            {showNotes && (
              <div>
                <textarea rows={2} autoFocus maxLength={PUNCH_NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} placeholder={phase === "idle" ? "Note for this clock-in (optional)" : "Note for this clock-out (optional)"} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 resize-none" />
                <p className="text-[10px] text-slate-400 text-right tabular-nums">{notes.length}/{PUNCH_NOTES_MAX}</p>
              </div>
            )}
          </div>
        )}

        {/* One two-button row from clock-in to clock-out, so the card never
            reflows: the left button walks the day forward (Clock In → Start
            Break → End Break) and Clock Out is there from the start, greyed
            out until there is an open day to close. */}
        {(phase === "idle" || phase === "working") && (
          <div className="grid grid-cols-2 gap-3">
            {phase === "idle" ? (
              <button type="button" className={PRIMARY_ACTION} onClick={() => punch("clock-in")} disabled={disabled}>
                {busy === "locating" ? <><HiLocationMarker className="w-4 h-4 animate-pulse" /> Locating…</> : busy === "clock-in" ? <><Spinner /> Clocking in…</> : "Clock In"}
              </button>
            ) : onBreak ? (
              <button type="button" className={BREAK_END_ACTION} onClick={() => breakAction("break-end")} disabled={disabled}>
                {busy === "break-end" && <Spinner />} End Break
              </button>
            ) : (
              <button type="button" className={BREAK_START_ACTION} onClick={() => breakAction("break-start")} disabled={disabled}>
                {busy === "break-start" && <Spinner />} Start Break
              </button>
            )}
            <button
              type="button"
              className={CLOCK_OUT_ACTION}
              onClick={confirmClockOut}
              disabled={disabled || phase === "idle" || onBreak}
              title={phase === "idle" ? "Clock in first — then you can close the day here." : onBreak ? "End your break first." : undefined}
            >
              {busy === "locating" ? <HiLocationMarker className="w-4 h-4 animate-pulse" /> : busy === "clock-out" ? <Spinner /> : null}
              {busy === "clock-out" ? "Clocking out…" : "Clock Out"}
            </button>
          </div>
        )}

        {phase === "done" && result && (
          // One strip, so a finished day is no taller than an open one. Effective
          // hours live in the ring above, so the fourth cell shows overtime.
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/40 grid grid-cols-2 sm:grid-cols-4">
              <DayStat icon={HiOutlineClock} label="Clock In" value={fmtTime(result.clock_in_time)} />
              <DayStat icon={HiOutlineClock} label="Clock Out" value={fmtTime(result.clock_out_time)} />
              <DayStat icon={BiCoffeeTogo} label="Breaks" value={fmtMinutes(result.break_duration_minutes ?? breakMinutes, "0m")} />
              <DayStat icon={BiStopwatch} label="Overtime" value={fmtMinutes(result.overtime_minutes, "0m")} accent={Number(result.overtime_minutes) > 0} />
            </div>
            {dayNotes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dayNotes.map(([label, value]) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fuchsia-50 border border-fuchsia-100 text-[11px] font-semibold text-fuchsia-700">
                    {label} <span className="font-bold">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

export default AttendanceCard;
