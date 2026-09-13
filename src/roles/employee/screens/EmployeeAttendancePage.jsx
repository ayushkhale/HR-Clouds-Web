import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiClock, HiCalendar, HiChartBar, HiX, HiArrowRight, HiArrowLeft, HiDocumentSearch, HiSparkles, HiCheckCircle, HiExclamationCircle } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { listFrom, num, unwrap } from "../../../shared/attendance/normalize";
import { addDaysYMD, fmtClock, fmtDate, fmtHours, fmtMinutes, fmtTime, isFutureMonth, monthLabel, monthRange, shiftMonth, todayYMD, ymdOnly } from "../../../shared/attendance/dates";
import { PUNCH_TYPE_LABELS, anomalyStatusKey, anomalyTypeLabel, humanize } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { useSelfServicePath } from "../../../shared/attendance/paths";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

const TREND_OPTIONS = [3, 6, 12];

function CustomBarChart({ data }) {
  if (!data || data.length === 0) return <div className="text-slate-400 text-sm text-center py-8">No trend data available</div>;
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end justify-between h-48 gap-1.5 sm:gap-3 mt-6 px-1 sm:px-4">
      {data.map((item) => {
        const heightPct = Math.max((item.value / maxValue) * 100, 2);
        const displayVal = item.value > 0 ? `${Math.round(item.value)}h` : "0";
        return (
          <div key={item.key} className="h-full flex flex-col items-center flex-1 gap-2 group min-w-0 justify-end">
            <div className="w-full relative flex flex-col items-center justify-end flex-1 rounded-t-2xl transition-colors pb-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 mb-1.5 transition-colors group-hover:text-purple-600">{displayVal}</span>
              <div className="w-full max-w-[40px] bg-gradient-to-t from-purple-500 to-purple-400 rounded-t-xl group-hover:from-purple-600 group-hover:to-purple-500 transition-all duration-300 relative shadow-sm" style={{ height: `${heightPct}%` }}>
                <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1.5 px-3 rounded-lg font-bold whitespace-nowrap z-50 transition-all pointer-events-none shadow-xl shadow-slate-900/10">
                  {item.tooltip}
                </div>
              </div>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase truncate max-w-full">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function trendLabel(t) {
  if (t.month_label || t.label) return t.month_label || t.label;
  const ym = String(t.month || t.period || "").match(/^(\d{4})-(\d{2})/);
  if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1).toLocaleString("en-IN", { month: "short" });
  if (t.month && t.year) return new Date(Number(t.year), Number(t.month) - 1, 1).toLocaleString("en-IN", { month: "short" });
  return String(t.month ?? "");
}

/* ─── Daily log (U16) ────────────────────────────────────────────────────── */
function DailyLogModal({ date, onClose, onRequestCorrection }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(() => {
    setState({ data: null, loading: true, error: null });
    attendanceAPI
      .getDailyLog(date)
      .then((res) => setState({ data: unwrap(res), loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payload = state.data;
  // The response is an object (record, logs, sessions, breaks, anomalies);
  // older payloads returned the punch list directly.
  const logs = Array.isArray(payload) ? payload : payload?.logs || payload?.punches || payload?.attendance_logs || [];
  const breaks = Array.isArray(payload?.breaks) ? payload.breaks : [];
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  const anomalies = Array.isArray(payload?.anomalies) ? payload.anomalies : [];
  const record = payload && !Array.isArray(payload) ? payload.record || payload.attendance_record || (payload.status ? payload : null) : null;
  const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp || a.punch_time || a.created_at) - new Date(b.timestamp || b.punch_time || b.created_at));
  const empty = !record && sortedLogs.length === 0 && breaks.length === 0 && sessions.length === 0 && anomalies.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-label="Daily attendance log">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Daily log · {fmtDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          {state.loading ? (
            <LoadingRows rows={4} />
          ) : state.error ? (
            <ErrorState error={state.error} onRetry={load} fallback="Couldn't load the daily log." />
          ) : empty ? (
            <EmptyState icon={HiDocumentSearch, HiSparkles, HiCheckCircle, HiExclamationCircle} title="Nothing recorded" message="There are no punches or breaks for this date." />
          ) : (
            <>
              {record && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-center justify-between">
                    <StatusBadge status={record.status} />
                    {record.half_day_type && <span className="text-[11px] font-semibold text-slate-500">{humanize(record.half_day_type)}</span>}
                  </div>
                  {[
                    ["Clock in", fmtTime(record.clock_in_time)],
                    ["Clock out", fmtTime(record.clock_out_time)],
                    ["Effective", fmtHours(record.effective_hours)],
                    ["Breaks", fmtMinutes(record.break_duration_minutes, "0m")],
                    ["Late", fmtMinutes(record.late_minutes, "0m")],
                    ["Overtime", fmtMinutes(record.overtime_minutes, "0m")],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                      <p className="text-xs font-bold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {sortedLogs.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Punches</h3>
                  <ol className="relative border-l-2 border-slate-100 ml-2 space-y-3">
                    {sortedLogs.map((entry, idx) => (
                      <li key={entry.id || idx} className="ml-4">
                        <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-purple-200 border-2 border-white" />
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-xs font-bold text-slate-700">{PUNCH_TYPE_LABELS[entry.type || entry.log_type] || humanize(entry.type || entry.log_type) || "Punch"}</span>
                          <span className="text-xs font-semibold text-slate-800 tabular-nums">{fmtTime(entry.timestamp || entry.punch_time || entry.created_at)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {[entry.source && humanize(entry.source), entry.work_mode && humanize(entry.work_mode), entry.device_name && `Device: ${entry.device_name}`, entry.latitude == null && entry.source === "web" ? "No location" : null].filter(Boolean).join(" · ")}
                        </p>
                        {entry.notes && <p className="text-[11px] text-slate-500 mt-0.5">“{entry.notes}”</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {breaks.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Breaks</h3>
                  <ul className="space-y-1.5">
                    {breaks.map((b, i) => (
                      <li key={b.id || i} className="flex justify-between text-xs text-slate-600">
                        <span>{fmtTime(b.start_time)} – {b.end_time ? fmtTime(b.end_time) : "ongoing"}</span>
                        <span className="font-semibold">{b.duration_minutes != null ? fmtMinutes(b.duration_minutes) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {anomalies.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Flags</h3>
                  <ul className="space-y-2">
                    {anomalies.map((a, i) => (
                      <li key={a.id || i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-700 font-semibold">{anomalyTypeLabel(a.type || a.anomaly_type)}</span>
                        <StatusBadge kind="anomaly" status={anomalyStatusKey(a)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
        {onRequestCorrection && date < todayYMD() && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
            <button type="button" onClick={() => onRequestCorrection(date)} className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-xl transition">
              Request a correction
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function EmployeeAttendancePage() {
  const navigate = useNavigate();
  const selfPath = useSelfServicePath();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [summary, setSummary] = useState({ data: null, loading: true, error: null });
  const [weekDate, setWeekDate] = useState(todayYMD());
  const [week, setWeek] = useState({ days: [], loading: true, error: null });
  const [trendMonths, setTrendMonths] = useState(12);
  const [trends, setTrends] = useState({ items: [], loading: true, error: null });
  const [viewLogDate, setViewLogDate] = useState(null);

  const history = usePagedList(
    ({ page, limit }) => attendanceAPI.getHistory({ ...monthRange(period.year, period.month), page, limit }),
    { limit: 20, keys: ["records"], filterKey: `${period.year}-${period.month}` }
  );

  const loadSummary = useCallback(async () => {
    setSummary((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getSummary(period.month, period.year);
      setSummary({ data: unwrap(res), loading: false, error: null });
    } catch (error) {
      setSummary({ data: null, loading: false, error });
    }
  }, [period.month, period.year]);

  const loadWeek = useCallback(async () => {
    setWeek((w) => ({ ...w, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getWeeklyCalendar(weekDate);
      setWeek({ days: listFrom(res, ["days", "calendar", "week"]), loading: false, error: null });
    } catch (error) {
      setWeek({ days: [], loading: false, error });
    }
  }, [weekDate]);

  const loadTrends = useCallback(async () => {
    setTrends((t) => ({ ...t, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getTrends(trendMonths);
      const items = res?.data?.months || res?.months || res?.data?.data?.months || listFrom(res, ["trends", "months"]) || [];
      setTrends({ items, loading: false, error: null });
    } catch (error) {
      setTrends({ items: [], loading: false, error });
    }
  }, [trendMonths]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadWeek(); }, [loadWeek]);
  useEffect(() => { loadTrends(); }, [loadTrends]);

  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION], () => {
    loadSummary();
    loadWeek();
    history.reload();
  });

  const next = shiftMonth(period.year, period.month, 1);
  const nextDisabled = isFutureMonth(next.year, next.month);
  const s = summary.data || {};
  const cards = [
    { label: "Present Days", value: num(s.present_days), icon: HiCheckCircle, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Absent Days", value: num(s.absent_days), icon: HiExclamationCircle, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Late Arrivals", value: num(s.late_days), icon: HiClock, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Hours Worked", value: fmtHours(s.total_hours_worked, "0m"), icon: HiChartBar, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const trendData = [...trends.items].reverse().map((t, i) => {
    let hours = 0;
    
    // First try standard keys
    const timeStr = t.total_hours_worked ?? t.total_effective_hours ?? t.total_hours ?? t.average_hours ?? t.avg_effective_hours;
    if (typeof timeStr === 'string' && timeStr.includes(':')) {
      const parts = timeStr.split(':');
      hours = Number(parts[0] || 0) + (Number(parts[1] || 0) / 60);
    } else {
      hours = parseFloat(timeStr) || 0;
    }

    // If still 0, aggressively look for any HH:MM:SS string in the object
    if (!hours) {
      for (const val of Object.values(t)) {
        if (typeof val === 'string' && /^\d+:\d{2}(:\d{2})?$/.test(val)) {
          const parts = val.split(':');
          hours = Number(parts[0] || 0) + (Number(parts[1] || 0) / 60);
          break;
        }
      }
    }

    return { key: `${trendLabel(t)}-${i}`, label: trendLabel(t), value: hours || 0, tooltip: `${fmtHours(hours || 0, "0m")}${t.on_time_percentage != null ? ` · ${t.on_time_percentage}% on time` : ""}` };
  });

  const requestCorrection = (date) => navigate(`${selfPath("regularizations")}?date=${encodeURIComponent(date)}`);
  const today = todayYMD();

  return (
    <>
      <DashboardTopBar title="My Attendance" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Attendance
            </h1>
            <p className="text-sm text-slate-500 mt-1">Track your daily attendance, hours, and schedule patterns.</p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 p-1.5 shadow-sm">
            <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-2 hover:bg-slate-50 hover:text-slate-800 rounded-xl transition text-slate-400" aria-label="Previous month"><HiArrowLeft className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-slate-800 min-w-[130px] text-center uppercase tracking-wide">{monthLabel(period.year, period.month)}</span>
            <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, 1))} disabled={nextDisabled} className="p-2 hover:bg-slate-50 hover:text-slate-800 rounded-xl transition text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Next month"><HiArrowRight className="w-4 h-4" /></button>
          </div>
        </div>

        {summary.error ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-6"><ErrorState error={summary.error} onRetry={loadSummary} fallback="Couldn't load your monthly summary." /></div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-5 ${summary.loading ? "opacity-60" : ""}`} aria-busy={summary.loading}>
            {cards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-purple-200 transition-all group">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${bg} ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none block">{value}</span>
                  <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 mt-2 uppercase tracking-wider">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-6 min-w-0">
          {/* Trends (U18) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center"><HiChartBar className="w-4 h-4" /></span>
                Hours Trend
              </h3>
              <select value={trendMonths} onChange={(e) => setTrendMonths(Number(e.target.value))} className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none hover:bg-slate-100 transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100" aria-label="Trend period">
                {TREND_OPTIONS.map((m) => <option key={m} value={m}>Last {m} months</option>)}
              </select>
            </div>
            
            {trends.loading ? <LoadingRows rows={3} /> : trends.error ? <ErrorState error={trends.error} onRetry={loadTrends} fallback="Couldn't load trends." /> : <CustomBarChart data={trendData} />}
          </div>

          {/* History (U11) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 sm:px-8 py-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center"><HiClock className="w-4 h-4" /></span>
                History · {monthLabel(period.year, period.month)}
              </h3>
            </div>
            {history.error ? (
              <ErrorState error={history.error} onRetry={history.reload} fallback="Couldn't load your attendance history." />
            ) : (
              <>
                <div className="overflow-x-auto p-4 sm:p-6 pt-2">
                  <table className="w-full text-left border-separate border-spacing-y-2 min-w-[760px]">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        <th className="px-4 py-3 rounded-l-xl">Date</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">In</th>
                        <th className="px-4 py-2">Out</th>
                        <th className="px-4 py-2">Effective</th>
                        <th className="px-4 py-2">Late</th>
                        <th className="px-4 py-2">Left early</th>
                        <th className="px-4 py-2">Overtime</th>
                        <th className="px-4 py-2 rounded-r-xl"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-semibold text-slate-700">
                      {history.loading && history.items.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-2"><LoadingRows rows={4} /></td></tr>
                      ) : history.items.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs">No attendance records for {monthLabel(period.year, period.month)}.</td></tr>
                      ) : (
                        history.items.map((record) => {
                          const ymd = ymdOnly(record.date);
                          return (
                            <tr key={record.id || ymd} className={`hover:bg-slate-50/70 transition-colors ${history.loading ? "opacity-60" : ""}`}>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(ymd, { weekday: "short", day: "numeric", month: "short" })}</td>
                              <td className="px-4 py-3">
                                <StatusBadge status={record.status} />
                                {record.is_regularized && <span className="block mt-1 text-[9px] font-bold text-purple-500 uppercase tracking-wide">Corrected</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_in_time)}</td>
                              <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_out_time)}</td>
                              <td className="px-4 py-3 text-slate-800 font-bold">{fmtHours(record.effective_hours)}</td>
                              <td className="px-4 py-3 text-slate-500">{Number(record.late_minutes) > 0 ? fmtMinutes(record.late_minutes) : "0m"}</td>
                              <td className="px-4 py-3 text-slate-500">{Number(record.early_exit_minutes) > 0 ? fmtMinutes(record.early_exit_minutes) : "0m"}</td>
                              <td className="px-4 py-3 text-purple-600">{Number(record.overtime_minutes) > 0 ? fmtMinutes(record.overtime_minutes) : "0m"}</td>
                              <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                                <button type="button" onClick={() => setViewLogDate(ymd)} className="text-[10px] font-bold uppercase text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg transition">Log</button>
                                {ymd && ymd < today && (
                                  <button type="button" onClick={() => requestCorrection(ymd)} className="text-[10px] font-bold uppercase text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition">Correct</button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 pb-5">
                  <Pagination page={history.page} totalPages={history.totalPages} total={history.total} limit={history.limit} onPageChange={history.setPage} disabled={history.loading} />
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {viewLogDate && <DailyLogModal date={viewLogDate} onClose={() => setViewLogDate(null)} onRequestCorrection={(d) => { setViewLogDate(null); requestCorrection(d); }} />}
    </>
  );
}
