import React, { useCallback, useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight, HiClock, HiExclamationCircle, HiCheckCircle, HiCalendar, HiCollection, HiPause, HiViewList } from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { unwrap } from "../../../../shared/attendance/normalize";
import { anomalyStatusKey, anomalyTypeLabel, humanize, statusMeta } from "../../../../shared/attendance/enums";
import { fmtClock, fmtDate, fmtMinutes, fmtTime, isFutureMonth, monthLabel, shiftMonth, ymdOnly } from "../../../../shared/attendance/dates";
import { dayChip, isSynthesizedDay, isWorkingDay, metric } from "../../../../shared/attendance/dayStatus";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../../shared/attendance/ui";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable } from "../../../../shared/components/DetailDialog";

const minutesOrZero = (v) => (Number(v) > 0 ? fmtMinutes(v) : "0m");

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

  const { log, loading, error } = state;
  const sessions = Array.isArray(log?.sessions) ? log.sessions : [];
  const breaks = Array.isArray(log?.breaks) ? log.breaks : [];
  const anomalies = Array.isArray(log?.anomalies) ? log.anomalies : [];

  return (
    <DetailDialog
      eyebrow="Daily log"
      icon={HiCalendar}
      title={fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      subtitle={log?.shift?.name ? `Shift · ${log.shift.name}` : undefined}
      badge={log && <DetailPill tone="onDark">{statusMeta("record", log.status).label}</DetailPill>}
      onClose={onClose}
    >
      {loading ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <div className="bg-white rounded-2xl border border-purple-100"><ErrorState error={error} onRetry={load} fallback="Couldn't load the daily log." /></div>
      ) : !log ? (
        <div className="bg-white rounded-2xl border border-purple-100"><EmptyState title="No data" message="Nothing was recorded for this day." /></div>
      ) : (
        <>
          <DetailStats
            items={[
              { label: "Clock in", value: fmtTime(log.clock_in_time), icon: HiClock },
              { label: "Clock out", value: fmtTime(log.clock_out_time), icon: HiClock },
              { label: "Effective hours", value: <LiveEffectiveHours effectiveHours={log.effective_hours} formatted={log.worked_duration_formatted} clockInTime={log.clock_in_time} clockOutTime={log.clock_out_time} breaks={log.breaks} className="text-purple-800" />, icon: HiCheckCircle },
              { label: "Break time", value: minutesOrZero(log.break_duration_minutes), icon: HiPause },
            ]}
          />

          <DetailSection title="Day breakdown" icon={HiViewList}>
            <DetailGrid
              cols={5}
              items={[
                ["Late by", minutesOrZero(log.late_minutes)],
                ["Overtime", minutesOrZero(log.overtime_minutes)],
                ["Left early by", minutesOrZero(log.early_exit_minutes)],
                ["Work mode", log.work_mode ? humanize(log.work_mode) : null],
                ["Corrected", log.is_regularized ? "Yes" : "No"],
              ]}
            />
          </DetailSection>

          {log.shift && (
            <DetailSection title="Applied shift" icon={HiClock}>
              <DetailGrid
                items={[
                  ["Shift", log.shift.name],
                  ["Starts", fmtClock(log.shift.start_time)],
                  ["Ends", fmtClock(log.shift.end_time)],
                  ["Type", humanize(log.shift.type || log.shift.shift_type)],
                ]}
              />
            </DetailSection>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DetailSection title={`Sessions (${sessions.length})`} icon={HiCollection}>
              <DetailTable
                rows={sessions}
                empty="No work sessions recorded."
                columns={[
                  { header: "#", render: (_, i) => i + 1 },
                  { header: "Started", render: (s) => fmtTime(s.opened_at || s.start_time) },
                  { header: "Ended", render: (s) => (s.closed_at || s.end_time ? fmtTime(s.closed_at || s.end_time) : <span className="font-bold text-purple-600">Active</span>) },
                  { header: "Status", render: (s) => <DetailPill tone={s.status === "open" ? "solid" : "soft"}>{humanize(s.status) || "N/A"}</DetailPill> },
                ]}
              />
            </DetailSection>

            <DetailSection title={`Breaks (${breaks.length})`} icon={HiPause}>
              <DetailTable
                rows={breaks}
                empty="No breaks taken."
                columns={[
                  { header: "#", render: (_, i) => i + 1 },
                  { header: "Started", render: (b) => fmtTime(b.start_time) },
                  { header: "Ended", render: (b) => (b.end_time ? fmtTime(b.end_time) : <span className="font-bold text-purple-600">Ongoing</span>) },
                  { header: "Duration", align: "right", render: (b) => minutesOrZero(b.duration_minutes) },
                ]}
              />
            </DetailSection>
          </div>

          <DetailSection title={`Flags (${anomalies.length})`} icon={HiExclamationCircle}>
            {anomalies.length === 0 ? (
              <p className="flex items-center gap-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                <HiCheckCircle className="w-4 h-4" /> No flags for this day.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {anomalies.map((a, i) => (
                  <div key={a.id || i} className="bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-purple-900">{anomalyTypeLabel(a.type)}</p>
                      <div className="flex gap-1.5 shrink-0">
                        {a.severity && <DetailPill tone="outline">{humanize(a.severity)}</DetailPill>}
                        <DetailPill tone={anomalyStatusKey(a) === "resolved" ? "muted" : "solid"}>{humanize(anomalyStatusKey(a))}</DetailPill>
                      </div>
                    </div>
                    {a.description && <p className="text-xs text-slate-600 mt-1">{a.description}</p>}
                    {a.resolution_notes && <p className="text-[11px] text-purple-600 mt-1">Resolution: {a.resolution_notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

/* ─── Main tab ────────────────────────────────────────────────── */
export default function AttendanceTab({ userId, employeeRole, viewer = "hr" }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedDate, setSelectedDate] = useState(null);
  const api = memberAttendanceApi(employeeRole, viewer);
  // Without a daily-log endpoint (manager view) the rows stay read-only.
  const canOpenDay = !!api.dailyLog;

  // HR detail endpoints are consumed with month/year (audit C15).
  const list = usePagedList(
    ({ page, limit }) => api.history(userId, { month: period.month, year: period.year, page, limit }),
    { limit: 31, keys: ["records"], filterKey: `${userId}-${api.population}-${period.year}-${period.month}`, enabled: !!userId }
  );

  // A manager reads a report's month newest-first; the whole month is one page.
  const rows = viewer === "manager"
    ? [...list.items].sort((a, b) => (ymdOnly(b.date) || "").localeCompare(ymdOnly(a.date) || ""))
    : list.items;
  const next = shiftMonth(period.year, period.month, 1);
  const label = monthLabel(period.year, period.month);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Attendance history</h2>
          <p className="text-xs text-slate-400 mt-0.5">{canOpenDay ? "Every day of the month is listed. Select a day with a record to see its full breakdown." : "Every day of the month is listed."}</p>
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
                    <th className="px-6 py-3.5">Overtime</th>
                    <th className="px-6 py-3.5">Mode</th>
                    <th className="px-6 py-3.5 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((record) => {
                    const ymd = ymdOnly(record.date);
                    const chip = dayChip(record);
                    // A day the backend synthesized has no punch to open, and
                    // nothing was due on a weekly off or holiday: both are shown
                    // quietly so the worked days stay the ones that read loudest.
                    const synthetic = isSynthesizedDay(record);
                    const closed = synthetic || !canOpenDay;
                    const due = isWorkingDay(record);
                    const late = metric(record.late_minutes);
                    const overtime = metric(record.overtime_minutes);
                    // `null` is "no data", never a measured zero (contract §10):
                    // missing times and modes read N/A; unmeasured durations 0m.
                    const na = <span className="text-slate-400">N/A</span>;
                    const zero = <span className="text-slate-400">0m</span>;
                    return (
                      <tr
                        key={record.id || ymd}
                        onClick={() => !closed && setSelectedDate(ymd)}
                        onKeyDown={(e) => !closed && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedDate(ymd))}
                        tabIndex={closed ? -1 : 0}
                        aria-disabled={closed || undefined}
                        className={closed
                          ? `outline-none ${due ? "bg-white" : "bg-slate-50/40"}`
                          : "hover:bg-purple-50/30 focus:bg-purple-50/40 outline-none transition-colors cursor-pointer"}
                      >
                        <td className={`px-6 py-3.5 font-semibold whitespace-nowrap ${due ? "text-slate-800" : "text-slate-400"}`}>
                          {fmtDate(ymd, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-6 py-3.5">
                          <StatusBadge status={chip.key === "late" ? "present" : chip.key} label={chip.label} />
                        </td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{record.clock_in_time ? fmtTime(record.clock_in_time) : na}</td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{record.clock_out_time ? fmtTime(record.clock_out_time) : na}</td>
                        <td className="px-6 py-3.5 text-xs">
                          {late === null ? na : late > 0 ? <span className="text-fuchsia-600 font-bold">{fmtMinutes(late)}</span> : <span className="text-slate-500">0m</span>}
                        </td>
                        <td className="px-6 py-3.5 text-xs">
                          {overtime === null ? zero : overtime > 0 ? <span className="text-violet-600 font-bold">{fmtMinutes(overtime)}</span> : <span className="text-slate-500">0m</span>}
                        </td>
                        <td className="px-6 py-3.5 text-xs">
                          <span className="flex items-center gap-1.5">
                            {record.work_mode ? <span className="text-slate-600 font-semibold">{humanize(record.work_mode)}</span> : na}
                            {record.is_regularized && (
                              <span className="text-[9px] font-bold uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full" title="This day was corrected by a regularization">Fixed</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {record.effective_hours === null && !record.clock_in_time
                            ? na
                            : <LiveEffectiveHours effectiveHours={record.effective_hours} formatted={record.worked_duration_formatted} clockInTime={record.clock_in_time} clockOutTime={record.clock_out_time} breaks={record.breaks} activeBreak={record.active_break} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100">
              <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} noun="day" />
            </div>
          </>
        )}
      </div>

      {selectedDate && <DailyLogModal userId={userId} date={selectedDate} employeeRole={employeeRole} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}
