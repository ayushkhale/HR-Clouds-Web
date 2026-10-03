import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import PageHeader from "../../../shared/components/PageHeader";
import { HiUserGroup, HiClock, HiSparkles, HiChevronLeft, HiChevronRight, HiCheckCircle, HiExclamationCircle, HiChartBar, HiRefresh, HiCalendar } from "react-icons/hi";
import { attendanceAPI } from "../../../shared/api";
import AttendanceDirectory from "../components/AttendanceDirectory";
import AttendanceCard from "../../employee/components/AttendanceCard";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import { SELF_SERVICE_BASE } from "../../../shared/attendance/paths";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { TREND_COLORS } from "../../../shared/attendance/dayStatus";
import { chartPageCount, chartPageRows, defaultChartPage, emptyTrendDay, fillMonthDays, leaveCountOf, sundayMarkers, trendYAxis } from "../../../shared/attendance/trendChartMeta";
import MonthStepper from "../../../shared/attendance/MonthStepper";
import { DayTick } from "../../../shared/attendance/SundayLabel";
import { employeeCode, initials, listFrom, num, personName, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtMinutes, fmtTime, monthLabel, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { WORK_MODES, humanize } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Toast, useToast } from "../../../shared/attendance/ui";
import { greetingFor } from "../../../shared/utils/greeting";
import { HelpLabel } from "../../../shared/fieldHelp/FieldHelp";
import CardHeader, { CARD } from "../../../shared/components/DashboardCard";
import ProfileSetupCard from "../../../shared/organization/ProfileSetupCard";

const LIVE_REFRESH_MS = 60_000;
const MODE_COLORS = { office: "#7C3AED", remote: "#818CF8", field: "#D946EF", hybrid: "#C4B5FD" };

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

/* ─── Department summary (H61) ─────────────────────────────────── */
// First field the payload actually carries. `final_*` counts are the settled
// figures (not-marked people count as absent), so they win over the raw ones.
const countOf = (dept, keys) => num(dept[keys.find((k) => dept[k] != null)]);

