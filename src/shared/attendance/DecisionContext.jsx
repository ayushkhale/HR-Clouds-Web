// ─────────────────────────────────────────────────────────────────────────────
// attendance/DecisionContext.jsx — Decision-support panels for the approval
// dialog: who the employee is, the shift and policy that applied, what was
// recorded for the day and, for regularizations, exactly what would change.
//
// Manager pending payloads embed the attendance day as `record` (with
// `shift_snapshot` / `policy_snapshot`) and the employee as
// `user.employee_profile`. Punch times are shown in the shift's timezone so
// they line up with the shift schedule.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { HiLocationMarker, HiLockClosed, HiMail } from "react-icons/hi";
import { attendanceAPI } from "../api";
import { isSynthesizedDay } from "./dayStatus.js";
import { anomalyTypeLabel, humanize } from "./enums.js";
import {
  browserTimeZone, clockMinutes, fmtClockMinutes, fmtClockTime, fmtDate, fmtDateTime,
  fmtHours, fmtMinutes, formatInZone, ymdOnly, zoneMinutesFrom,
} from "./dates.js";
import { listFrom } from "./normalize.js";
import { InlineAlert, StatusBadge } from "./ui.jsx";
import GenderAvatar from "../components/GenderAvatar.jsx";

export const recordOf = (item) => item?.record || item?.attendance_record || null;
const shiftOf = (record) => record?.shift_snapshot || record?.shift || null;
const policyOf = (record) => record?.policy_snapshot || record?.policy || null;
const hasNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const LONG_DATE = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

/** Shift as minutes from midnight; overnight shifts end past 1440. */
function shiftWindow(shift) {
  const start = clockMinutes(shift?.start_time);
  let end = clockMinutes(shift?.end_time);
  if (start === null || end === null) return null;
  if (shift.is_overnight || end <= start) end += 1440;
  return { start, end, length: end - start };
}

function spanMinutes(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60_000) : null;
}

/** "40m early" / "on time" style comparison of two minute values. */
function offset(actual, expected, before, after) {
  if (actual === null || expected === null) return null;
  const diff = actual - expected;
  if (diff === 0) return { text: "On time", tone: "slate" };
  return { text: `${fmtMinutes(Math.abs(diff))} ${diff < 0 ? before : after}`, diff };
}

// ── Layout primitives ───────────────────────────────────────────────────────

/** plain: render children without the grey box (for content that is already a card). */
export function DetailSection({ title, aside, children, plain = false }) {
  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</h4>
        {aside}
      </div>
      {plain ? children : <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">{children}</div>}
    </section>
  );
}

const HINT_TONE = {
  slate: "text-slate-400",
  amber: "text-fuchsia-600",
  rose: "text-rose-600",
  emerald: "text-violet-600",
  indigo: "text-indigo-600",
};

function Stat({ label, children, hint, hintTone = "slate" }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
      <div className="text-xs font-bold text-slate-700 break-words">{children}</div>
      {hint && <p className={`text-[10px] font-semibold ${HINT_TONE[hintTone] || HINT_TONE.slate}`}>{hint}</p>}
    </div>
  );
}

const StatGrid = ({ children }) => <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">{children}</div>;

function NextDay({ minutes }) {
  return minutes >= 1440 ? <span className="ml-1 text-[10px] font-bold text-indigo-500">+1 day</span> : null;
}

// ── Employee ────────────────────────────────────────────────────────────────

/** Whichever role profile the person actually has (employee / manager / HR). */
const profileOf = (user) => user?.employee_profile || user?.manager_profile || user?.hr_profile || {};

