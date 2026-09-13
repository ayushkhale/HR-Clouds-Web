import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { HiSparkles, HiClock, HiCheckCircle, HiCalendar, HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { listFrom, num, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtHours, fmtMinutes, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { ErrorState, StatusBadge } from "../../../shared/attendance/ui";
import { useSelfServicePath } from "../../../shared/attendance/paths";

const RING = 2 * Math.PI * 40;

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Donut built from real counts — no fabricated segments. */
function AttendanceDonut({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div className="relative w-28 h-28 flex-shrink-0 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" stroke="#E2E8F0" strokeWidth="8" fill="none" />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * RING;
          const el = <circle key={s.key} cx="50" cy="50" r="40" stroke={s.color} strokeWidth="8" fill="none" strokeDasharray={`${len} ${RING - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-extrabold text-slate-800">{segments[0]?.value ?? 0}</span>
        <span className="text-[9px] font-bold text-slate-400">of {total} days</span>
      </div>
    </div>
  );
}

function EmployeeDashboard() {
  const { user } = useAuth();
  const selfPath = useSelfServicePath();
  const { today, shift, loading: todayLoading, error: todayError, refresh } = useTodayAttendance();

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, setGraph] = useState({ data: null, loading: true, error: null });
  const [holidays, setHolidays] = useState([]);

  const loadGraph = useCallback(async () => {
    setGraph((g) => ({ ...g, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getGraphData(period.month, period.year);
      setGraph({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setGraph({ data: null, loading: false, error });
    }
  }, [period.month, period.year]);

  useEffect(() => { loadGraph(); }, [loadGraph]);
  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION], loadGraph);

  useEffect(() => {
    let alive = true;
    // `/holidays` takes no parameters (contract §4.3); filter to upcoming dates here.
    attendanceAPI
      .getUpcomingHolidays()
      .then((res) => {
        if (!alive) return;
        const from = todayYMD();
        setHolidays(listFrom(res, ["holidays"]).filter((h) => ymdOnly(h.date) >= from).sort((a, b) => ymdOnly(a.date).localeCompare(ymdOnly(b.date))).slice(0, 4));
      })
      .catch(() => alive && setHolidays([]));
    return () => {
      alive = false;
    };
  }, []);

  const summary = graph.data?.summary || {};
  const daily = listFrom(graph.data, ["daily", "days"]);
  const recent = [...daily].filter((d) => d.status && d.status !== "not_marked").sort((a, b) => ymdOnly(b.date).localeCompare(ymdOnly(a.date))).slice(0, 5);
  const segments = [
    { key: "present", label: "present", value: num(summary.present_days), color: "#9333EA", dot: "bg-purple-600" },
    { key: "half", label: "half days", value: num(summary.half_days), color: "#818CF8", dot: "bg-indigo-400" },
    { key: "leave", label: "on leave", value: num(summary.on_leave_days), color: "#C084FC", dot: "bg-purple-300" },
    { key: "absent", label: "absent", value: num(summary.absent_days), color: "#F43F5E", dot: "bg-rose-500" },
  ];
  const displayName = user?.first_name || user?.name?.split(" ")[0] || user?.identifier?.split("@")[0] || "there";
  const nextPeriod = shiftMonth(period.year, period.month, 1);
  const atCurrentMonth = isFutureMonth(nextPeriod.year, nextPeriod.month);

  return (
    <>
      <DashboardTopBar title="Employee Portal" />

      <main className="p-4 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6">
        <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20">
              <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
              EMPLOYEE PORTAL
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">{greeting()}, {displayName}!</h1>
            <p className="text-xs sm:text-sm text-purple-100/80 font-normal pt-2">Clock in, track your working hours and keep your attendance record accurate.</p>
          </div>
          <img
            src="https://d1i7580riw15wg.cloudfront.net/gd-assets/header-images/hero-about-us-3e62e8f762b357820226797094331409508ee0cdbd5b085cc16b9aa9cf712b09.webp"
            alt=""
            className="relative z-10 w-36 sm:w-56 md:w-72 object-contain drop-shadow-2xl sm:mr-4 md:mr-8"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1">
            <AttendanceCard currentState={today} fetchStatus={refresh} shiftData={shift} loading={todayLoading} error={todayError} />
          </div>

          <div className="xl:col-span-2 bg-white rounded-3xl shadow-xs border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-5 sm:pt-6">
              <h3 className="text-sm font-bold text-slate-800">My month</h3>
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
                <span className="w-28 text-center select-none">{monthLabel(period.year, period.month)}</span>
                <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} disabled={atCurrentMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            {graph.error ? (
              <ErrorState error={graph.error} onRetry={loadGraph} fallback="Couldn't load your monthly stats." />
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${graph.loading ? "opacity-60" : ""}`} aria-busy={graph.loading}>
                <div className="md:border-r border-b md:border-b-0 border-slate-100 grid grid-cols-2 gap-6 p-5 sm:p-8">
                  {[
                    { label: "Average Hours / Day", value: fmtHours(summary.average_hours_per_day, "0m") },
                    { label: "Total Hours", value: fmtHours(summary.total_hours_worked, "0m") },
                    { label: "On-time Arrival", value: `${num(summary.punctuality_percentage)}%`, accent: true },
                    { label: "Overtime", value: fmtMinutes(summary.total_overtime_minutes, "0m") },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="w-10 h-10 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 bg-purple-50">
                        {s.accent ? <HiCheckCircle className="w-4 h-4" /> : <HiClock className="w-4 h-4" />}
                      </div>
                      <span className={`text-2xl sm:text-3xl font-bold tracking-tight leading-none ${s.accent ? "text-purple-600" : "text-slate-800"}`}>{s.value}</span>
                      <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-2">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="p-6 sm:p-8 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-slate-800">Attendance mix</h3>
                    <Link to={selfPath("history")} className="text-xs font-semibold text-purple-600 hover:text-purple-800">View details</Link>
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <div className="space-y-3">
                      {segments.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                          <span className="text-xs font-bold text-slate-800">{s.value}</span>
                          <span className="text-[11px] font-medium text-slate-400">{s.label}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-xs font-bold text-slate-800">{num(summary.late_days)}</span>
                        <span className="text-[11px] font-medium text-slate-400">late arrivals</span>
                      </div>
                    </div>
                    <AttendanceDonut segments={segments} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <HiCalendar className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-800">Upcoming holidays</h3>
            </div>
            {holidays.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No upcoming holidays.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {holidays.map((h) => (
                  <li key={h.id || `${h.name}-${h.date}`} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{h.name}</p>
                      <p className="text-[11px] text-slate-400">{fmtDate(ymdOnly(h.date), { weekday: "long", day: "numeric", month: "short" })}</p>
                    </div>
                    {h.is_optional && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Optional</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800">Recent days</h3>
              <Link to={selfPath("history")} className="text-xs font-semibold text-purple-600 hover:text-purple-800">Full history</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-y-2 min-w-[420px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-2 rounded-l-xl">Date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Late</th>
                    <th className="px-4 py-2">Overtime</th>
                    <th className="px-4 py-2 rounded-r-xl">Effective</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-semibold text-slate-700">
                  {recent.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-600">{fmtDate(ymdOnly(row.date), { weekday: "short", day: "numeric", month: "short" })}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-2.5 text-amber-600">{Number(row.late_minutes) > 0 ? fmtMinutes(row.late_minutes) : "—"}</td>
                      <td className="px-4 py-2.5 text-purple-600">{Number(row.overtime_minutes) > 0 ? fmtMinutes(row.overtime_minutes) : "—"}</td>
                      <td className="px-4 py-2.5">{fmtHours(row.effective_hours)}</td>
                    </tr>
                  ))}
                  {!graph.loading && recent.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-slate-400">No attendance recorded for {monthLabel(period.year, period.month)}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default EmployeeDashboard;