export function DepartmentCard({ dept }) {
  const total = num(dept.total_employees);
  const denom = total || 1;
  const present = countOf(dept, ["final_present_count", "present", "present_count"]);
  const absent = countOf(dept, ["final_absent_count", "absent", "absent_count"]);
  const late = countOf(dept, ["late", "late_count"]);
  const onLeave = countOf(dept, ["on_leave", "on_leave_count"]);
  const pct = (n) => Math.min(100, Math.round((n / denom) * 100));
  // The API reports 100% for a department with nobody in it.
  const presentPct = total === 0 ? null : dept.attendance_percentage != null ? Math.round(num(dept.attendance_percentage)) : pct(present);
  const deptName = deptNameOf(dept);
  return (
    <div className="border border-slate-100 rounded-2xl p-5 hover:shadow-md hover:border-purple-200 transition-all flex flex-col bg-white">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 text-white flex items-center justify-center font-bold text-sm shrink-0">{initials(deptName)}</div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-800 truncate text-sm" title={deptName}>{deptName}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{total} {total === 1 ? "member" : "members"}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xl font-bold leading-none ${presentPct == null ? "text-slate-400" : "text-slate-800"}`}>{presentPct == null ? "N/A" : `${presentPct}%`}</div>
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Present</div>
        </div>
      </div>
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-100 mb-4">
        {pct(present) > 0 && <div className="bg-purple-600 h-full" style={{ width: `${pct(present)}%` }} />}
        {pct(onLeave) > 0 && <div className="bg-fuchsia-300 h-full" style={{ width: `${pct(onLeave)}%` }} />}
        {pct(absent) > 0 && <div className="bg-purple-200 h-full" style={{ width: `${pct(absent)}%` }} />}
      </div>
      {[["Present", present, "bg-purple-600"], ["Late (of present)", late, "bg-purple-400"], ["On leave", onLeave, "bg-fuchsia-300"], ["Absent", absent, "bg-purple-200"]].map(([label, value, dot]) => (
        <div key={label} className="flex items-center gap-2 mt-1.5">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
          <span className="text-sm font-bold text-slate-800 ml-auto">{value}</span>
        </div>
      ))}
    </div>
  );
}

const deptNameOf = (dept) => dept.department || dept.department_name || "Unassigned";
const deptKey = (dept, i) => dept.department_id || `${deptNameOf(dept)}-${i}`;

const DEPTS_PER_PAGE = 2;

// Key for a department row — the id when the server sends one, else its name.

function DepartmentSummaryCard({ className = "" }) {
  const [date, setDate] = useState(todayYMD());
  // Two departments a page, paged like the manager's card. Showing every
  // department stacked made this column grow past the trends chart beside it,
  // so the card height moved with the number of departments; a fixed page
  // keeps it still, and two fit the room this column has.
  const [deptPage, setDeptPage] = useState(0);
  const [state, reload] = useWidget(() => attendanceAPI.getDepartmentSummary(date), [date]);
  const depts = listFrom(state.data, ["departments"]);
  const dateLabel = fmtDate(date, { day: "numeric", month: "short" });
  const deptPages = Math.max(1, Math.ceil(depts.length / DEPTS_PER_PAGE));
  // Clamped rather than reset: a shorter list on a new date must not leave the
  // page pointing past the end for the render that happens before an effect.
  const safeDeptPage = Math.min(deptPage, deptPages - 1);
  const shownDepts = depts.slice(safeDeptPage * DEPTS_PER_PAGE, safeDeptPage * DEPTS_PER_PAGE + DEPTS_PER_PAGE);

  useEffect(() => { setDeptPage(0); }, [date]);

  return (
    <div className={`${CARD} flex flex-col min-h-0 ${className}`}>
      <CardHeader
        title="Department overview"
        subtitle={`${depts.length || "No"} ${depts.length === 1 ? "department" : "departments"} · ${dateLabel}`}
        action={(
          <div className="flex items-center gap-2">
            <input type="date" value={date} max={todayYMD()} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600" aria-label="Department summary date" />
            {deptPages > 1 && (
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600">
                <button type="button" onClick={() => setDeptPage((i) => Math.max(0, i - 1))} disabled={safeDeptPage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Previous departments"><HiChevronLeft className="w-4 h-4" /></button>
                <span className="w-10 text-center select-none tabular-nums">{safeDeptPage + 1}/{deptPages}</span>
                <button type="button" onClick={() => setDeptPage((i) => Math.min(deptPages - 1, i + 1))} disabled={safeDeptPage >= deptPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Next departments"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        )}
      />
      {state.error ? (
        <ErrorState error={state.error} onRetry={reload} fallback="Couldn't load department data." />
      ) : state.loading ? (
        <LoadingRows rows={2} />
      ) : depts.length === 0 ? (
        <EmptyState icon={HiUserGroup} title="No department data" message="Assign employees to departments to see this breakdown." />
      ) : (
        <div className="flex flex-col gap-4">
          <div key={safeDeptPage} className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-2 duration-200">
            {shownDepts.map((dept, i) => <DepartmentCard key={deptKey(dept, i)} dept={dept} />)}
          </div>
          {deptPages > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5" role="tablist" aria-label="Department pages">
              {Array.from({ length: deptPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === safeDeptPage}
                  aria-label={`Departments ${i * DEPTS_PER_PAGE + 1}–${Math.min((i + 1) * DEPTS_PER_PAGE, depts.length)}`}
                  onClick={() => setDeptPage(i)}
                  className={`h-1.5 rounded-full transition-all ${i === safeDeptPage ? "w-5 bg-purple-600" : "w-1.5 bg-purple-200 hover:bg-purple-300"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function HRDashboard() {
  const { user } = useAuth();
  const { toast, showToast, clearToast } = useToast();
  const now = new Date();
  // Local date passed explicitly: the server's default "today" is IST (§8.6).
  // Evaluated on every call, so the 60s poll rolls over at local midnight.
  const [live, reloadLive] = useWidget(() => attendanceAPI.getLiveDashboard(todayYMD()), []);
  const [liveAt, setLiveAt] = useState(null);
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, reloadGraph] = useWidget(() => attendanceAPI.getDashboardGraphData(period.month, period.year), [period.month, period.year]);
  // null = not paged by hand yet, so the chart opens on the half holding today.
  const [chartPage, setChartPage] = useState(null);
  const chartScrollTimeout = useRef(0);

  useEffect(() => { if (!live.loading && !live.error) setLiveAt(new Date()); }, [live.loading, live.error]);
  useEffect(() => { setChartPage(null); }, [period.month, period.year]);

  // Live counts: poll while visible, refresh on focus and after corrections.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && reloadLive(), LIVE_REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && reloadLive();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [reloadLive]);
  useAttendanceChanged([ATTENDANCE_EVENTS.REGULARIZATION, ATTENDANCE_EVENTS.LOCK], () => { reloadLive(); reloadGraph(); });

  // `final_present_count` is everyone who was there, late or not. The chart has
  // no Late bar, so counting only on-time arrivals would drop them from view.
  const recorded = listFrom(graph.data, ["daily", "days"]).map((d) => ({
    ...d,
    date: ymdOnly(d.date),
    // The leave bar is on-leave + weekly-off + holiday, served precomputed as
    // final_leave_count; leaveCountOf falls back to summing them for parity.
    final_leave_count: leaveCountOf(d),
  }));
  // Every day of the month gets a slot, so each half always shows its 15 or
  // 15–16 days — the empty-state check still looks at what was recorded.
  const daily = fillMonthDays(recorded, period, emptyTrendDay);
  const totalChartPages = chartPageCount(daily);
  const safePage = Math.min(chartPage ?? defaultChartPage(daily, period), totalChartPages - 1);
  const chartData = chartPageRows(daily, safePage);
  // Headroom above the tallest bar, so a day when everyone turned up doesn’t
  // draw a bar flush with the top gridline.
  const yAxis = trendYAxis(chartData);

  const handleChartWheel = (e) => {
    const t = Date.now();
    if (t - chartScrollTimeout.current < 400) return;
    if ((e.deltaX > 15 || e.deltaY > 15) && safePage < totalChartPages - 1) { setChartPage(safePage + 1); chartScrollTimeout.current = t; }
    else if ((e.deltaX < -15 || e.deltaY < -15) && safePage > 0) { setChartPage(safePage - 1); chartScrollTimeout.current = t; }
  };

  const { today, shift, loading: todayLoading, error: todayError, refresh: refreshToday } = useTodayAttendance();

  const l = live.data || {};
  const stats = [
    { label: "Total org personnel", value: num(l.total_employees), icon: HiUserGroup },
    { label: "Present today", value: num(l.final_present_count), icon: HiCheckCircle, tag: DICTIONARY.STATUS.PRESENT },
    // overlay: at 390 the ⓘ pushed "Absent today" onto a second line and made
    // every tile in the row taller — the same fix the manager dashboard needed.
    { label: "Absent today", value: num(l.final_absent_count), icon: HiExclamationCircle, tag: DICTIONARY.STATUS.ABSENT, help: { surface: "attendance.team", field: "final_absent_count", overlay: true } },
    { label: "Late arrivals", value: num(l.counts?.late), icon: HiClock, tag: DICTIONARY.STATUS.LATE },
  ];

  return (
    <>
      <DashboardTopBar title="Dashboard" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
        <PageHeader
          badgeText="HR COMMAND CENTER"
          badgeIcon={HiSparkles}
          title={greetingFor(user, "there")}
          subtitle="Monitor live attendance, rules, shift management and holidays."
          image="https://cdn.iconscout.com/strapi/hero_image_3_D_characters_33a9f45068.png?f=webp&w=312"
        />

        {/* Directly under the greeting, and above the day's numbers: this is the
            first screen after registering an organisation, and the card is how
            the creator finds out their own record was left blank. It renders
            nothing once setup is complete, which is every login after the
            first — so it costs the usual dashboard nothing. */}
        <ProfileSetupCard onToast={showToast} />

        {/* Left half: my punch card over the month's trend. Right half: today's
            live numbers, stretched to the height of both. This mirrors the
            manager dashboard exactly — same shell, same header, same stacked
            card — so a manager promoted to HR keeps the screen they know (§2). */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="flex flex-col gap-6 min-w-0">
            <section className={CARD}>
              <CardHeader
                icon={HiCalendar}
                divider
                title="My attendance"
                subtitle="Clock in, take breaks and clock out"
                action={<Link to={SELF_SERVICE_BASE.hr} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">My history <HiChevronRight className="w-3.5 h-3.5" /></Link>}
              />
              <AttendanceCard className="flex flex-col" currentState={today} fetchStatus={refreshToday} shiftData={shift} loading={todayLoading} error={todayError} />
            </section>

            {/* The manager dashboard's trends card, to the pixel: same header, legend
                row, pager, plot height and margins, and the same name out of the
                dictionary. A manager promoted to HR must not have to relearn it
                (§2), so change the two together or not at all. */}
            <section className={`${CARD} flex-1 flex flex-col`}>
              <CardHeader
                title={DICTIONARY.HEADERS.TEAM_ATTENDANCE_TRENDS}
                subtitle={DICTIONARY.DESCRIPTIONS.TEAM_ATTENDANCE_TRENDS}
                action={<MonthStepper period={period} onChange={setPeriod} />}
              />
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-4">
                  {[[DICTIONARY.STATUS.PRESENT, TREND_COLORS.present], ["Leave", TREND_COLORS.on_leave], [DICTIONARY.STATUS.ABSENT, TREND_COLORS.absent]].map(([label, dot]) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap"><span className="w-2 h-2 rounded-full" style={{ background: dot }} /> {label}</span>
                  ))}
                </div>
                {totalChartPages > 1 && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <button type="button" onClick={() => setChartPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Earlier days"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="text-center select-none w-10 tabular-nums">{safePage + 1}/{totalChartPages}</span>
                    <button type="button" onClick={() => setChartPage(Math.min(totalChartPages - 1, safePage + 1))} disabled={safePage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Later days"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              {/* mt-4: breathing room between the legend row and the top gridline.
                  The plot is absolutely positioned, so it would paint straight over
                  padding on this wrapper — the gap has to be margin. */}
              <div className="relative w-full flex-1 min-h-[16rem] mt-4" onWheel={handleChartWheel}>
                <div className="absolute inset-0">
                    {graph.loading ? (
                      <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
                    ) : graph.error ? (
                      <ErrorState error={graph.error} onRetry={reloadGraph} fallback="Couldn't load team trends." />
                    ) : recorded.length === 0 ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <HiChartBar className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-semibold">No attendance recorded for {monthLabel(period.year, period.month)}</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }} barGap={2} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<DayTick />} interval="preserveStartEnd" />
                          {sundayMarkers(chartData)}
                          <YAxis allowDecimals={false} domain={yAxis.domain} ticks={yAxis.ticks} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 600 }} />
                          <Tooltip cursor={{ fill: "#f8fafc" }} labelFormatter={(val) => fmtDate(val, { weekday: "short", day: "numeric", month: "short" })} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} labelStyle={{ fontWeight: "bold", color: "#1e293b", marginBottom: "4px" }} />
                          <Bar dataKey="final_present_count" name={DICTIONARY.STATUS.PRESENT} fill={TREND_COLORS.present} maxBarSize={8} radius={[3, 3, 0, 0]} />
                          {/* Not expected to work: leave + weekly-off + holiday. The server
                              keeps these out of final_absent_count, so the three bars never
                              double-count a day. */}
                          <Bar dataKey="final_leave_count" name="Leave" fill={TREND_COLORS.on_leave} maxBarSize={8} radius={[3, 3, 0, 0]} />
                          <Bar dataKey="final_absent_count" name={DICTIONARY.STATUS.ABSENT} fill={TREND_COLORS.absent} maxBarSize={8} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <section className={CARD}>
              <CardHeader
                title="Live attendance"
                subtitle={liveAt ? `Live · updated ${fmtTime(liveAt)}` : "Live"}
                action={(
                  <button type="button" onClick={reloadLive} disabled={live.loading} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh live counts">
                    <HiRefresh className={`w-4 h-4 ${live.loading ? "animate-spin" : ""}`} />
                  </button>
                )}
              />
              {live.error ? (
                <ErrorState error={live.error} onRetry={reloadLive} fallback="Couldn't load live counts." />
              ) : (
                <div className={`grid grid-cols-2 gap-3 ${live.loading && !live.data ? "opacity-50" : ""}`}>
                  {stats.map(({ label, value, icon: Icon, tag, help }) => (
                    <div key={label} className="rounded-2xl bg-slate-50/70 border border-slate-100 px-4 py-3.5">
                      {/* Wraps rather than truncates, as on the manager's tiles:
                          "Total org personnel" is cut to an ellipsis otherwise. */}
                      <div className="flex items-start gap-2 text-slate-400">
                        <Icon className="w-4 h-4 text-purple-500 shrink-0" />
                        <span className="text-[11px] font-semibold leading-tight"><HelpLabel text={label} help={help} /></span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <p className="text-2xl font-bold tracking-tight text-slate-800 leading-none tabular-nums">{value}</p>
                        {tag && <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">{tag}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <DepartmentSummaryCard className="flex-1" />
          </div>
        </div>


        <div className="mt-8">
          <AttendanceDirectory />
        </div>
      </main>
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

export default HRDashboard;
