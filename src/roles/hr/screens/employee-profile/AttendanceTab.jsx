import React, { useCallback, useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight, HiX, HiClock, HiExclamationCircle, HiCheckCircle, HiArrowRight } from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { unwrap } from "../../../../shared/attendance/normalize";
import { anomalyStatusKey, anomalyTypeLabel, humanize } from "../../../../shared/attendance/enums";
import { fmtClock, fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, ymdOnly } from "../../../../shared/attendance/dates";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../../shared/attendance/ui";

/* ─── Daily log drilldown ─────────────────────────────────────── */
function DailyLogModal({ userId, date, employeeRole, onClose }) {
  const [state, setState] = useState({ log: null, loading: true, error: null });

  const load = useCallback(() => {
    if (!userId || !date) return;
    setState({ log: null, loading: true, error: null });
    memberAttendanceApi(employeeRole)
      .dailyLog(userId, date)
      .then((res) => setState({ log: unwrap(res) || null, loading: false, error: null }))
      .catch((error) => setState({ log: null, loading: false, error }));
  }, [userId, date, employeeRole]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { log, loading, error } = state;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-0.5">Daily log</p>
            <h2 className="text-base font-bold text-slate-800">{fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading ? (
            <LoadingRows rows={5} />
          ) : error ? (
            <ErrorState error={error} onRetry={load} fallback="Couldn't load the daily log." />
          ) : !log ? (
            <EmptyState title="No data" message="Nothing was recorded for this day." />
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={log.status} />
                  {log.is_regularized && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Regularized</span>}
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="text-slate-400 text-xs font-medium">IN</span>
                  <span>{fmtTime(log.clock_in_time)}</span>
                  <HiArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-400 text-xs font-medium">OUT</span>
                  <span>{fmtTime(log.clock_out_time)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Effective", value: <LiveEffectiveHours effectiveHours={log.effective_hours} clockInTime={log.clock_in_time} clockOutTime={log.clock_out_time} breaks={log.breaks} className="text-slate-800 text-sm" /> },
                  { label: "Breaks", value: fmtMinutes(log.break_duration_minutes, "0m") },
                  { label: "Late", value: Number(log.late_minutes) > 0 ? fmtMinutes(log.late_minutes) : "On time", warn: Number(log.late_minutes) > 0 },
                  { label: "Overtime", value: Number(log.overtime_minutes) > 0 ? fmtMinutes(log.overtime_minutes) : "—" },
                  { label: "Left early", value: Number(log.early_exit_minutes) > 0 ? fmtMinutes(log.early_exit_minutes) : "—" },
                  { label: "Work mode", value: log.work_mode ? humanize(log.work_mode) : "—" },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-sm font-bold ${warn ? "text-amber-600" : "text-slate-800"}`}>{value}</p>
                  </div>
                ))}
              </div>

              {log.shift && (
                <div className="border border-slate-100 rounded-xl p-4 bg-white flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Applied shift</p>
                    <p className="text-sm font-semibold text-slate-700">{log.shift.name}</p>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {fmtClock(log.shift.start_time)} → {fmtClock(log.shift.end_time)}
                    {(log.shift.type || log.shift.shift_type) && <span className="ml-2 text-[10px] text-slate-400">({humanize(log.shift.type || log.shift.shift_type)})</span>}
                  </span>
                </div>
              )}

              {log.sessions?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Sessions</p>
                  <div className="space-y-2">
                    {log.sessions.map((s, i) => (
                      <div key={s.id || i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "open" ? "bg-green-400 animate-pulse" : "bg-purple-400"}`} />
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 flex-1">
                          <HiClock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{fmtTime(s.opened_at || s.start_time)}</span>
                          <HiArrowRight className="w-3.5 h-3.5 text-slate-300" />
                          <span>{s.closed_at || s.end_time ? fmtTime(s.closed_at || s.end_time) : <span className="text-green-600 text-xs">Active</span>}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{humanize(s.status)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {log.breaks?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Breaks <span className="text-slate-400 font-normal normal-case ml-1">({log.breaks.length})</span></p>
                  <div className="space-y-2">
                    {log.breaks.map((b, i) => (
                      <div key={b.id || i} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 flex-1">
                          <span>{fmtTime(b.start_time)}</span>
                          <HiArrowRight className="w-3.5 h-3.5 text-amber-300" />
                          <span>{b.end_time ? fmtTime(b.end_time) : "ongoing"}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-600">{b.duration_minutes != null ? fmtMinutes(b.duration_minutes) : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {log.anomalies?.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><HiExclamationCircle className="w-3.5 h-3.5" /> Flags</p>
                  <div className="space-y-2">
                    {log.anomalies.map((a, i) => (
                      <div key={a.id || i} className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-rose-700">{anomalyTypeLabel(a.type)}</p>
                          <div className="flex gap-1.5 shrink-0">
                            {a.severity && <StatusBadge kind="severity" status={a.severity} />}
                            <StatusBadge kind="anomaly" status={anomalyStatusKey(a)} />
                          </div>
                        </div>
                        {a.description && <p className="text-xs text-rose-500 mt-0.5">{a.description}</p>}
                        {a.resolution_notes && <p className="text-[11px] text-slate-500 mt-1">Resolution: {a.resolution_notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : log.clock_in_time && (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <HiCheckCircle className="w-4 h-4" /> No flags for this day.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main tab ────────────────────────────────────────────────── */
export default function AttendanceTab({ userId, employeeRole }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedDate, setSelectedDate] = useState(null);
  const api = memberAttendanceApi(employeeRole);

  // HR detail endpoints are consumed with month/year (audit C15).
  const list = usePagedList(
    ({ page, limit }) => api.history(userId, { month: period.month, year: period.year, page, limit }),
    { limit: 20, keys: ["records"], filterKey: `${userId}-${api.population}-${period.year}-${period.month}`, enabled: !!userId }
  );

  const next = shiftMonth(period.year, period.month, 1);
  const label = monthLabel(period.year, period.month);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Attendance history</h2>
          <p className="text-xs text-slate-400 mt-0.5">Select a day to see its full breakdown.</p>
        </div>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs w-max">
          <button type="button" onClick={() => setPeriod((p) => shiftMonth(p.year, p.month, -1))} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Previous month"><HiChevronLeft className="w-4 h-4" /></button>
          <span className="w-32 text-center select-none">{label}</span>
          <button type="button" onClick={() => setPeriod(next)} disabled={isFutureMonth(next.year, next.month)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Next month"><HiChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load attendance history." />
        ) : list.loading && list.items.length === 0 ? (
          <div className="p-6"><LoadingRows rows={6} /></div>
        ) : list.items.length === 0 ? (
          <EmptyState icon={HiClock} title="No records" message={`No attendance records for ${label}.`} />
        ) : (
          <>
            <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 text-[11px] font-semibold uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Clock in</th>
                    <th className="px-6 py-3.5">Clock out</th>
                    <th className="px-6 py-3.5">Late</th>
                    <th className="px-6 py-3.5 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.items.map((record) => {
                    const ymd = ymdOnly(record.date);
                    return (
                      <tr
                        key={record.id || ymd}
                        onClick={() => setSelectedDate(ymd)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedDate(ymd))}
                        tabIndex={0}
                        className="hover:bg-purple-50/30 focus:bg-purple-50/40 outline-none transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3.5 font-semibold text-slate-800 whitespace-nowrap">{fmtDate(ymd, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="px-6 py-3.5"><StatusBadge status={record.status} /></td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{fmtTime(record.clock_in_time)}</td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{fmtTime(record.clock_out_time)}</td>
                        <td className="px-6 py-3.5 text-xs">{Number(record.late_minutes) > 0 ? <span className="text-amber-600 font-bold">{fmtMinutes(record.late_minutes)}</span> : "—"}</td>
                        <td className="px-6 py-3.5 text-right">
                          <LiveEffectiveHours effectiveHours={record.effective_hours} clockInTime={record.clock_in_time} clockOutTime={record.clock_out_time} breaks={record.breaks} activeBreak={record.active_break} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100">
              <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />
            </div>
          </>
        )}
      </div>

      {selectedDate && <DailyLogModal userId={userId} date={selectedDate} employeeRole={employeeRole} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}
