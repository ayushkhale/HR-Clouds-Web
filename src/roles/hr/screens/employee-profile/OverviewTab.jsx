import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle, HiExclamationCircle, HiClock, HiTrendingUp, HiCalendar, HiChevronLeft, HiChevronRight,
  HiLightningBolt, HiRefresh,
} from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { listFrom, num, unwrap } from "../../../../shared/attendance/normalize";
import { statusMeta } from "../../../../shared/attendance/enums";
import { fmtDate, fmtHours, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { ErrorState, StatusBadge } from "../../../../shared/attendance/ui";

const LIVE_REFRESH_MS = 60_000;

// Purple-only day colours, from strongest (worked) to lightest (nothing due).
// Absent and "no data" are dark fills so a missed day never reads as blank;
// only days still to come stay light.
const HEAT = {
  present: "bg-purple-700 border-purple-700 text-white",
  late: "bg-purple-400 border-purple-400 text-white",
  half_day: "bg-purple-300 border-purple-300 text-purple-950",
  on_leave: "bg-violet-200 border-violet-300 text-violet-900",
  absent: "bg-purple-950 border-purple-950 text-white",
  holiday: "bg-purple-100 border-purple-300 text-purple-700",
  weekly_off: "bg-slate-200 border-slate-200 text-slate-600",
  in_progress: "bg-white border-purple-400 text-purple-700",
};
const NO_DATA = "bg-slate-700 border-slate-700 text-slate-100";
const UPCOMING = "bg-slate-50 border-slate-200 text-slate-400";
const LEGEND = ["present", "late", "half_day", "on_leave", "absent", "holiday", "weekly_off"];

export default function OverviewTab({ userId, employeeRole }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [state, setState] = useState({ summary: null, history: [], loading: true, error: null });
  const [updatedAt, setUpdatedAt] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const api = memberAttendanceApi(employeeRole);
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const [sum, hist] = await Promise.allSettled([
      api.summary(userId, period.month, period.year),
      api.history(userId, { month: period.month, year: period.year, page: 1, limit: 31 }),
    ]);
    // Month switched (or role resolved) while this was in flight — drop it.
    if (id !== reqId.current) return;
    // Response: { data: { user_id, month, year, summary: { present_days, … } } }
    const payload = sum.status === "fulfilled" ? unwrap(sum.value) : null;
    const failed = sum.status === "rejected" && hist.status === "rejected";
    setState({
      summary: payload?.summary ?? payload ?? null,
      history: hist.status === "fulfilled" ? listFrom(hist.value, ["records"]) : [],
      loading: false,
      error: failed ? sum.reason : null,
    });
    if (!failed) setUpdatedAt(new Date());
  }, [userId, employeeRole, period.month, period.year]);

  useEffect(() => { load(); }, [load]);

  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth() + 1;

  // The current month is live, like the HR dashboard: poll while the tab is
  // visible and refresh when it comes back into view.
  useEffect(() => {
    if (!isCurrentMonth) return undefined;
    const refresh = () => document.visibilityState === "visible" && load();
    const id = setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, [isCurrentMonth, load]);

  const byDate = useMemo(() => Object.fromEntries(state.history.map((r) => [ymdOnly(r.date), r])), [state.history]);
  const today = todayYMD();
  const todayRecord = isCurrentMonth ? byDate[today] : null;
  const s = state.summary || {};
  const next = shiftMonth(period.year, period.month, 1);
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const label = monthLabel(period.year, period.month);

  const stats = [
    { label: "Days present", value: num(s.present_days), icon: HiCheckCircle, tag: "Present" },
    { label: "Days absent", value: num(s.absent_days), icon: HiExclamationCircle, tag: "Absent" },
    { label: "Late arrivals", value: num(s.late_days), icon: HiClock, tag: `${num(s.punctuality_percentage)}% on time` },
    { label: "Days on leave", value: num(s.on_leave_days), icon: HiCalendar, tag: "Leave" },
    { label: "Hours worked", value: fmtHours(s.total_hours_worked, "0m"), icon: HiTrendingUp, tag: `${fmtHours(s.average_hours_per_day, "0m")} / day` },
    { label: "Overtime", value: fmtMinutes(s.total_overtime_minutes, "0m"), icon: HiLightningBolt },
  ];

  const statusLine = isCurrentMonth
    ? (updatedAt ? `Live · updated ${fmtTime(updatedAt)}` : "Live")
    : `${label} · final figures`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800">Monthly overview</h2>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs w-max">
          <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
          <span className="w-32 text-center select-none">{label}</span>
          <button type="button" onClick={() => setPeriod(next)} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Same card as the HR dashboard's live counts. */}
      <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100">
        <div className="flex items-center justify-between mb-5">
          <p className="text-[11px] font-semibold text-slate-400">{statusLine}</p>
          <button type="button" onClick={load} disabled={state.loading} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh monthly overview">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {state.error ? (
          <ErrorState error={state.error} onRetry={load} fallback="Couldn't load this month's attendance." />
        ) : (
          <div className={`grid grid-cols-2 md:grid-cols-3 gap-6 ${state.loading && !state.summary ? "opacity-50" : ""}`}>
            {stats.map(({ label: statLabel, value, icon: Icon, tag }) => (
              <div key={statLabel}>
                <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 bg-slate-50"><Icon className="w-4 h-4" /></div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-800 leading-none">{value}</span>
                  {tag && <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full w-max">{tag}</span>}
                </div>
                <div className="text-[11px] sm:text-sm font-semibold text-slate-500 mt-1">{statLabel}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        <div className="md:col-span-4 bg-white rounded-3xl border border-slate-100 p-4 shadow-xs">
          <span className="text-[9px] font-bold text-purple-600 tracking-wider uppercase bg-purple-50 px-2 py-0.5 rounded-md">
            Today · {fmtDate(today, { weekday: "short", day: "numeric", month: "short" })}
          </span>
          <div className="mt-3 space-y-2">
            <div className="mb-3">{todayRecord ? <StatusBadge status={todayRecord.status} /> : <StatusBadge status="not_marked" />}</div>
            {[
              ["Clock in", fmtTime(todayRecord?.clock_in_time)],
              ["Clock out", fmtTime(todayRecord?.clock_out_time)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">{k}</span>
                <span className="font-extrabold text-slate-700">{v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-purple-50/40 border border-purple-100/50">
              <span className="text-purple-600 font-bold uppercase tracking-wider text-[9px]">Hours</span>
              <LiveEffectiveHours effectiveHours={todayRecord?.effective_hours} clockInTime={todayRecord?.clock_in_time} clockOutTime={todayRecord?.clock_out_time} breaks={todayRecord?.breaks} className="text-purple-700 text-sm" />
            </div>
            {!isCurrentMonth && <p className="text-[10px] text-slate-400">Switch to the current month to see today&apos;s status.</p>}
          </div>
        </div>

        <div className="md:col-span-8 bg-white rounded-3xl border border-slate-100 p-4 shadow-xs">
          <h3 className="text-xs font-bold text-slate-700 mb-1">Attendance pattern</h3>
          <div className="flex flex-wrap items-center gap-3 mb-4 mt-1.5">
            {LEGEND.map((key) => (
              <span key={key} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className={`w-3 h-3 rounded-[3px] border ${HEAT[key]}`} /> {statusMeta("record", key).label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className={`w-3 h-3 rounded-[3px] border ${NO_DATA}`} /> No data
            </span>
            <span className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className={`w-3 h-3 rounded-[3px] border ${UPCOMING}`} /> Upcoming
            </span>
          </div>
          <div className="grid gap-1.5 sm:gap-2 w-full grid-cols-7 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ymd = `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const record = byDate[ymd];
              // "late" is not a stored day status — a present day with late
              // minutes is what the Late legend colour represents.
              const baseKey = statusMeta("record", record?.status).key;
              const key = baseKey === "present" && (num(record?.late_minutes) > 0 || record?.is_late === true) ? "late" : baseKey;
              const known = record && HEAT[key];
              const upcoming = !known && ymd > today;
              const cls = known ? HEAT[key] : upcoming ? UPCOMING : NO_DATA;
              return (
                <div
                  key={day}
                  title={`${fmtDate(ymd, { weekday: "long", day: "numeric", month: "short" })}: ${known ? statusMeta("record", key).label : upcoming ? "Upcoming" : "No data"}`}
                  className={`w-full aspect-square rounded-md border flex items-center justify-center text-[10px] sm:text-xs font-bold ${cls}`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
