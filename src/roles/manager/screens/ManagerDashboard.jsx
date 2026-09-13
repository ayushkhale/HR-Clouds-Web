import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../../employee/components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import Skeleton from "../../../shared/components/Skeleton";
import { HiSparkles, HiUserGroup, HiClock, HiChevronLeft, HiChevronRight, HiCheckCircle, HiExclamationCircle, HiChartBar, HiRefresh } from "react-icons/hi";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import { employeeCode, initials, listFrom, num, personName, unwrap } from "../../../shared/attendance/normalize";
import { fmtClock, fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { ErrorState, InlineAlert, StatusBadge } from "../../../shared/attendance/ui";

const CHART_PAGE_SIZE = 16;

/* ─── Team status today (M1 — today-only endpoint) ─────────────────────── */
export function TeamDirectoryTable() {
  const [state, setState] = useState({ records: [], loading: true, error: null, at: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getManagerTeamToday();
      const records = listFrom(res, ["team", "members", "records"]);
      records.sort((a, b) => personName(a).localeCompare(personName(b)));
      setState({ records, loading: false, error: null, at: new Date() });
    } catch (error) {
      setState({ records: [], loading: false, error, at: null });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Contract §8.2: the server computes this endpoint's "today" in UTC, so while
  // the local date is ahead of the UTC date (e.g. 00:00–05:30 IST) it still
  // returns yesterday's attendance. Tell the manager when that switches.
  const utcLagging = todayYMD() !== new Date().toISOString().slice(0, 10) && new Date().getTimezoneOffset() < 0;
  const utcRollover = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Team status today</h2>
          <p className="text-[11px] text-slate-400 font-medium">{fmtDate(todayYMD(), { weekday: "long", day: "numeric", month: "short" })}{state.at ? ` · updated ${fmtTime(state.at)}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard/manager/team/history" className="text-xs font-bold text-purple-600 hover:text-purple-800">History</Link>
          <button type="button" onClick={load} disabled={state.loading} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh team status">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {utcLagging && (
        <InlineAlert tone="amber" className="mb-3">
          Until {fmtTime(utcRollover)} this list may still show yesterday's attendance. It updates to today automatically after that.
        </InlineAlert>
      )}
      {state.loading && state.records.length === 0 ? <Skeleton type="table" rows={5} /> : (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden flex-1">
          {state.error ? (
            <ErrorState error={state.error} onRetry={load} fallback="Couldn't load your team's status." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Employee</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Shift</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">In</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Out</th>
                    <th className="px-5 py-3.5 text-right text-[11px] uppercase tracking-wide">Lateness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {state.records.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">No one reports to you yet, or no attendance has been recorded today.</td></tr>
                  ) : state.records.map((mem) => {
                    const name = personName(mem);
                    const code = employeeCode(mem);
                    const late = num(mem.late_minutes);
                    return (
                      <tr key={mem.user_id || mem.id || name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{initials(name)}</div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{name}</p>
                              {code && <p className="text-[10px] text-slate-400">{code}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {mem.active_break ? <StatusBadge status="late" label="On Break" /> : <StatusBadge status={mem.status || "not_marked"} />}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{mem.shift ? `${mem.shift.name || "Shift"}${mem.shift.start_time ? ` · ${fmtClock(mem.shift.start_time)}–${fmtClock(mem.shift.end_time)}` : ""}` : "—"}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_in_time)}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_out_time)}</td>
                        <td className="px-5 py-3.5 text-right">
                          {!mem.clock_in_time ? <span className="text-slate-300 text-xs">—</span>
                            : late > 0 ? <span className="text-rose-600 font-bold text-xs">{fmtMinutes(late)} late</span>
                              : <span className="text-emerald-600 font-bold text-xs">On time</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Manager Dashboard ──────────────────────────────────────────── */
function ManagerDashboard() {
  const { user } = useAuth();
  const { today, shift, loading: todayLoading, error: todayError, refresh } = useTodayAttendance();
  const now = new Date();
  const [summary, setSummary] = useState({ data: null, loading: true, error: null });
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, setGraph] = useState({ data: null, loading: true, error: null });
  const [chartPage, setChartPage] = useState(0);
  const chartScrollTimeout = useRef(0);

  const loadSummary = useCallback(async () => {
    setSummary((s) => ({ ...s, loading: true, error: null }));
    try {
      // M14 expects a local calendar date (YYYY-MM-DD), not an ISO timestamp.
      const res = await attendanceAPI.getTeamSummary(todayYMD());
      setSummary({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setSummary({ data: null, loading: false, error });
    }
  }, []);

  const loadGraph = useCallback(async () => {
    setGraph((g) => ({ ...g, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getTeamGraphData(period.month, period.year);
      setGraph({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setGraph({ data: null, loading: false, error });
    }
  }, [period.month, period.year]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadGraph(); setChartPage(0); }, [loadGraph]);
  useAttendanceChanged([ATTENDANCE_EVENTS.REGULARIZATION], () => { loadSummary(); loadGraph(); });

  const daily = listFrom(graph.data, ["daily", "days"]).map((d) => ({
    ...d,
    date: ymdOnly(d.date),
    // Late is a subset of present, so on-time = present − late (non-overlapping bars).
    on_time_count: Math.max(0, num(d.final_present_count) - num(d.late_count)),
  }));
  const totalChartPages = Math.max(1, Math.ceil(daily.length / CHART_PAGE_SIZE));
  const safeChartPage = Math.min(chartPage, totalChartPages - 1);
  const chartData = daily.slice(safeChartPage * CHART_PAGE_SIZE, (safeChartPage + 1) * CHART_PAGE_SIZE);
  const next = shiftMonth(period.year, period.month, 1);

  const handleChartWheel = (e) => {
    const t = Date.now();
    if (t - chartScrollTimeout.current < 400) return;
    if ((e.deltaX > 15 || e.deltaY > 15) && safeChartPage < totalChartPages - 1) {
      setChartPage(safeChartPage + 1);
      chartScrollTimeout.current = t;
    } else if ((e.deltaX < -15 || e.deltaY < -15) && safeChartPage > 0) {
      setChartPage(safeChartPage - 1);
      chartScrollTimeout.current = t;
    }
  };

  const s = summary.data || {};
  const stats = [
    { label: "Team members", value: num(s.team_size), icon: HiUserGroup },
    { label: "Present today", value: num(s.final_present_count), icon: HiCheckCircle, tag: "Present", tagClass: "bg-purple-50 text-purple-600" },
    { label: "Absent today", value: num(s.final_absent_count), icon: HiExclamationCircle, tag: "Absent", tagClass: "bg-rose-50 text-rose-600" },
    { label: "Late arrivals", value: num(s.counts?.late), icon: HiClock, tag: "Late", tagClass: "bg-amber-50 text-amber-600" },
  ];

  return (
    <>
      <DashboardTopBar title="Manager Workspace" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
        <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-6 text-white relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20">
              <HiSparkles className="w-3.5 h-3.5 text-purple-200" /> MANAGER WORKSPACE
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Welcome back, {user?.first_name || user?.name?.split(" ")[0] || user?.identifier || "Manager"}</h1>
            <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Monitor team attendance, review pending requests, and track your team's performance.</p>
          </div>
          <img src="https://cdn3d.iconscout.com/3d/premium/thumb/empresario-haciendo-meditacion-3d-icon-png-download-8179740.png" alt="" className="relative z-10 w-24 sm:w-32 md:w-40 object-contain drop-shadow-2xl sm:mr-4 md:mr-8 -mb-2 sm:-mb-4" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-800">My attendance</h2>
              <Link to="/dashboard/manager/attendance" className="text-xs font-bold text-purple-600 hover:text-purple-800">My history</Link>
            </div>
            <div className="flex-1 flex flex-col">
              <AttendanceCard currentState={today} fetchStatus={refresh} shiftData={shift} loading={todayLoading} error={todayError} />
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col">
            <TeamDirectoryTable />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100 order-2">
            {summary.error ? (
              <ErrorState error={summary.error} onRetry={loadSummary} fallback="Couldn't load today's team summary." />
            ) : (
              <div className={`grid grid-cols-2 gap-6 ${summary.loading ? "opacity-60" : ""}`}>
                {stats.map(({ label, value, icon: Icon, tag, tagClass }) => (
                  <div key={label}>
                    <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 bg-slate-50"><Icon className="w-4 h-4" /></div>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                      <span className="text-3xl font-bold tracking-tight text-slate-800 leading-none">{value}</span>
                      {tag && <span className={`${tagClass} text-[10px] font-bold px-2 py-0.5 rounded-full w-max`}>{tag}</span>}
                    </div>
                    <div className="text-[11px] sm:text-sm font-semibold text-slate-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100 flex flex-col justify-between order-1">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Team attendance trends</h3>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#8B5CF6]" /> On time</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Late</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#DDD6FE]" /> Absent</span>
                </div>
              </div>
              <div className="flex gap-2">
                {totalChartPages > 1 && (
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                    <button type="button" onClick={() => setChartPage(Math.max(0, safeChartPage - 1))} disabled={safeChartPage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Earlier days"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="text-center select-none w-12">{safeChartPage + 1}/{totalChartPages}</span>
                    <button type="button" onClick={() => setChartPage(Math.min(totalChartPages - 1, safeChartPage + 1))} disabled={safeChartPage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Later days"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                  <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
                  <span className="w-24 text-center select-none">{monthLabel(period.year, period.month)}</span>
                  <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            <div className="relative w-full h-56 mt-auto" onWheel={handleChartWheel}>
              {graph.loading ? (
                <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
              ) : graph.error ? (
                <ErrorState error={graph.error} onRetry={loadGraph} fallback="Couldn't load team trends." />
              ) : chartData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                  <HiChartBar className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm font-semibold">No attendance recorded for {monthLabel(period.year, period.month)}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }} barGap={2} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }} tickFormatter={(val) => fmtDate(val, { day: "numeric" }, "")} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} labelFormatter={(val) => fmtDate(val, { weekday: "short", day: "numeric", month: "short" })} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} labelStyle={{ fontWeight: "bold", color: "#1e293b", marginBottom: "4px" }} />
                    <Bar dataKey="on_time_count" name="On time" fill="#8B5CF6" maxBarSize={8} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="late_count" name="Late" fill="#F59E0B" maxBarSize={8} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="final_absent_count" name="Absent" fill="#DDD6FE" maxBarSize={8} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default ManagerDashboard;
