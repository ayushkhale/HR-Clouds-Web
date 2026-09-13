import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheckCircle, HiExclamationCircle, HiClock, HiTrendingUp, HiCalendar, HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { listFrom, num, unwrap } from "../../../../shared/attendance/normalize";
import { statusMeta } from "../../../../shared/attendance/enums";
import { fmtDate, fmtHours, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { ErrorState, StatusBadge } from "../../../../shared/attendance/ui";

const HEAT = {
  present: "bg-[#6D28D9] border-[#6D28D9] text-white",
  late: "bg-[#A78BFA] border-[#A78BFA] text-purple-950",
  half_day: "bg-[#C4B5FD] border-[#C4B5FD] text-purple-900",
  on_leave: "bg-[#DDD6FE] border-[#DDD6FE] text-purple-800",
  in_progress: "bg-sky-100 border-sky-300 text-sky-700",
  holiday: "bg-indigo-50 border-indigo-200 text-indigo-500",
  weekly_off: "bg-slate-100 border-slate-200 text-slate-400",
  absent: "bg-white border-rose-200 text-rose-400",
};
const LEGEND = ["present", "late", "half_day", "on_leave", "absent", "holiday", "weekly_off"];

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-4 h-4" /></div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
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
    setState({
      summary: sum.status === "fulfilled" ? unwrap(sum.value) : null,
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <div key={i} className="bg-slate-100 rounded-2xl h-28 animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Days present" value={num(s.present_days)} icon={HiCheckCircle} color="bg-purple-50 text-purple-700" />
          <StatCard label="Half days" value={num(s.half_days)} icon={HiClock} color="bg-blue-50 text-blue-600" />
          <StatCard label="Days absent" value={num(s.absent_days)} icon={HiExclamationCircle} color="bg-rose-50 text-rose-500" />
          <StatCard label="On leave" value={num(s.on_leave_days)} icon={HiCalendar} color="bg-violet-50 text-violet-500" />
          <StatCard label="Late arrivals" value={num(s.late_days)} icon={HiClock} color="bg-amber-50 text-amber-600" />
          {/* Summary keys per contract §4.2; older payload keys kept as fallback. */}
          <StatCard label="Holidays / weekly offs" value={num(s.holiday_days ?? s.holidays) + num(s.weekly_off_days ?? s.weekly_offs)} icon={HiCalendar} color="bg-slate-50 text-slate-500" />
          <StatCard label="Hours worked" value={fmtHours(s.total_hours_worked ?? s.total_effective_hours, "0m")} icon={HiTrendingUp} color="bg-indigo-50 text-indigo-500" />
          <StatCard label="Overtime" value={fmtMinutes(s.total_overtime_minutes, "0m")} icon={HiTrendingUp} color="bg-emerald-50 text-emerald-600" />
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
              <span key={key} className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                <span className={`w-2.5 h-2.5 rounded-[2px] border ${HEAT[key]}`} /> {statusMeta("record", key).label}
              </span>
            ))}
          </div>
          <div className="grid gap-1.5 sm:gap-2 w-full grid-cols-7 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ymd = `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const record = byDate[ymd];
              const key = statusMeta("record", record?.status).key;
              const cls = HEAT[key] || "bg-slate-50 border-slate-200 text-slate-300";
              return (
                <div
                  key={day}
                  title={`${fmtDate(ymd, { weekday: "long", day: "numeric", month: "short" })}: ${record ? statusMeta("record", record.status).label : ymd > today ? "Upcoming" : "No record"}`}
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
