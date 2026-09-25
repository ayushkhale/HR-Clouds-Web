import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { HiCalendar, HiChartBar, HiSparkles, HiCheckCircle, HiChevronLeft, HiChevronRight, HiClock } from "react-icons/hi";
import { useTodayAttendance } from "../../../shared/attendance/useTodayAttendance";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { listFrom, num, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtHours, fmtMinutes, isFutureMonth, monthLabel, shiftMonth, todayYMD, totalWorkedLabel, workedLabel, ymdOnly } from "../../../shared/attendance/dates";
import { humanize } from "../../../shared/attendance/enums";
import { ErrorState, StatusBadge } from "../../../shared/attendance/ui";
import { useSelfServicePath } from "../../../shared/attendance/paths";
import { greetingFor } from "../../../shared/utils/greeting";

const PREVIEW_ROWS = 5;

// Same shell and header as the manager dashboard, so every card lines up.
const CARD = "bg-white rounded-3xl p-6 shadow-xs border border-slate-100";

// Attendance-mix slices. Validated as a set (lightness, colour-blind
// separation): present / half day / on leave / absent, always in this order.
const MIX = [
  { key: "present", label: "Present", field: "present_days", color: "#6D28D9" },
  { key: "half", label: "Half day", field: "half_days", color: "#A78BFA" },
  { key: "leave", label: "On leave", field: "on_leave_days", color: "#C026D3" },
  { key: "absent", label: "Absent", field: "absent_days", color: "#E11D48" },
];
const HOURS_BAR = "#7C3AED";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 10, fontWeight: 600 };
const TOOLTIP_STYLE = { borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 };

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

/** Hover card for the daily-hours bars. */
function HoursTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-800">{fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</p>
      <p className="text-slate-600 mt-0.5"><span className="font-bold text-slate-800">{d.worked || fmtHours(d.hours)}</span> worked · {humanize(d.status)}</p>
    </div>
  );
}

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

  const summary = graph.data?.summary || {};
  const daily = listFrom(graph.data, ["daily", "days"]);
  const recent = [...daily].filter((d) => d.status && d.status !== "not_marked").sort((a, b) => ymdOnly(b.date).localeCompare(ymdOnly(a.date))).slice(0, PREVIEW_ROWS);

  // One bar per day up to today; days with nothing worked sit at zero.
  const todayKey = todayYMD();
  const hoursByDay = daily
    .map((d) => ({ date: ymdOnly(d.date), status: d.status || "not_marked", hours: Math.max(0, parseFloat(d.effective_hours) || 0), worked: workedLabel(d) }))
    .filter((d) => d.date && d.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const hasHours = hoursByDay.some((d) => d.hours > 0);

  const mix = MIX.map((m) => ({ ...m, value: num(summary[m.field]) }));
  const markedDays = mix.reduce((s, m) => s + m.value, 0);
  const headline = [
    { label: "Avg hours / day", value: fmtHours(summary.average_hours_per_day, "0m"), icon: HiClock },
    { label: "On-time arrival", value: `${num(summary.punctuality_percentage)}%`, icon: HiCheckCircle },
    { label: "Total hours", value: totalWorkedLabel(summary), icon: HiChartBar },
  ];

  const nextPeriod = shiftMonth(period.year, period.month, 1);
  const atCurrentMonth = isFutureMonth(nextPeriod.year, nextPeriod.month);
  const monthName = monthLabel(period.year, period.month);

  return (
    <>
      <DashboardTopBar title="Dashboard" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 max-w-2xl space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20">
              <HiSparkles className="w-3 h-3 text-purple-200" /> EMPLOYEE PORTAL
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{greetingFor(user, "there")}</h1>
            <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Clock in, track your working hours and keep your attendance record accurate.</p>
          </div>
          <img
            src="https://d1i7580riw15wg.cloudfront.net/gd-assets/header-images/hero-about-us-3e62e8f762b357820226797094331409508ee0cdbd5b085cc16b9aa9cf712b09.webp"
            alt=""
            className="relative z-10 w-28 sm:w-40 md:w-48 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-4 sm:-mb-6"
          />
        </div>

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

          <section className={`${CARD} flex flex-col`}>
            <CardHeader
              title="My month"
              subtitle="Hours worked each day"
              action={(
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-600">
                  <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded text-slate-400" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
                  <span className="w-24 text-center select-none">{monthName}</span>
                  <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} disabled={atCurrentMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
                </div>
              )}
            />
            {graph.error ? (
              <ErrorState error={graph.error} onRetry={loadGraph} fallback="Couldn't load your monthly stats." />
            ) : (
              <div className={`flex-1 flex flex-col gap-5 ${graph.loading ? "opacity-60" : ""}`} aria-busy={graph.loading}>
                {/* Three headline numbers in one quiet row, divided rather than boxed. */}
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {headline.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="px-3 first:pl-0 last:pr-0 min-w-0">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Icon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span className="text-[11px] font-semibold truncate">{label}</span>
                      </div>
                      <p className="text-xl font-bold tracking-tight text-slate-800 leading-none mt-1.5 tabular-nums truncate">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="relative flex-1 min-h-[12rem]">
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
                        <BarChart data={hoursByDay} margin={{ top: 5, right: 0, left: -24, bottom: 0 }} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => fmtDate(v, { day: "numeric" }, "")} interval="preserveStartEnd" minTickGap={8} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => `${v}h`} />
                          <Tooltip cursor={{ fill: "#f8fafc" }} content={<HoursTooltip />} />
                          <Bar dataKey="hours" name="Hours worked" fill={HOURS_BAR} maxBarSize={12} radius={[4, 4, 0, 0]} />
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
                        <tr key={row.date}>
                          <td className="px-2 py-3 text-slate-600 whitespace-nowrap">{fmtDate(ymdOnly(row.date), { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-2 py-3"><StatusBadge status={row.status} /></td>
                          <td className={`px-2 py-3 ${late > 0 ? "text-fuchsia-600" : "text-slate-400"}`}>{fmtMinutes(late)}</td>
                          <td className={`px-2 py-3 ${overtime > 0 ? "text-purple-600" : "text-slate-400"}`}>{overtime > 0 ? `+${fmtMinutes(overtime)}` : "0m"}</td>
                          <td className="px-2 py-3 text-right text-slate-800 tabular-nums">{workedLabel(row)}</td>
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
    </>
  );
}

export default EmployeeDashboard;
