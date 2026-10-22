import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartPageCount, chartPageRows, defaultChartPage, fillMonthDays, sundayMarkers, TrendBar, TREND_BAR_MAX_SIZE, trendYAxis } from "../../../shared/attendance/trendChartMeta";
import { TREND_COLORS, TREND_STROKES } from "../../../shared/attendance/dayStatus";
import MonthStepper from "../../../shared/attendance/MonthStepper";
import { DayTick } from "../../../shared/attendance/SundayLabel";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import CardHeader, { CARD } from "../../../shared/components/DashboardCard";
import PageHeader from "../../../shared/components/PageHeader";
import AttendanceCard from "../components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { HiCalendar, HiChartBar, HiSparkles, HiCheckCircle, HiChevronLeft, HiChevronRight, HiClock } from "react-icons/hi";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import LiveEffectiveHours from "../../../shared/attendance/LiveEffectiveHours";
import { computeWorkedMs } from "../../../shared/attendance/liveHours";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { listFrom, num, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtHours, fmtMinutes, monthLabel, todayYMD, totalWorkedLabel, workedLabel, ymdOnly } from "../../../shared/attendance/dates";
import { humanize } from "../../../shared/attendance/enums";
import { ErrorState, StatusBadge } from "../../../shared/attendance/ui";
import { useSelfServicePath } from "../../../shared/attendance/paths";
import { greetingFor } from "../../../shared/utils/greeting";
import { rowPreviewProps } from "../../../shared/components/DetailDialog";
import { DailyLogModal } from "./EmployeeAttendancePage";
import FieldHelp from "../../../shared/fieldHelp/FieldHelp";

const PREVIEW_ROWS = 5;

// Attendance-mix slices. Validated as a set (lightness, colour-blind
// separation): present / half day / on leave / absent, always in this order.
const MIX = [
  { key: "present", label: "Present", field: "present_days", color: "#6D28D9" },
  { key: "half", label: "Half day", field: "half_days", color: "#A78BFA" },
  { key: "leave", label: "On leave", field: "on_leave_days", color: "#C026D3" },
  { key: "absent", label: "Absent", field: "absent_days", color: "#E11D48" },
];
// The hours bar is drawn by the shared TrendBar, so its colour comes out of
// the one palette (dayStatus.TREND_COLORS). The legend chip and the tooltip dot
// read the same two values, so neither can disagree with the bar beside it.
const HOURS_SERIES = "present";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 10, fontWeight: 600 };
const TOOLTIP_STYLE = { borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 };

/**
 * Hover card for the daily-hours bars — the same horizontal white chip as the
 * HR and manager trend tooltips (TrendTooltip), down to the purple-100 hairline
 * and the divider after the date, so a hover bubble on any attendance chart in
 * the product is recognisably the same object (§2). It can't just reuse
 * TrendTooltip: that one reads the three team counts off the row, and this one
 * has a single value plus a reason the day is blank.
 */
function HoursTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="pointer-events-none select-none z-50 animate-in fade-in duration-150">
      <div className="flex items-center gap-3 px-3.5 py-2 bg-white rounded-xl shadow-lg border border-purple-100 text-xs font-semibold whitespace-nowrap">
        <span className="font-bold text-slate-900 border-r border-purple-100 pr-2.5">
          {fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}
        </span>
        {d.note ? (
          <span className="text-slate-500">{d.note}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border" style={{ backgroundColor: TREND_COLORS[HOURS_SERIES], borderColor: TREND_STROKES[HOURS_SERIES] }} />
            <span className="font-bold text-slate-900 tabular-nums">{d.worked || fmtHours(d.hours)}</span>
            <span className="text-slate-500">{humanize(d.status)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Same entry as the Effective column on My Attendance — one concept, one hint.

/* ─── Employee Dashboard ──────────────────────────────────────────── */
// Row 1: my punch card beside my month (three headline numbers over a
// daily-hours chart). Row 2: recent days beside the attendance-mix donut.
function EmployeeDashboard() {
  const { user } = useAuth();
  const selfPath = useSelfServicePath();
  const { today, shift, loading: todayLoading, error: todayError, refresh } = useTodayAttendance();

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [graph, setGraph] = useState({ data: null, loading: true, error: null });
  const [logDate, setLogDate] = useState(null);
  // null = "open on the half that holds today"; set once the person pages.
  const [chartPage, setChartPage] = useState(null);

  const loadGraph = useCallback(async () => {
    setGraph((g) => ({ ...g, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getGraphData(period.month, period.year);
      setGraph({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setGraph({ data: null, loading: false, error });
    }
  }, [period.month, period.year]);

  useEffect(() => { loadGraph(); setChartPage(null); }, [loadGraph]);
  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION], loadGraph);

  const summary = graph.data?.summary || {};
  // Graph data (U-graph) fills every day without a record as "absent" — the
  // days before this person joined included — so someone who joined on the
  // 12th opened their dashboard to 11 absences My Attendance didn't show
  // (backend ask R-7). Until the server stops, those days are set aside here
  // using the joining date `/organizations/me` already gives us.
  const joinedOn = ymdOnly(user?.joining_date) || "";
  const beforeJoining = (ymd) => !!joinedOn && !!ymd && ymd < joinedOn;
  const daily = listFrom(graph.data, ["daily", "days"]);
  const recent = [...daily].filter((d) => d.status && d.status !== "not_marked" && !beforeJoining(ymdOnly(d.date))).sort((a, b) => ymdOnly(b.date).localeCompare(ymdOnly(a.date))).slice(0, PREVIEW_ROWS);

  // One bar per day of the month, paged in the same halves as the HR and
  // manager charts; days with nothing worked sit at zero.
  const todayKey = todayYMD();
  // `/graph-data` states each day as it was last calculated, and a day still
  // open has no `effective_hours` yet — so today's bar sat at zero and its row
  // read "0m" while the punch card on this very screen counted up, two
  // different answers for the same day on one page (2026-10-22). The live
  // `/today` record is already here, so today's figure comes from it, with
  // breaks deducted exactly as `computeWorkedMs` does everywhere else.
  const liveToday = today?.clock_in_time && !today?.clock_out_time ? today : null;
  const liveTodayMs = liveToday
    ? computeWorkedMs({
      clockIn: liveToday.clock_in_time,
      breaks: liveToday.breaks,
      activeBreak: liveToday.active_break,
      breakMinutes: liveToday.break_duration_minutes,
    }).workedMs
    : null;
  const hoursByDay = daily
    .map((d) => {
      const date = ymdOnly(d.date);
      const note = beforeJoining(date) ? "Before you joined" : date > todayKey ? "Still to come" : null;
      const live = date === todayKey ? liveTodayMs : null;
      return {
        date,
        status: d.status || "not_marked",
        hours: note ? 0 : live != null ? live / 3600000 : Math.max(0, parseFloat(d.effective_hours) || 0),
        worked: live != null ? fmtMinutes(Math.floor(live / 60000), "0m") : workedLabel(d),
        note,
      };
    })
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  // A slot for every day of the month, like the team charts, so a half never
  // shrinks to the few days the server happened to return.
  const hoursByDayFull = fillMonthDays(hoursByDay, period, (date) => ({
    date, status: "not_marked", hours: 0, worked: "0m",
    note: beforeJoining(date) ? "Before you joined" : date > todayKey ? "Still to come" : null,
  }));
  const hasHours = hoursByDay.some((d) => d.hours > 0);
  const totalChartPages = chartPageCount(hoursByDayFull);
  const safeChartPage = Math.min(chartPage ?? defaultChartPage(hoursByDayFull, period), totalChartPages - 1);
  const chartData = chartPageRows(hoursByDayFull, safeChartPage);
  // Headroom above the tallest bar, the same way the team charts get it, so a
  // long day doesn't draw flush with the top gridline. Hours are fractional
  // where head-counts aren't, so the ticks land on whole hours and the roof
  // sits above the top one.
  const yAxis = trendYAxis(chartData, ["hours"]);

  const absentBeforeJoining = daily.filter((d) => beforeJoining(ymdOnly(d.date)) && d.status === "absent").length;
  const mix = MIX.map((m) => ({ ...m, value: m.key === "absent" ? Math.max(0, num(summary[m.field]) - absentBeforeJoining) : num(summary[m.field]) }));
  const markedDays = mix.reduce((s, m) => s + m.value, 0);
  const headline = [
    { label: "Avg hours / day", value: fmtHours(summary.average_hours_per_day, "0m"), icon: HiClock },
    { label: "On-time arrival", value: `${num(summary.punctuality_percentage)}%`, icon: HiCheckCircle, help: { surface: "attendance.summary", field: "punctuality_percentage", label: "on-time arrival" } },
    { label: "Total hours", value: totalWorkedLabel(summary), icon: HiChartBar },
  ];

  const monthName = monthLabel(period.year, period.month);

  return (
    <>
      <DashboardTopBar title="Dashboard" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {/* The art here is a wide 16:9 scene, not a cut-out character: it
            letterboxes inside the banner's art box, so the default
            bleed-off-the-bottom treatment cropped its lower edge and left dead
            space above it. Centred instead, at the same banner height. */}
        <PageHeader
          badgeText="EMPLOYEE PORTAL"
          badgeIcon={HiSparkles}
          title={greetingFor(user, "there")}
          subtitle="Clock in, track your working hours and keep your attendance record accurate."
          image="https://d1i7580riw15wg.cloudfront.net/gd-assets/header-images/hero-about-us-3e62e8f762b357820226797094331409508ee0cdbd5b085cc16b9aa9cf712b09.webp"
          imageAlign="center"
        />

        {/* Row 1: my punch card beside my month. The punch card is as tall as
            its content — stretching it to the chart's height only padded it out
            with empty space. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className={`${CARD} flex flex-col`}>
            <CardHeader
              icon={HiCalendar}
              divider
              title="My attendance"
              subtitle="Clock in, take breaks and clock out"
              action={<Link to={selfPath("history")} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">My history <HiChevronRight className="w-3.5 h-3.5" /></Link>}
            />
            <AttendanceCard className="flex flex-col" currentState={today} fetchStatus={refresh} shiftData={shift} loading={todayLoading} error={todayError} />
          </section>

          {/* The HR and manager trends card, to the pixel: same shell and header,
              same month stepper, same legend-and-pager row, same plot height,
              margins, bar shape and axis headroom. The only differences are the
              ones the DATA forces — one series instead of three, and an axis in
              hours rather than people. An employee promoted to manager must find
              the chart they already know (§2), so change these together. */}
          <section className={`${CARD} flex flex-col`}>
            <CardHeader
              title="My month"
              subtitle="Hours worked each day"
              action={<MonthStepper period={period} onChange={setPeriod} />}
            />
            {graph.error ? (
              <ErrorState error={graph.error} onRetry={loadGraph} fallback="Couldn't load your monthly stats." />
            ) : (
              <div className={`flex-1 flex flex-col gap-5 ${graph.loading ? "opacity-60" : ""}`} aria-busy={graph.loading}>
                {/* Three headline numbers in one quiet row, divided rather than boxed. */}
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {headline.map(({ label, value, icon: Icon, help }) => (
                    <div key={label} className="px-3 first:pl-0 last:pr-0 min-w-0">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Icon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span className="text-[11px] font-semibold truncate">{label}</span>
                        {/* Beside the truncating label, not inside it, so an ellipsis can never swallow the ⓘ.
                            Hidden below sm: on a phone the label is already cut to "On-time a…" and
                            the ⓘ would cut it to "On…". */}
                        {help && <FieldHelp {...help} className="-ml-1 hidden sm:inline-flex" />}
                      </div>
                      <p className="text-xl font-bold tracking-tight text-slate-800 leading-none mt-1.5 tabular-nums truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {/* The legend chip and the pager share one row, exactly where the
                    team charts put them. The row renders whatever the data says, so
                    the plot never shifts up in a month with no hours on record. */}
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full border" style={{ backgroundColor: TREND_COLORS[HOURS_SERIES], borderColor: TREND_STROKES[HOURS_SERIES] }} />
                    Hours worked
                  </span>
                  {totalChartPages > 1 && (
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                      <button type="button" onClick={() => setChartPage(Math.max(0, safeChartPage - 1))} disabled={safeChartPage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Earlier days"><HiChevronLeft className="w-4 h-4" /></button>
                      <span className="text-center select-none w-10 tabular-nums">{safeChartPage + 1}/{totalChartPages}</span>
                      <button type="button" onClick={() => setChartPage(Math.min(totalChartPages - 1, safeChartPage + 1))} disabled={safeChartPage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400" aria-label="Later days"><HiChevronRight className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                {/* mt-4 rather than padding: the plot is absolutely positioned, so
                    padding on this wrapper would be painted straight over. */}
                <div className="relative w-full flex-1 min-h-[16rem] mt-4">
                  <div className="absolute inset-0">
                    {graph.loading && hoursByDay.length === 0 ? (
                      <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
                    ) : !hasHours ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <HiChartBar className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-semibold">No hours recorded for {monthName}</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }} barGap={0} barCategoryGap="14%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={<DayTick />} interval={0} />
                          {/* Same Sunday marking and 15-day halves as the HR and manager charts. */}
                          {sundayMarkers(chartData)}
                          {/* Ticks are whole hours; the domain ends above the top
                              tick, which is where the headroom comes from. */}
                          <YAxis allowDecimals={false} domain={yAxis.domain} ticks={yAxis.ticks} axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => `${v}h`} />
                          <Tooltip cursor={{ fill: "#f8fafc" }} content={<HoursTooltip />} position={{ y: -10 }} />
                          {/* The shared bar shape: flat bottom, softened cap, outlined
                              in its own darker step — and nothing at all on a day with
                              no hours, rather than a 3px nub along the axis. */}
                          <Bar dataKey="hours" name="Hours worked" shape={TrendBar} maxBarSize={TREND_BAR_MAX_SIZE} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Row 2: recent days beside the month's attendance mix. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <section className={`${CARD} flex flex-col min-w-0`}>
            <CardHeader
              title="Recent days"
              subtitle={monthName}
              action={<Link to={selfPath("history")} className="text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">Show all</Link>}
            />
            {graph.loading && recent.length === 0 ? (
              <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : recent.length === 0 ? (
              <p className="flex-1 flex items-center justify-center text-sm text-slate-400 py-8">No attendance recorded for {monthName}.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left text-sm min-w-[440px]">
                  <thead className="text-slate-400 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="px-2 py-2.5 text-[11px] uppercase tracking-wide">Date</th>
                      <th className="px-2 py-2.5 text-[11px] uppercase tracking-wide">Status</th>
                      <th className="px-2 py-2.5 text-[11px] uppercase tracking-wide">Late</th>
                      <th className="px-2 py-2.5 text-[11px] uppercase tracking-wide">Overtime</th>
                      <th className="px-2 py-2.5 text-[11px] uppercase tracking-wide text-right">Effective</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-semibold text-slate-700">
                    {recent.map((row) => {
                      const late = num(row.late_minutes);
                      const overtime = num(row.overtime_minutes);
                      return (
                        // Same record as a row on My Attendance: the day opens its log.
                        <tr key={row.date} {...rowPreviewProps(() => setLogDate(ymdOnly(row.date)), "Daily log")}>
                          <td className="px-2 py-3 text-slate-600 whitespace-nowrap">{fmtDate(ymdOnly(row.date), { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-2 py-3"><StatusBadge status={row.status} /></td>
                          <td className={`px-2 py-3 ${late > 0 ? "text-fuchsia-600" : "text-slate-400"}`}>{fmtMinutes(late)}</td>
                          <td className={`px-2 py-3 ${overtime > 0 ? "text-purple-600" : "text-slate-400"}`}>{overtime > 0 ? `+${fmtMinutes(overtime)}` : "0m"}</td>
                          {/* Today is still being worked, so its figure comes
                              from the live record, not from the month's
                              snapshot — the same number the punch card above
                              shows. */}
                          <td className="px-2 py-3 text-right text-slate-800 tabular-nums">
                            {ymdOnly(row.date) === todayKey && liveToday ? <LiveEffectiveHours record={liveToday} /> : workedLabel(row)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${CARD} flex flex-col min-w-0`}>
            <CardHeader
              title="Attendance mix"
              subtitle={`How your ${markedDays} ${markedDays === 1 ? "day" : "days"} in ${monthName} went`}
              action={<Link to={selfPath("history")} className="text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">View details</Link>}
            />
            {graph.error ? (
              <ErrorState error={graph.error} onRetry={loadGraph} fallback="Couldn't load your attendance mix." />
            ) : markedDays === 0 ? (
              <p className="flex-1 flex items-center justify-center text-sm text-slate-400 py-8">{graph.loading ? "Loading…" : `No attendance recorded for ${monthName}.`}</p>
            ) : (
              <div className={`flex-1 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 ${graph.loading ? "opacity-60" : ""}`}>
                <div className="relative w-44 h-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={mix.filter((m) => m.value > 0)} dataKey="value" nameKey="label" innerRadius="72%" outerRadius="100%" paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                        {mix.filter((m) => m.value > 0).map((m) => <Cell key={m.key} fill={m.color} />)}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} ${value === 1 ? "day" : "days"}`, name]} contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{mix[0].value}</span>
                    <span className="text-[11px] font-semibold text-slate-400 mt-1">of {markedDays} present</span>
                  </div>
                </div>

                <ul className="flex-1 w-full space-y-2.5">
                  {mix.map((m) => (
                    <li key={m.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-semibold text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                        {m.label}
                      </span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {m.value}
                        <span className="text-[11px] font-semibold text-slate-400 ml-1.5">{Math.round((m.value / markedDays) * 100)}%</span>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 text-sm pt-2.5 border-t border-slate-100">
                    <span className="font-semibold text-slate-600">Late arrivals</span>
                    <span className="font-bold text-slate-800 tabular-nums">{num(summary.late_days)}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-600">Overtime</span>
                    <span className="font-bold text-slate-800 tabular-nums">{fmtMinutes(summary.total_overtime_minutes, "0m")}</span>
                  </li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </main>
      {logDate && <DailyLogModal date={logDate} onClose={() => setLogDate(null)} />}
    </>
  );
}

export default EmployeeDashboard;
