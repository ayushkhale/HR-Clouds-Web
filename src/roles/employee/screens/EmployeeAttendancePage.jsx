import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiClock, HiChartBar, HiArrowRight, HiArrowLeft, HiDocumentSearch, HiCheckCircle, HiExclamationCircle, HiPencil, HiFingerPrint, HiPause, HiFlag } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { num, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, monthRange, shiftMonth, todayYMD, totalWorkedLabel, workedLabel, ymdOnly } from "../../../shared/attendance/dates";
import { PUNCH_TYPE_LABELS, anomalyStatusKey, anomalyTypeLabel, humanize } from "../../../shared/attendance/enums";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../shared/attendance/events";
import { useSelfServicePath } from "../../../shared/attendance/paths";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, rowPreviewProps } from "../../../shared/components/DetailDialog";

const minutesOrZero = (v) => (Number(v) > 0 ? fmtMinutes(v) : "0m");

/* ─── Daily log (U16) ────────────────────────────────────────────────────── */
// Built on the shared record-inspector, so one day's attendance reads the same
// here as every other record preview in the app.
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

  // "Web · Office · Device: Gate 2" — whatever of it the punch actually carries.
  const punchOrigin = (entry) => [
    entry.source && humanize(entry.source),
    entry.work_mode && humanize(entry.work_mode),
    entry.device_name && `Device: ${entry.device_name}`,
    entry.latitude == null && entry.source === "web" ? "No location" : null,
  ].filter(Boolean).join(" · ");

  return (
    <DetailDialog
      eyebrow="Daily log"
      icon={HiClock}
      title={fmtDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      subtitle={record ? workedLabel(record) : undefined}
      badge={record?.status ? <StatusBadge status={record.status} /> : undefined}
      loading={state.loading}
      onClose={onClose}
      footer={onRequestCorrection && date < todayYMD() && (
        <button
          type="button"
          onClick={() => onRequestCorrection(date)}
          className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 flex items-center gap-2"
        >
          <HiPencil className="w-4 h-4" /> Request a correction
        </button>
      )}
    >
      {state.error ? (
        <ErrorState error={state.error} onRetry={load} fallback="Couldn’t load the daily log." />
      ) : empty && !state.loading ? (
        <EmptyState icon={HiDocumentSearch} title="Nothing recorded" message="There are no punches or breaks for this date." />
      ) : !state.loading && (
        <>
          {record && (
            <>
              <DetailStats
                items={[
                  { label: "Clocked in", value: fmtTime(record.clock_in_time), icon: HiClock },
                  { label: "Clocked out", value: fmtTime(record.clock_out_time), icon: HiClock },
                  { label: "Time worked", value: workedLabel(record), hint: "breaks taken out", icon: HiCheckCircle },
                  { label: "On a break", value: minutesOrZero(record.break_duration_minutes), icon: HiPause },
                ]}
              />

              <DetailSection title="How the day added up" icon={HiChartBar}>
                <DetailGrid
                  items={[
                    ["Late by", minutesOrZero(record.late_minutes)],
                    ["Extra hours", minutesOrZero(record.overtime_minutes)],
                    ["Total on the clock", totalWorkedLabel(record)],
                    ["Half day", record.half_day_type ? humanize(record.half_day_type) : "No"],
                  ]}
                />
              </DetailSection>
            </>
          )}

          {sortedLogs.length > 0 && (
            <DetailSection title={`Punches (${sortedLogs.length})`} icon={HiFingerPrint}>
              <DetailTable
                rows={sortedLogs}
                rowKey={(entry, i) => entry.id || i}
                empty="No punches were recorded."
                columns={[
                  {
                    header: "Punch",
                    render: (entry) => (
                      <span className="font-semibold text-slate-700">
                        {PUNCH_TYPE_LABELS[entry.type || entry.log_type] || humanize(entry.type || entry.log_type) || "Punch"}
                      </span>
                    ),
                  },
                  { header: "Time", render: (entry) => <span className="tabular-nums">{fmtTime(entry.timestamp || entry.punch_time || entry.created_at)}</span> },
                  { header: "Where it came from", render: (entry) => punchOrigin(entry) },
                  { header: "Note", render: (entry) => entry.notes },
                ]}
              />
            </DetailSection>
          )}

          {breaks.length > 0 && (
            <DetailSection title={`Breaks (${breaks.length})`} icon={HiPause} defaultOpen={false}>
              <DetailTable
                rows={breaks}
                rowKey={(b, i) => b.id || i}
                empty="No breaks were recorded."
                columns={[
                  { header: "Started", render: (b) => <span className="tabular-nums">{fmtTime(b.start_time)}</span> },
                  { header: "Ended", render: (b) => (b.end_time ? <span className="tabular-nums">{fmtTime(b.end_time)}</span> : <DetailPill tone="soft">Still going</DetailPill>) },
                  { header: "How long", align: "right", render: (b) => <span className="font-semibold tabular-nums">{minutesOrZero(b.duration_minutes)}</span> },
                ]}
              />
            </DetailSection>
          )}

          {anomalies.length > 0 && (
            <DetailSection title={`Things to look at (${anomalies.length})`} icon={HiFlag}>
              <DetailTable
                rows={anomalies}
                rowKey={(a, i) => a.id || i}
                empty="Nothing was flagged on this day."
                columns={[
                  { header: "What was flagged", render: (a) => <span className="font-semibold text-slate-700">{anomalyTypeLabel(a.type || a.anomaly_type)}</span> },
                  { header: "Status", align: "center", render: (a) => <StatusBadge kind="anomaly" status={anomalyStatusKey(a)} /> },
                ]}
              />
            </DetailSection>
          )}
        </>
      )}
    </DetailDialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function EmployeeAttendancePage() {
  const navigate = useNavigate();
  const selfPath = useSelfServicePath();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [summary, setSummary] = useState({ data: null, loading: true, error: null });
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

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useAttendanceChanged([ATTENDANCE_EVENTS.PUNCH, ATTENDANCE_EVENTS.REGULARIZATION], () => {
    loadSummary();
    history.reload();
  });

  const next = shiftMonth(period.year, period.month, 1);
  const nextDisabled = isFutureMonth(next.year, next.month);
  // Summary may arrive flat or nested under `summary`.
  const s = summary.data?.summary ?? summary.data ?? {};
  const cards = [
    { label: "Present Days", value: num(s.present_days), icon: HiCheckCircle, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Absent Days", value: num(s.absent_days), icon: HiExclamationCircle, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Late Arrivals", value: num(s.late_days), icon: HiClock, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Hours Worked", value: totalWorkedLabel(s), icon: HiChartBar, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const requestCorrection = (date) => navigate(`${selfPath("regularizations")}?date=${encodeURIComponent(date)}`);
  const today = todayYMD();

  return (
    <>
      <DashboardTopBar title="My Attendance" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Attendance</h1>
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
                      <th className="px-4 py-2 rounded-r-xl text-right">Actions</th>
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
                        const preview = rowPreviewProps(() => setViewLogDate(ymd), "Daily log");
                        return (
                          <tr
                            key={record.id || ymd}
                            {...preview}
                            className={`${preview.className} ${history.loading ? "opacity-60" : ""}`}
                          >
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(ymd, { weekday: "short", day: "numeric", month: "short" })}{record.is_regularized && <span title="Corrected through a regularization request" className="ml-1.5 inline-flex items-center justify-center w-4 h-4 align-middle rounded-full bg-purple-100 text-purple-600"><HiPencil className="w-2.5 h-2.5" aria-hidden="true" /><span className="sr-only">Corrected</span></span>}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={record.status} />
                            </td>
                            <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_in_time)}</td>
                            <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_out_time)}</td>
                            <td className="px-4 py-3 text-slate-800 font-bold">{workedLabel(record)}</td>
                            <td className="px-4 py-3 text-slate-500">{minutesOrZero(record.late_minutes)}</td>
                            <td className="px-4 py-3 text-slate-500">{minutesOrZero(record.early_exit_minutes)}</td>
                            <td className="px-4 py-3 text-purple-600">{minutesOrZero(record.overtime_minutes)}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
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
      </main>

      {viewLogDate && <DailyLogModal date={viewLogDate} onClose={() => setViewLogDate(null)} onRequestCorrection={(d) => { setViewLogDate(null); requestCorrection(d); }} />}
    </>
  );
}
