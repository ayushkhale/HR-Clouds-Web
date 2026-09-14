import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle, HiXCircle, HiClock, HiTrendingUp, HiCalendar, HiChevronLeft, HiChevronRight,
  HiAdjustments, HiSun, HiMoon, HiChartBar, HiPause, HiLightningBolt, HiBadgeCheck,
} from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { listFrom, num, unwrap } from "../../../../shared/attendance/normalize";
import { statusMeta } from "../../../../shared/attendance/enums";
import { fmtDate, fmtHours, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { ErrorState, StatusBadge } from "../../../../shared/attendance/ui";

// Distinct, purple-friendly colours per day status — no two statuses share a
// hue, and "absent" is a solid fill so it never reads as an empty day.
const HEAT = {
  present: "bg-violet-600 border-violet-600 text-white",
  late: "bg-amber-400 border-amber-400 text-amber-950",
  half_day: "bg-sky-400 border-sky-400 text-white",
  on_leave: "bg-fuchsia-400 border-fuchsia-400 text-white",
  absent: "bg-rose-500 border-rose-500 text-white",
  holiday: "bg-teal-400 border-teal-400 text-white",
  weekly_off: "bg-slate-300 border-slate-300 text-slate-700",
  in_progress: "bg-indigo-200 border-indigo-300 text-indigo-800",
};
const NO_RECORD = "bg-white border-dashed border-slate-200 text-slate-300";
const LEGEND = ["present", "late", "half_day", "on_leave", "absent", "holiday", "weekly_off"];

const ICON_TONES = [
  "bg-purple-600 text-white",
  "bg-purple-100 text-purple-700",
  "bg-violet-100 text-violet-700",
];

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="bg-white rounded-2xl border border-purple-100/70 p-5 shadow-xs flex items-center gap-4 hover:border-purple-200 hover:shadow-sm transition">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-1.5 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function OverviewTab({ userId, employeeRole }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [state, setState] = useState({ summary: null, history: [], loading: true, error: null });
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
    setState({
      summary: payload?.summary ?? payload ?? null,
      history: hist.status === "fulfilled" ? listFrom(hist.value, ["records"]) : [],
      loading: false,
      error: sum.status === "rejected" && hist.status === "rejected" ? sum.reason : null,
    });
  }, [userId, employeeRole, period.month, period.year]);

  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => Object.fromEntries(state.history.map((r) => [ymdOnly(r.date), r])), [state.history]);
  const today = todayYMD();
  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
  const todayRecord = isCurrentMonth ? byDate[today] : null;
  const s = state.summary || {};
  const next = shiftMonth(period.year, period.month, 1);
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const label = monthLabel(period.year, period.month);

  const stats = [
    { label: "Days present", value: num(s.present_days), icon: HiCheckCircle },
    { label: "Half days", value: num(s.half_days), icon: HiAdjustments },
    { label: "Days absent", value: num(s.absent_days), icon: HiXCircle },
    { label: "Late arrivals", value: num(s.late_days), icon: HiClock },
    { label: "On leave", value: num(s.on_leave_days), icon: HiCalendar },
    { label: "Holidays", value: num(s.holiday_days), icon: HiSun },
    { label: "Weekly offs", value: num(s.weekly_off_days), icon: HiMoon },
    { label: "Hours worked", value: fmtHours(s.total_hours_worked, "0m"), icon: HiTrendingUp },
    { label: "Avg. hours / day", value: fmtHours(s.average_hours_per_day, "0m"), icon: HiChartBar },
    { label: "Overtime", value: fmtMinutes(s.total_overtime_minutes, "0m"), icon: HiLightningBolt },
    { label: "Break time", value: fmtMinutes(s.total_break_minutes, "0m"), icon: HiPause },
    { label: "Punctuality", value: `${num(s.punctuality_percentage)}%`, icon: HiBadgeCheck },
  ];

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

      {state.error ? (
        <div className="bg-white rounded-2xl border border-slate-100"><ErrorState error={state.error} onRetry={load} fallback="Couldn't load this month's attendance." /></div>
      ) : state.loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{[...Array(12)].map((_, i) => <div key={i} className="bg-slate-100 rounded-2xl h-24 animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => <StatCard key={stat.label} {...stat} tone={ICON_TONES[i % ICON_TONES.length]} />)}
        </div>
      )}

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
            {!isCurrentMonth && <p className="text-[10px] text-slate-400">Switch to the current month to see today's status.</p>}
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
              <span className={`w-3 h-3 rounded-[3px] border ${NO_RECORD}`} /> No record
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
              const cls = (record && HEAT[key]) || NO_RECORD;
              return (
                <div
                  key={day}
                  title={`${fmtDate(ymd, { weekday: "long", day: "numeric", month: "short" })}: ${record ? statusMeta("record", key).label : ymd > today ? "Upcoming" : "No record"}`}
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
