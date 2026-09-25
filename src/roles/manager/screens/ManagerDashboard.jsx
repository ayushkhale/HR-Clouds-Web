import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { useAuth } from "../../../shared/contexts/AuthContext";
import AttendanceCard from "../../employee/components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import Skeleton from "../../../shared/components/Skeleton";
import { HiUserGroup, HiClock, HiCalendar, HiSparkles, HiLightningBolt, HiChevronLeft, HiChevronRight, HiCheckCircle, HiExclamationCircle, HiChartBar, HiRefresh } from "react-icons/hi";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import { departmentName, employeeCode, listFrom, num, personName, unwrap } from "../../../shared/attendance/normalize";
import { fmtClock, fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { DepartmentCard } from "../../hr/screens/HRDashboard";
import { TREND_COLORS } from "../../../shared/attendance/dayStatus";
import { ErrorState, InlineAlert, StatusBadge } from "../../../shared/attendance/ui";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";
import { greetingFor } from "../../../shared/utils/greeting";

const CHART_PAGE_SIZE = 15;
// HR's department summary endpoint is HR-only, so the manager's version is
// counted from today's team list, in the shape HR's DepartmentCard reads.
// Late is a subset of present; anyone not present or on leave counts as
// absent, the same way the `final_*` counts treat "not marked".
const PRESENT_STATUSES = new Set(["present", "late", "half_day", "in_progress", "overtime"]);
function departmentBreakdown(records) {
  const byDept = new Map();
  records.forEach((r) => {
    const name = departmentName(r) || "No department";
    const d = byDept.get(name) || { department: name, total_employees: 0, final_present_count: 0, final_absent_count: 0, late: 0, on_leave: 0 };
    d.total_employees += 1;
    if (r.status === "on_leave") d.on_leave += 1;
    else if (r.clock_in_time || PRESENT_STATUSES.has(r.status)) {
      d.final_present_count += 1;
      if (num(r.late_minutes) > 0) d.late += 1;
    } else d.final_absent_count += 1;
    byDept.set(name, d);
  });
  return [...byDept.values()].sort((a, b) => b.total_employees - a.total_employees || a.department.localeCompare(b.department));
}

const CARD = "bg-white rounded-3xl p-6 shadow-xs border border-slate-100";

/** The one header every dashboard card uses: title, a quiet subtitle, one action. */
// `icon` and `divider` are opt-in: only the punch card wears them, so the
// other cards on the dashboard keep their plainer heading.
function CardHeader({ title, subtitle, action, icon: Icon, divider = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${divider ? "mb-5 pb-4 border-b border-slate-100" : "mb-5"}`}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-800 leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] font-semibold text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
const LIVE_REFRESH_MS = 60_000;

/* ─── Team status today (M1 — today-only endpoint) ─────────────────────── */
// One read of /manager/team/today. The dashboard shares it between the
// overview stats and the directory, so the endpoint is called once, not twice.
function useTeamToday({ enabled = true } = {}) {
  const [state, setState] = useState({ records: [], loading: enabled, error: null, at: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // /manager/team/today carries no department, so it is joined from the
      // roster (hierarchy-scoped for a manager, cached for five minutes). A
      // roster failure only costs the department, never the attendance.
      const [res, roster] = await Promise.all([
        attendanceAPI.getManagerTeamToday(),
        fetchAllOrgEmployees({ includeInactive: false }).catch(() => []),
      ]);
      const deptById = new Map(roster.map((e) => [e.user_id || e.id, departmentName(e)]));
      const records = listFrom(res, ["team", "members", "records"]).map((r) => {
        const dept = departmentName(r) || deptById.get(r.user_id || r.id);
        return dept ? { ...r, department_name: dept } : r;
      });
      records.sort((a, b) => personName(a).localeCompare(personName(b)));
      setState({ records, loading: false, error: null, at: new Date() });
    } catch (error) {
      setState({ records: [], loading: false, error, at: null });
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, load]);

  return { ...state, load };
}

// `title` is the page or section heading; `headingLevel="h1"` when it is the
// page's own title (Live Attendance). Rows open the member's attendance.
// `team` is a useTeamToday() result owned by the caller; without it the table
// loads its own.
export function TeamDirectoryTable({ title = "Attendance Directory", headingLevel = "h2", description, team }) {
  const navigate = useNavigate();
  const Heading = headingLevel;
  const own = useTeamToday({ enabled: !team });
  const state = team || own;
  const { load } = state;

  // Contract §8.2: the server computes this endpoint's "today" in UTC, so while
  // the local date is ahead of the UTC date (e.g. 00:00–05:30 IST) it still
  // returns yesterday's attendance. Tell the manager when that switches.
  const utcLagging = todayYMD() !== new Date().toISOString().slice(0, 10) && new Date().getTimezoneOffset() < 0;
  const utcRollover = new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <Heading className={`${headingLevel === "h1" ? "text-2xl text-slate-900" : "text-xl text-slate-800"} font-bold tracking-tight`}>{title}</Heading>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">{fmtDate(todayYMD(), { weekday: "long", day: "numeric", month: "short" })}{state.at ? ` · updated ${fmtTime(state.at)}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard/manager/team/history" className="text-xs font-bold text-purple-600 hover:text-purple-800">Attendance History</Link>
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
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Employee</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Department</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Shift</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">In</th>
                    <th className="px-5 py-3.5 text-[11px] uppercase tracking-wide">Out</th>
                    <th className="px-5 py-3.5 text-right text-[11px] uppercase tracking-wide">Lateness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {state.records.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">No one reports to you yet, or no attendance has been recorded today.</td></tr>
                  ) : state.records.map((mem) => {
                    const name = personName(mem);
                    const code = employeeCode(mem);
                    const late = num(mem.late_minutes);
                    const dept = departmentName(mem);
                    const id = mem.user_id || mem.id;
                    const open = () => id && navigate(`/dashboard/manager/team/member/${id}?tab=attendance`);
                    return (
                      <tr
                        key={id || name}
                        onClick={open}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
                        tabIndex={id ? 0 : -1}
                        role={id ? "link" : undefined}
                        aria-label={id ? `Open ${name}'s attendance` : undefined}
                        className={`transition-colors outline-none ${id ? "hover:bg-purple-50/30 focus:bg-purple-50/40 cursor-pointer" : ""}`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 text-xs"><GenderAvatar person={mem} name={name} /></div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{name}</p>
                              {code && <p className="text-[10px] text-slate-400">{code}</p>}
                            </div>
                          </div>
                        </td>
                        <td className={`px-5 py-3.5 text-sm font-semibold ${dept ? "text-slate-700" : "text-slate-400"}`}>{dept || "N/A"}</td>
                        <td className="px-5 py-3.5">
                          {mem.active_break ? <StatusBadge status="late" label="On Break" /> : <StatusBadge status={mem.status || "not_marked"} />}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{mem.shift ? `${mem.shift.name || "Shift"}${mem.shift.start_time ? ` · ${fmtClock(mem.shift.start_time)}–${fmtClock(mem.shift.end_time)}` : ""}` : "N/A"}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_in_time)}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_out_time)}</td>
                        <td className="px-5 py-3.5 text-right">
                          {!mem.clock_in_time ? <span className="text-slate-300 text-xs">N/A</span>
                            : late > 0 ? <span className="text-rose-600 font-bold text-xs">{fmtMinutes(late)} late</span>
                              : <span className="text-violet-600 font-bold text-xs">On time</span>}
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
// Three rows, nothing else: my own punch card, the team's month and today at a
// glance (the same pair as the HR dashboard), then who is in right now.
function ManagerDashboard() {
  const { user } = useAuth();
  const { today, shift, loading: todayLoading, error: todayError, refresh } = useTodayAttendance();
  const now = new Date();
  const [summary, setSummary] = useState({ data: null, loading: true, error: null });
  const [summaryAt, setSummaryAt] = useState(null);
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, setGraph] = useState({ data: null, loading: true, error: null });
  const [chartPage, setChartPage] = useState(0);
  const chartScrollTimeout = useRef(0);
  const team = useTeamToday();
  const reloadTeam = team.load;
  const departments = useMemo(() => departmentBreakdown(team.records), [team.records]);
  const [deptIndex, setDeptIndex] = useState(0);
  // A refresh can shrink the list; stay on a department that still exists.
  const safeDeptIndex = Math.min(deptIndex, Math.max(0, departments.length - 1));

  const loadSummary = useCallback(async () => {
    setSummary((s) => ({ ...s, loading: true, error: null }));
    try {
      // M14 expects a local calendar date (YYYY-MM-DD), not an ISO timestamp.
      const res = await attendanceAPI.getTeamSummary(todayYMD());
      setSummary({ data: unwrap(res), loading: false, error: null });
      setSummaryAt(new Date());
    } catch (error) {
      setSummary((s) => ({ ...s, loading: false, error }));
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

  // Today's counts stay live like the HR dashboard: poll while visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadSummary();
      reloadTeam();
    }, LIVE_REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && loadSummary();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadSummary, reloadTeam]);

  const refreshOverview = () => { loadSummary(); reloadTeam(); };

  // Same three series as HR's chart. The manager payload nests the per-status
  // counts under `counts`, so leave is lifted to the top level for the bar.
  const daily = listFrom(graph.data, ["daily", "days"]).map((d) => ({
    ...d,
    date: ymdOnly(d.date),
    on_leave_count: num(d.on_leave_count ?? d.counts?.on_leave_count),
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
    { label: "Present today", value: num(s.final_present_count), icon: HiCheckCircle, tag: "Present" },
    { label: "Absent today", value: num(s.final_absent_count), icon: HiExclamationCircle, tag: "Absent" },
    { label: "Late arrivals", value: num(s.counts?.late), icon: HiClock, tag: "Late" },
    // From today's team list: the summary's `counts` keys aren't documented
    // beyond `late`, so these are counted from each member's own status.
    { label: "On leave today", value: team.error ? "N/A" : team.records.filter((r) => r.status === "on_leave").length, icon: HiCalendar, tag: "Leave" },
    { label: "Working right now", value: team.error ? "N/A" : team.records.filter((r) => r.clock_in_time && !r.clock_out_time).length, icon: HiLightningBolt, tag: "Live" },
  ];

  return (
    <>
      <DashboardTopBar title="Dashboard" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
        <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 max-w-2xl space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20">
              <HiSparkles className="w-3 h-3 text-purple-200" /> MANAGER WORKSPACE
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{greetingFor(user, "there")}</h1>
            <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Monitor team attendance, review pending requests and track your team&apos;s performance.</p>
          </div>
          <img src="https://cdn3d.iconscout.com/3d/premium/thumb/empresario-haciendo-meditacion-3d-icon-png-download-8179740.png" alt="" className="relative z-10 w-28 sm:w-40 md:w-48 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-4 sm:-mb-6" />
        </div>

        {/* Left half: my punch card over the team's month. Right half: today's
            team numbers, stretched to the height of both. Every card uses the
            same shell and header so the two columns line up. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="flex flex-col gap-6 min-w-0">
            <section className={CARD}>
              <CardHeader
                icon={HiCalendar}
                divider
                title="My attendance"
                subtitle="Clock in, take breaks and clock out"
                action={<Link to="/dashboard/manager/attendance" className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">My history <HiChevronRight className="w-3.5 h-3.5" /></Link>}
              />
              <AttendanceCard className="flex flex-col" currentState={today} fetchStatus={refresh} shiftData={shift} loading={todayLoading} error={todayError} />
            </section>

            <section className={`${CARD} flex-1 flex flex-col`}>
              <CardHeader
                title="Team attendance trends"
                subtitle="Present, on leave and absent, day by day"
                action={(
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600">
                    <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="w-24 text-center select-none">{monthLabel(period.year, period.month)}</span>
                    <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              />
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-4">
                  {[["Present", TREND_COLORS.present], ["On leave", TREND_COLORS.on_leave], ["Absent", TREND_COLORS.absent]].map(([label, dot]) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap"><span className="w-2 h-2 rounded-full" style={{ background: dot }} /> {label}</span>
                  ))}
                </div>
                {totalChartPages > 1 && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <button type="button" onClick={() => setChartPage(Math.max(0, safeChartPage - 1))} disabled={safeChartPage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Earlier days"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="text-center select-none w-10 tabular-nums">{safeChartPage + 1}/{totalChartPages}</span>
                    <button type="button" onClick={() => setChartPage(Math.min(totalChartPages - 1, safeChartPage + 1))} disabled={safeChartPage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Later days"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className="relative w-full flex-1 min-h-[16rem]" onWheel={handleChartWheel}>
                <div className="absolute inset-0">
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
                          <Bar dataKey="final_present_count" name="Present" fill={TREND_COLORS.present} maxBarSize={8} radius={[3, 3, 0, 0]} />
                          <Bar dataKey="on_leave_count" name="On leave" fill={TREND_COLORS.on_leave} maxBarSize={8} radius={[3, 3, 0, 0]} />
                          <Bar dataKey="final_absent_count" name="Absent" fill={TREND_COLORS.absent} maxBarSize={8} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>
              </div>
            </section>
          </div>

          {/* Right half mirrors the left: a compact card over one that stretches. */}
          <div className="flex flex-col gap-6 min-w-0">
            <section className={CARD}>
              <CardHeader
                title="Team today"
                subtitle={summaryAt ? `Live · updated ${fmtTime(summaryAt)}` : "Live"}
                action={(
                  <button type="button" onClick={refreshOverview} disabled={summary.loading || team.loading} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh team counts">
                    <HiRefresh className={`w-4 h-4 ${summary.loading || team.loading ? "animate-spin" : ""}`} />
                  </button>
                )}
              />
              {summary.error && !summary.data ? (
                <ErrorState error={summary.error} onRetry={loadSummary} fallback="Couldn't load today's team summary." />
              ) : (
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${summary.loading && !summary.data ? "opacity-50" : ""}`}>
                  {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-2xl bg-slate-50/70 border border-slate-100 px-4 py-3.5">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Icon className="w-4 h-4 text-purple-500 shrink-0" />
                        <span className="text-[11px] font-semibold truncate">{label}</span>
                      </div>
                      <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none mt-2 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`${CARD} flex-1 flex flex-col min-h-0`}>
              <CardHeader
                title="Department overview"
                subtitle={`${departments.length} ${departments.length === 1 ? "department" : "departments"} in your team · today`}
                action={departments.length > 1 && (
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600">
                    <button type="button" onClick={() => setDeptIndex((i) => Math.max(0, i - 1))} disabled={safeDeptIndex === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Previous department"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="w-10 text-center select-none tabular-nums">{safeDeptIndex + 1}/{departments.length}</span>
                    <button type="button" onClick={() => setDeptIndex((i) => Math.min(departments.length - 1, i + 1))} disabled={safeDeptIndex >= departments.length - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Next department"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              />
              {team.error ? (
                <ErrorState error={team.error} onRetry={reloadTeam} fallback="Couldn't load today's team." />
              ) : team.loading && team.records.length === 0 ? (
                <div className="flex-1 space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
              ) : departments.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 py-8">
                  <HiUserGroup className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm font-semibold">No one reports to you yet</p>
                </div>
              ) : (
                // One department at a time; the header chevrons slide between them.
                <div className="flex flex-col gap-4">
                  <div key={departments[safeDeptIndex].department} className="animate-in fade-in slide-in-from-right-2 duration-200">
                    <DepartmentCard dept={departments[safeDeptIndex]} />
                  </div>
                  {departments.length > 1 && (
                    <div className="flex justify-center gap-1.5" role="tablist" aria-label="Departments">
                      {departments.map((d, i) => (
                        <button
                          key={d.department}
                          type="button"
                          role="tab"
                          aria-selected={i === safeDeptIndex}
                          aria-label={d.department}
                          onClick={() => setDeptIndex(i)}
                          className={`h-1.5 rounded-full transition-all ${i === safeDeptIndex ? "w-5 bg-purple-600" : "w-1.5 bg-purple-200 hover:bg-purple-300"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        <TeamDirectoryTable team={team} />
      </main>
    </>
  );
}

export default ManagerDashboard;