export function EmployeeCard({ item, person }) {
  const user = item?.user || item?.applicant || {};
  const emp = profileOf(user);
  const role = [emp.designation, emp.department].filter(Boolean).join(" · ");
  const email = user.identifier || user.email || "";
  return (
    <div className="flex items-start gap-3 bg-white border border-slate-100 rounded-xl p-3">
      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 text-sm">
        <GenderAvatar person={user} name={person.name} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 truncate">
          {person.name}
          {person.code && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{person.code}</span>}
        </p>
        {role && <p className="text-xs text-slate-500 truncate">{role}</p>}
        {(emp.work_location || email) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-400">
            {emp.work_location && <span className="inline-flex items-center gap-1"><HiLocationMarker className="w-3 h-3" />{emp.work_location}</span>}
            {email && <span className="inline-flex items-center gap-1 min-w-0"><HiMail className="w-3 h-3 shrink-0" /><span className="truncate">{email}</span></span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

const TIMELINE_TONES = {
  shift: "bg-slate-200 text-slate-600",
  recorded: "bg-purple-200 text-purple-800",
  requested: "bg-violet-600 text-white",
};

/** "06:00 pm", with "(+1)" when the time falls on the next day. */
const clockLabel = (minutes) => `${fmtClockMinutes(minutes)}${minutes >= 1440 ? " (+1)" : ""}`;

/**
 * rows: [{ label, start, end, tone }] in minutes from the day's midnight.
 * Every bar sits on one shared hour scale and is labelled with its own times
 * and length. Dashed guides at the shift's start and end run through the other
 * bars, so arriving early or leaving late is visible at a glance.
 */
function DayTimeline({ rows }) {
  const valid = rows.filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  if (!valid.length) return null;
  const lo = Math.floor((Math.min(...valid.map((r) => r.start)) - 30) / 60) * 60;
  const hi = Math.ceil((Math.max(...valid.map((r) => r.end)) + 30) / 60) * 60;
  const span = hi - lo;
  const pct = (m) => ((m - lo) / span) * 100;
  const hours = span / 60;
  const step = hours <= 12 ? 60 : hours <= 20 ? 120 : 180;
  const ticks = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  const shift = valid.find((r) => r.tone === "shift");
  const guides = shift ? [shift.start, shift.end] : [];

  return (
    <div className="space-y-2">
      {valid.map((r) => (
        <div key={r.label} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-700">{r.label}</p>
            <p className="text-[10px] text-slate-500 whitespace-nowrap">{clockLabel(r.start)} – {clockLabel(r.end)}</p>
          </div>
          <div className="relative h-8 rounded-lg bg-white border border-slate-200 overflow-hidden" aria-hidden="true">
            {ticks.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${pct(t)}%` }} />)}
            {r.tone !== "shift" && guides.map((m) => <span key={m} className="absolute inset-y-0 border-l border-dashed border-slate-400" style={{ left: `${pct(m)}%` }} />)}
            <div
              className={`absolute inset-y-1 rounded-md flex items-center justify-center overflow-hidden ${TIMELINE_TONES[r.tone] || TIMELINE_TONES.shift}`}
              style={{ left: `${pct(r.start)}%`, width: `${pct(r.end) - pct(r.start)}%` }}
            >
              <span className="text-[10px] font-bold whitespace-nowrap px-1.5">{fmtMinutes(r.end - r.start)}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3" aria-hidden="true">
        <span />
        <div className="relative h-3">
          {ticks.map((t, i) => (
            <span
              key={t}
              className={`absolute text-[9px] font-semibold text-slate-400 whitespace-nowrap ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${pct(t)}%` }}
            >
              {fmtClockMinutes(t, { short: true })}
            </span>
          ))}
        </div>
      </div>
      {guides.length > 0 && <p className="text-[10px] text-slate-400">Dashed lines mark when the shift starts and ends.</p>}
    </div>
  );
}

// ── Shift & policy ──────────────────────────────────────────────────────────

function ShiftPolicySection({ record }) {
  const shift = shiftOf(record);
  const policy = policyOf(record);
  if (!shift && !policy) return null;
  const win = shiftWindow(shift);
  const hasBuffer = hasNum(shift?.buffer_minutes_before) || hasNum(shift?.buffer_minutes_after);

  return (
    <DetailSection title="Shift & policy applied">
      {shift && (
        <div className={policy ? "pb-3 mb-3 border-b border-slate-200/70" : ""}>
          <p className="text-xs font-bold text-slate-700">
            {shift.name || "Shift"}
            {shift.type && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{humanize(shift.type)}</span>}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {fmtClockTime(shift.start_time)} – {fmtClockTime(shift.end_time)}
            {win && win.end >= 1440 && " (next day)"}
            {win && ` · ${fmtMinutes(win.length)}`}
            {shift.timezone && ` · ${shift.timezone}`}
          </p>
          {hasBuffer && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Buffer {fmtMinutes(shift.buffer_minutes_before)} before · {fmtMinutes(shift.buffer_minutes_after)} after
            </p>
          )}
        </div>
      )}
      {!shift && (
        <div className="pb-3 mb-3 border-b border-slate-200/70">
          <p className="text-xs font-bold text-slate-700">No shift assigned</p>
          <p className="text-[11px] text-slate-500 mt-0.5">This day was worked without a shift, so only the policy rules below applied.</p>
        </div>
      )}
      {policy && (
        <>
          <StatGrid>
            <Stat label="Grace period">{fmtMinutes(policy.grace_minutes, "N/A")}</Stat>
            <Stat label="Late threshold">{fmtMinutes(policy.late_threshold_minutes, "N/A")}</Stat>
            <Stat label="Full day needs">{fmtHours(policy.full_day_min_hours, "N/A")}</Stat>
            <Stat label="Half day needs">{fmtHours(policy.half_day_min_hours, "N/A")}</Stat>
            <Stat label="Overtime">
              {policy.overtime_enabled === false ? "Disabled" : hasNum(policy.overtime_min_minutes) ? `Min ${fmtMinutes(policy.overtime_min_minutes)}` : "Enabled"}
            </Stat>
            <Stat label="Break limit">
              {hasNum(policy.max_break_duration_minutes) ? fmtMinutes(policy.max_break_duration_minutes) : "No limit"}
              {hasNum(policy.max_breaks_per_day) && <span className="font-medium text-slate-400"> · {policy.max_breaks_per_day}/day</span>}
            </Stat>
          </StatGrid>
          {policy.name && <p className="text-[10px] text-slate-400 mt-3">{policy.name}</p>}
        </>
      )}
    </DetailSection>
  );
}

// ── Recorded day ────────────────────────────────────────────────────────────

function RecordFlags({ record }) {
  if (!record) return null;
  return (
    <>
      {record.is_locked && (
        <InlineAlert tone="rose">
          <span className="inline-flex items-center gap-1"><HiLockClosed className="w-3.5 h-3.5" /> This date is locked for payroll.</span> Changes to it will be refused until HR unlocks the period.
        </InlineAlert>
      )}
      {(record.is_regularized || record.is_manually_corrected) && (
        <InlineAlert tone="amber">
          {record.is_regularized && "This day has already been regularized once. "}
          {record.is_manually_corrected && "HR has manually corrected this day."}
        </InlineAlert>
      )}
    </>
  );
}

function RecordedDaySection({ record, title = "Recorded attendance", showPunches = true }) {
  if (!record) return null;
  const shift = shiftOf(record);
  const policy = policyOf(record);
  const tz = shift?.timezone || browserTimeZone();
  const date = ymdOnly(record.date);
  const win = shiftWindow(shift);
  const inAt = zoneMinutesFrom(date, record.clock_in_time, tz);
  const outAt = zoneMinutesFrom(date, record.clock_out_time, tz);
  const arrival = win ? offset(inAt, win.start, "early", "late") : null;
  const departure = win ? offset(outAt, win.end, "before shift end", "after shift end") : null;
  const effectiveMin = hasNum(record.effective_hours) ? Math.round(Number(record.effective_hours) * 60) : null;
  const fullDayMin = hasNum(policy?.full_day_min_hours) ? Math.round(Number(policy.full_day_min_hours) * 60) : null;
  const halfDayMin = hasNum(policy?.half_day_min_hours) ? Math.round(Number(policy.half_day_min_hours) * 60) : null;
  const effectiveHint =
    effectiveMin === null || fullDayMin === null ? null
      : effectiveMin >= fullDayMin ? { text: `Meets full day (${fmtMinutes(fullDayMin)})`, tone: "emerald" }
        : halfDayMin !== null && effectiveMin >= halfDayMin ? { text: `Below full day · meets half day`, tone: "amber" }
          : { text: "Below half day", tone: "rose" };

  return (
    <DetailSection title={title} aside={record.status && <StatusBadge kind="record" status={record.status} />}>
      <StatGrid>
        {showPunches && (
          <>
            <Stat label="Clock in" hint={arrival?.text} hintTone={arrival?.diff > 0 ? "amber" : "slate"}>
              {record.clock_in_time ? formatInZone(record.clock_in_time, tz) : "N/A"}
            </Stat>
            <Stat label="Clock out" hint={record.clock_out_time ? departure?.text : "Not clocked out"} hintTone={departure?.diff < 0 ? "amber" : "slate"}>
              {record.clock_out_time ? <>{formatInZone(record.clock_out_time, tz)}<NextDay minutes={outAt} /></> : "N/A"}
            </Stat>
          </>
        )}
        <Stat label="Total time">{fmtHours(record.total_hours, "N/A")}</Stat>
        <Stat label="Breaks">{fmtMinutes(record.break_duration_minutes, "N/A")}</Stat>
        <Stat label="Effective hours" hint={effectiveHint?.text} hintTone={effectiveHint?.tone}>{fmtHours(record.effective_hours, "N/A")}</Stat>
        <Stat label="Work mode">{record.work_mode ? humanize(record.work_mode) : "N/A"}</Stat>
        <Stat label="Late by" hintTone="amber">{Number(record.late_minutes) > 0 ? <span className="text-fuchsia-600">{fmtMinutes(record.late_minutes)}</span> : "Not late"}</Stat>
        <Stat label="Left early by">{Number(record.early_exit_minutes) > 0 ? <span className="text-fuchsia-600">{fmtMinutes(record.early_exit_minutes)}</span> : "No"}</Stat>
        <Stat label="Overtime logged">{fmtMinutes(record.overtime_minutes, "N/A")}</Stat>
        {record.is_half_day && <Stat label="Half day">{record.half_day_type ? humanize(record.half_day_type) : "Yes"}</Stat>}
      </StatGrid>
      {record.remarks && <p className="text-[11px] text-slate-500 mt-3"><span className="font-semibold">Remarks:</span> {record.remarks}</p>}
    </DetailSection>
  );
}

function SubmittedLine({ item }) {
  return item.created_at ? <span className="text-[10px] font-semibold text-slate-400">Submitted {fmtDateTime(item.created_at)}</span> : null;
}

// ── Regularization ──────────────────────────────────────────────────────────

export function RegularizationDetails({ item, person }) {
  const record = recordOf(item);
  const shift = shiftOf(record);
  const tz = shift?.timezone || browserTimeZone();
  const date = ymdOnly(item.date || record?.date);
  const win = shiftWindow(shift);

  const req = { in: zoneMinutesFrom(date, item.requested_clock_in, tz), out: zoneMinutesFrom(date, item.requested_clock_out, tz) };
  const rec = { in: zoneMinutesFrom(date, record?.clock_in_time, tz), out: zoneMinutesFrom(date, record?.clock_out_time, tz) };
  const reqSpan = spanMinutes(item.requested_clock_in, item.requested_clock_out);
  const recSpan = record ? spanMinutes(record.clock_in_time, record.clock_out_time) : null;

  const moved = (a, b) => {
    if (a === null || b === null) return null;
    const d = a - b;
    return d === 0 ? "No change" : `${fmtMinutes(Math.abs(d))} ${d < 0 ? "earlier" : "later"}`;
  };
  const modeChanged = !!(item.work_mode && record?.work_mode && item.work_mode !== record.work_mode);
  const policy = policyOf(record);
  const user = item?.user || {};
  const emp = profileOf(user);
  const roleLine = [emp.designation, emp.department].filter(Boolean).join(" · ");
  const email = user.identifier || user.email || "";

  // The decision is about two punches; everything else is context.
  const punches = [
    {
      label: "Clock in",
      from: record?.clock_in_time ? formatInZone(record.clock_in_time, tz) : null,
      to: item.requested_clock_in ? formatInZone(item.requested_clock_in, tz) : null,
      delta: moved(req.in, rec.in),
    },
    {
      label: "Clock out",
      from: record?.clock_out_time ? <>{formatInZone(record.clock_out_time, tz)}<NextDay minutes={rec.out} /></> : null,
      to: item.requested_clock_out ? <>{formatInZone(item.requested_clock_out, tz)}<NextDay minutes={req.out} /></> : null,
      delta: moved(req.out, rec.out),
    },
  ];
  const changedTimes = punches.filter((p) => p.delta && p.delta !== "No change").length;
  const spanDelta = reqSpan !== null && recSpan !== null && reqSpan !== recSpan
    ? `${reqSpan > recSpan ? "+" : "−"}${fmtMinutes(Math.abs(reqSpan - recSpan))}`
    : null;

  const timelineRows = [
    win && { label: "Shift", start: win.start, end: win.end, tone: "shift" },
    { label: "Recorded", start: rec.in, end: rec.out, tone: "recorded" },
    { label: "Requested", start: req.in, end: req.out, tone: "requested" },
  ].filter(Boolean);
  const hasTimeline = timelineRows.some((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);

  const effectiveMin = hasNum(record?.effective_hours) ? Math.round(Number(record.effective_hours) * 60) : null;
  const fullDayMin = hasNum(policy?.full_day_min_hours) ? Math.round(Number(policy.full_day_min_hours) * 60) : null;
  const meetsFullDay = effectiveMin !== null && fullDayMin !== null ? effectiveMin >= fullDayMin : null;
  const lateEarly = [
    Number(record?.late_minutes) > 0 ? `${fmtMinutes(record.late_minutes)} late` : null,
    Number(record?.early_exit_minutes) > 0 ? `${fmtMinutes(record.early_exit_minutes)} early exit` : null,
  ].filter(Boolean).join(" · ") || "On time";

  return (
    <div className="space-y-6">
      {/* Who asked, for which day */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 text-sm"><GenderAvatar person={user} name={person.name} /></div>
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 truncate">
              {person.name}
              {person.code && <span className="ml-2 text-xs font-semibold text-slate-400">{person.code}</span>}
            </p>
            {roleLine && <p className="text-xs text-slate-500 truncate">{roleLine}</p>}
            {email && <p className="text-[11px] text-slate-400 truncate">{email}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-slate-800">{fmtDate(date, LONG_DATE)}</p>
          {item.created_at && <p className="text-[11px] text-slate-400">Requested {fmtDateTime(item.created_at)}</p>}
        </div>
      </div>

      <RecordFlags record={record} />

      <Panel
        title="Requested punch correction"
        aside={<span className="text-[11px] font-semibold text-slate-400">{changedTimes ? `${changedTimes} time${changedTimes === 1 ? "" : "s"} changed` : "Times unchanged"}</span>}
      >
        {!record && (
          <InlineAlert tone="amber" className="mb-4">
            Nothing was recorded for this day — approving creates the day from the requested times.
          </InlineAlert>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {punches.map((p) => <CompareCard key={p.label} {...p} />)}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 pt-4 border-t border-slate-100 text-xs">
          <span className="text-slate-500">
            Time worked <strong className="text-slate-700">{recSpan !== null ? fmtMinutes(recSpan) : "Not recorded"}</strong>
            <span className="mx-1 text-slate-300">→</span>
            <strong className="text-slate-900">{reqSpan !== null ? fmtMinutes(reqSpan) : "N/A"}</strong>
            {spanDelta && <span className="ml-1.5 font-bold text-violet-700">{spanDelta}</span>}
          </span>
          <span className="text-slate-500">
            Work mode <strong className="text-slate-900">{item.work_mode ? humanize(item.work_mode) : record?.work_mode ? humanize(record.work_mode) : "N/A"}</strong>
            {modeChanged && <span className="text-slate-400"> (was {humanize(record.work_mode)})</span>}
          </span>
        </div>
      </Panel>

      {hasTimeline && (
        <Panel title="Day at a glance">
          <DayTimeline rows={timelineRows} />
        </Panel>
      )}

      <Panel title="Employee's reason">
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{item.reason || "No reason given."}</p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Panel title="Day as recorded" aside={record?.status && <StatusBadge kind="record" status={record.status} />}>
          {record ? (
            <div className="space-y-3">
              <Fact
                label="Effective hours"
                value={fmtHours(record.effective_hours, "N/A")}
                hint={meetsFullDay === null ? null : `${meetsFullDay ? "Meets" : "Below"} full day (${fmtHours(policy.full_day_min_hours)})`}
              />
              <Fact label="Breaks" value={fmtMinutes(record.break_duration_minutes, "N/A")} />
              <Fact label="Late / early exit" value={lateEarly} />
              {record.remarks && <Fact label="Remarks" value={record.remarks} />}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No attendance was recorded for this day.</p>
          )}
        </Panel>

        <Panel title="Shift & rules">
          <div className="space-y-3">
            <Fact
              label="Shift"
              value={shift ? shift.name || "Shift" : "No shift assigned"}
              hint={shift ? `${fmtClockTime(shift.start_time)} – ${fmtClockTime(shift.end_time)}${win && win.end >= 1440 ? " (next day)" : ""}` : "Only the policy rules applied"}
            />
            <Fact label="Full day needs" value={fmtHours(policy?.full_day_min_hours, "N/A")} />
            <Fact label="Grace period" value={fmtMinutes(policy?.grace_minutes, "N/A")} />
            {hasNum(policy?.regularization_window_days) && <Fact label="Correction window" value={`${policy.regularization_window_days} days`} />}
            {policy?.name && <p className="text-[10px] text-slate-400 pt-1">{policy.name}</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** A titled white card, matching the section cards used across the app. */
function Panel({ title, aside, children }) {
  return (
    <section className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50/80 border-b border-slate-100">
        <h4 className="text-xs font-bold text-slate-700">{title}</h4>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Recorded time → requested time, with how far it moves. */
function CompareCard({ label, from, to, delta }) {
  const changed = !!delta && delta !== "No change";
  return (
    <div className={`rounded-xl border p-4 ${changed ? "border-violet-200 bg-violet-50/50" : "border-slate-200 bg-slate-50/60"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        {delta && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${changed ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-600"}`}>
            {changed ? delta : "Unchanged"}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-3 flex-wrap">
        <span className={`text-xs font-semibold text-slate-400 ${changed && from ? "line-through decoration-slate-300" : ""}`}>{from || "Not recorded"}</span>
        <span className="text-slate-300">→</span>
        <span className="text-lg font-bold text-slate-900 leading-none">{to || "N/A"}</span>
      </div>
    </div>
  );
}

/** Label on the left, value (and an optional note) on the right. */
function Fact({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-bold text-slate-800 text-right min-w-0 break-words">
        {value}
        {hint && <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">{hint}</span>}
      </span>
    </div>
  );
}

// ── Overtime ────────────────────────────────────────────────────────────────

export function OvertimeDetails({ item, person, overtimeMinutes }) {
  const record = recordOf(item);
  const shift = shiftOf(record);
  const policy = policyOf(record);
  const tz = shift?.timezone || browserTimeZone();
  const date = ymdOnly(item.date || record?.date);
  const win = shiftWindow(shift);
  const minOt = hasNum(policy?.overtime_min_minutes) ? Number(policy.overtime_min_minutes) : null;
  const meetsMin = minOt !== null && hasNum(overtimeMinutes) ? Number(overtimeMinutes) >= minOt : null;

  return (
    <div className="space-y-4">
      <EmployeeCard item={item} person={person} />
      <RecordFlags record={record} />

      <DetailSection title="Overtime claim" aside={<SubmittedLine item={item} />}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-indigo-600 leading-none">{fmtMinutes(overtimeMinutes, "N/A")}</p>
            <p className="text-[11px] text-slate-500 mt-1">{fmtDate(date, LONG_DATE)}</p>
          </div>
          <div className="text-right">
            {item.status && <StatusBadge kind="overtime" status={item.status} />}
            {meetsMin !== null && (
              <p className={`text-[10px] font-semibold mt-1 ${meetsMin ? "text-violet-600" : "text-fuchsia-600"}`}>
                {meetsMin ? "Meets" : "Below"} the policy minimum of {fmtMinutes(minOt)}
              </p>
            )}
            {policy?.overtime_enabled === false && <p className="text-[10px] font-semibold text-rose-600 mt-1">Overtime is disabled in this policy</p>}
          </div>
        </div>
        {(item.remarks || item.reason || item.notes) && (
          <p className="text-xs text-slate-600 mt-3 whitespace-pre-wrap break-words"><span className="font-semibold">Notes:</span> {item.remarks || item.reason || item.notes}</p>
        )}
        {record && (
          <div className="mt-3 pt-3 border-t border-slate-200/70">
            <DayTimeline
              rows={[
                win && { label: "Shift", start: win.start, end: win.end, tone: "shift" },
                { label: "Worked", start: zoneMinutesFrom(date, record.clock_in_time, tz), end: zoneMinutesFrom(date, record.clock_out_time, tz), tone: "recorded" },
              ].filter(Boolean)}
            />
          </div>
        )}
      </DetailSection>

      {record ? <RecordedDaySection record={record} title="Worked that day" /> : <InlineAlert tone="slate">The attendance record for this day wasn&apos;t included with the request.</InlineAlert>}
      <ShiftPolicySection record={record} />
    </div>
  );
}

// ── Anomaly ─────────────────────────────────────────────────────────────────

/** The attendance day behind an anomaly: embedded `record`, else read from the member's history. */
function useDayRecord(item, enabled) {
  const inline = recordOf(item);
  const userId = item?.user_id || item?.user?.id;
  const date = ymdOnly(item?.date);
  const recordId = item?.record_id;
  const [state, setState] = useState({ loading: false, record: null, error: false });

  useEffect(() => {
    if (inline || !enabled || !userId || !date) return undefined;
    let alive = true;
    setState({ loading: true, record: null, error: false });
    attendanceAPI
      .getTeamMemberHistory(userId, { from: date, to: date, page: 1, limit: 5 })
      .then((res) => {
        const rows = listFrom(res, ["records"]);
        // The history endpoint is dense now: a day with no punch still comes
        // back, carrying `id: null` and null metrics. Matching on the date
        // alone would hand this panel an empty shell and render a decision
        // context of blank fields, so only a REAL record counts here.
        const record = rows.find((r) => recordId && r.id === recordId)
          || rows.find((r) => ymdOnly(r.date) === date && !isSynthesizedDay(r))
          || null;
        if (alive) setState({ loading: false, record, error: false });
      })
      .catch(() => alive && setState({ loading: false, record: null, error: true }));
    return () => {
      alive = false;
    };
  }, [inline, enabled, userId, date, recordId]);

  return inline ? { loading: false, record: inline, error: false } : state;
}

export function AnomalyDetails({ item, person, fetchRecord = true }) {
  const date = ymdOnly(item.date) || ymdOnly(item.created_at);
  const day = useDayRecord(item, fetchRecord);

  return (
    <div className="space-y-4">
      <EmployeeCard item={item} person={person} />

      <DetailSection title="Flag" aside={item.severity && <StatusBadge kind="severity" status={item.severity} />}>
        <p className="text-sm font-bold text-slate-800">{anomalyTypeLabel(item.type || item.anomaly_type)}</p>
        {item.description && <p className="text-xs text-slate-600 mt-1 break-words">{item.description}</p>}
        <div className="mt-3">
          <StatGrid>
            <Stat label="Date">{fmtDate(date, LONG_DATE)}</Stat>
            <Stat label="Detected">{fmtDateTime(item.created_at)}</Stat>
          </StatGrid>
        </div>
      </DetailSection>

      {day.loading ? (
        <div className="h-24 rounded-xl bg-slate-100/70 animate-pulse" aria-busy="true" aria-label="Loading attendance for the day" />
      ) : day.record ? (
        <>
          <RecordedDaySection record={day.record} title="Attendance that day" />
          <ShiftPolicySection record={day.record} />
        </>
      ) : fetchRecord ? (
        <InlineAlert tone="slate">{day.error ? "Couldn't load the attendance record for this day." : "No attendance record was found for this day."}</InlineAlert>
      ) : null}
    </div>
  );
}
