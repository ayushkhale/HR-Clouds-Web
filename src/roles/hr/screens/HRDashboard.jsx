import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { HiUserGroup, HiClock, HiSparkles, HiChevronLeft, HiChevronRight, HiCheckCircle, HiExclamationCircle, HiChartBar, HiRefresh } from "react-icons/hi";
import { attendanceAPI } from "../../../shared/api";
import AttendanceDirectory from "../components/AttendanceDirectory";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { employeeCode, initials, listFrom, num, personName, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { WORK_MODES, humanize } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { EmptyState, ErrorState, FilterTabs, LoadingRows } from "../../../shared/attendance/ui";

const CHART_PAGE_SIZE = 15;
const LIVE_REFRESH_MS = 60_000;
const MODE_COLORS = { office: "#7C3AED", remote: "#38BDF8", field: "#F59E0B", hybrid: "#10B981" };

/** Generic async widget state. */
function useWidget(fetcher, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher();
      if (id === reqId.current) setState({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      if (id === reqId.current) setState((s) => ({ ...s, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return [state, load];
}

function MonthStepper({ period, onChange }) {
  const next = shiftMonth(period.year, period.month, 1);
  return (
    <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
      <button type="button" onClick={() => onChange(shiftMonth(period.year, period.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
      <span className="w-24 text-center select-none">{monthLabel(period.year, period.month)}</span>
      <button type="button" onClick={() => onChange(next)} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

/* ─── Department summary (H61) ─────────────────────────────────── */
function DepartmentSummaryCard() {
  const [date, setDate] = useState(todayYMD());
  const [state, reload] = useWidget(() => attendanceAPI.getDepartmentSummary(date), [date]);
  const depts = listFrom(state.data, ["departments"]);

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h3 className="text-lg font-bold text-slate-800">Department overview · {fmtDate(date, { day: "numeric", month: "short" })}</h3>
        <input type="date" value={date} max={todayYMD()} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600" aria-label="Department summary date" />
      </div>
      {state.error ? (
        <ErrorState error={state.error} onRetry={reload} fallback="Couldn't load department data." />
      ) : state.loading ? (
        <LoadingRows rows={2} />
      ) : depts.length === 0 ? (
        <EmptyState icon={HiUserGroup} title="No department data" message="Assign employees to departments to see this breakdown." />
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {depts.map((dept, i) => {
            const total = num(dept.total_employees);
            const denom = total || 1;
            const present = num(dept.present_count);
            const absent = num(dept.absent_count);
            const late = num(dept.late_count);
            const pct = (n) => Math.min(100, Math.round((n / denom) * 100));
            const presentPct = dept.attendance_percentage != null ? Math.round(num(dept.attendance_percentage)) : pct(present);
            const deptName = dept.department || dept.department_name || "Unassigned";
            return (
              <div key={dept.department_id || deptName || i} className="border border-slate-100 rounded-2xl p-5 hover:shadow-md hover:border-purple-200 transition-all flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 text-white flex items-center justify-center font-bold text-sm shrink-0">{initials(deptName)}</div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 truncate text-sm" title={deptName}>{deptName}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{total} {total === 1 ? "member" : "members"}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold text-slate-800 leading-none">{presentPct}%</div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Present</div>
                  </div>
                </div>
                <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-100 mb-4">
                  {pct(present) > 0 && <div className="bg-purple-600 h-full" style={{ width: `${pct(present)}%` }} />}
                  {pct(absent) > 0 && <div className="bg-purple-200 h-full" style={{ width: `${pct(absent)}%` }} />}
                </div>
                {[["Present", present, "bg-purple-600"], ["Late (of present)", late, "bg-purple-400"], ["Absent", absent, "bg-purple-200"]].map(([label, value, dot]) => (
                  <div key={label} className="flex items-center gap-2 mt-1.5">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
                    <span className="text-sm font-bold text-slate-800 ml-auto">{value}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HRDashboard() {
  const { user } = useAuth();
  const now = new Date();
  // Local date passed explicitly: the server's default "today" is IST (§8.6).
  // Evaluated on every call, so the 60s poll rolls over at local midnight.
  const [live, reloadLive] = useWidget(() => attendanceAPI.getLiveDashboard(todayYMD()), []);
  const [liveAt, setLiveAt] = useState(null);
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, reloadGraph] = useWidget(() => attendanceAPI.getDashboardGraphData(period.month, period.year), [period.month, period.year]);
  const [chartPage, setChartPage] = useState(0);
  const chartScrollTimeout = useRef(0);

  useEffect(() => { if (!live.loading && !live.error) setLiveAt(new Date()); }, [live.loading, live.error]);
  useEffect(() => { setChartPage(0); }, [period.month, period.year]);

  // Live counts: poll while visible, refresh on focus and after corrections.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && reloadLive(), LIVE_REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && reloadLive();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [reloadLive]);
  useAttendanceChanged([ATTENDANCE_EVENTS.REGULARIZATION, ATTENDANCE_EVENTS.LOCK], () => { reloadLive(); reloadGraph(); });

  const daily = listFrom(graph.data, ["daily", "days"]).map((d) => ({
    ...d,
    date: ymdOnly(d.date),
    on_time_count: Math.max(0, num(d.final_present_count) - num(d.late_count)),
  }));
  const totalChartPages = Math.max(1, Math.ceil(daily.length / CHART_PAGE_SIZE));
  const safePage = Math.min(chartPage, totalChartPages - 1);
  const chartData = daily.slice(safePage * CHART_PAGE_SIZE, (safePage + 1) * CHART_PAGE_SIZE);

  const handleChartWheel = (e) => {
    const t = Date.now();
    if (t - chartScrollTimeout.current < 400) return;
    if ((e.deltaX > 15 || e.deltaY > 15) && safePage < totalChartPages - 1) { setChartPage(safePage + 1); chartScrollTimeout.current = t; }
    else if ((e.deltaX < -15 || e.deltaY < -15) && safePage > 0) { setChartPage(safePage - 1); chartScrollTimeout.current = t; }
  };

  const l = live.data || {};
  const stats = [
    { label: "Total org personnel", value: num(l.total_employees), icon: HiUserGroup },
    { label: "Present today", value: num(l.final_present_count), icon: HiCheckCircle, tag: DICTIONARY.STATUS.PRESENT },
    { label: "Absent today", value: num(l.final_absent_count), icon: HiExclamationCircle, tag: DICTIONARY.STATUS.ABSENT },
    { label: "Late arrivals", value: num(l.counts?.late), icon: HiClock, tag: DICTIONARY.STATUS.LATE },
  ];

  return (
    <>
      <DashboardTopBar title="HR Dashboard" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
        <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 max-w-2xl space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20">
              <HiSparkles className="w-3 h-3 text-purple-200" /> HR COMMAND CENTER
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Welcome back, {user?.first_name || user?.name?.split(" ")[0] || user?.identifier || "HR Administrator"}</h1>
            <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Monitor live attendance, rules, shift rosters and holidays.</p>
          </div>
          <img src="https://cdn.iconscout.com/strapi/hero_image_3_D_characters_33a9f45068.png?f=webp&w=312" alt="" className="relative z-10 w-36 sm:w-56 md:w-64 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-6 sm:-mb-8" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100 order-2">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[11px] font-semibold text-slate-400">{liveAt ? `Live · updated ${fmtTime(liveAt)}` : "Live"}</p>
              <button type="button" onClick={reloadLive} disabled={live.loading} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh live counts">
                <HiRefresh className={`w-4 h-4 ${live.loading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {live.error ? (
              <ErrorState error={live.error} onRetry={reloadLive} fallback="Couldn't load live counts." />
            ) : (
              <div className={`grid grid-cols-2 gap-6 ${live.loading && !live.data ? "opacity-50" : ""}`}>
                {stats.map(({ label, value, icon: Icon, tag }) => (
                  <div key={label}>
                    <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 bg-slate-50"><Icon className="w-4 h-4" /></div>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                      <span className="text-3xl font-bold tracking-tight text-slate-800 leading-none">{value}</span>
                      {tag && <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full w-max">{tag}</span>}
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
                <h3 className="text-lg font-bold text-slate-800">{DICTIONARY.HEADERS.TEAM_PERFORMANCE}</h3>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#8B5CF6]" /> On time</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Late</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#DDD6FE]" /> {DICTIONARY.STATUS.ABSENT}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {totalChartPages > 1 && (
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                    <button type="button" onClick={() => setChartPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Earlier days"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="text-center select-none w-12">{safePage + 1}/{totalChartPages}</span>
                    <button type="button" onClick={() => setChartPage(Math.min(totalChartPages - 1, safePage + 1))} disabled={safePage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Later days"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
                <MonthStepper period={period} onChange={setPeriod} />
              </div>
            </div>
            <div className="relative w-full h-56 mt-auto" onWheel={handleChartWheel}>
              {graph.loading ? (
                <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
              ) : graph.error ? (
                <ErrorState error={graph.error} onRetry={reloadGraph} fallback="Couldn't load trends." />
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
                    <Bar dataKey="final_absent_count" name={DICTIONARY.STATUS.ABSENT} fill="#DDD6FE" maxBarSize={8} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>



        <DepartmentSummaryCard />

        <div className="mt-8">
          <AttendanceDirectory />
        </div>
      </main>
    </>
  );
}

export default HRDashboard;
