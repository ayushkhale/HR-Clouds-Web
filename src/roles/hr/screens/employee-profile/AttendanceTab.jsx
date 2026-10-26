import React, { useState } from "react";
import { HiChevronLeft, HiChevronRight, HiClock } from "react-icons/hi";
import { memberAttendanceApi } from "../../../../shared/attendance/memberAttendance";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import LiveEffectiveHours from "../../../../shared/attendance/LiveEffectiveHours";
import { fmtDate, fmtTime, isFutureMonth, monthLabel, shiftMonth, ymdOnly } from "../../../../shared/attendance/dates";
import { dayChip, isSynthesizedDay, isWorkingDay } from "../../../../shared/attendance/dayStatus";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../../shared/attendance/ui";
import DailyLogDialog from "../../../../shared/attendance/DailyLogDialog";

/* ─── Main tab ────────────────────────────────────────────────── */
export default function AttendanceTab({ userId, employeeRole, viewer = "hr" }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedDate, setSelectedDate] = useState(null);
  const api = memberAttendanceApi(employeeRole, viewer);
  // Every viewer now has a daily-log read (managers since 2026-09-24).
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
                    // `null` is "no data", never a measured zero (contract §10):
                    // missing times and modes read N/A; unmeasured durations 0m.
                    const na = <span className="text-slate-400">N/A</span>;
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
                          <span className="flex items-center gap-1.5">
                            <StatusBadge status={chip.key === "late" ? "present" : chip.key} label={chip.label} />
                            {record.is_regularized && (
                              <span className="text-[9px] font-bold uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full" title="This day was fixed by an attendance correction">Fixed</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{record.clock_in_time ? fmtTime(record.clock_in_time) : na}</td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">{record.clock_out_time ? fmtTime(record.clock_out_time) : na}</td>
                        <td className="px-6 py-3.5 text-right">
                          {/* Decided by the DAY, not by whether the value came
                              back as 0 or null — the backend uses both for an
                              absent day, so testing the value made two
                              identical absences read "0m" and "N/A" in the same
                              table (UI/UX review 2026-10-06, Issue 3). No hours
                              were due on an off day; a working day with nothing
                              recorded really is 0m (CLAUDE.md §5). */}
                          {!due
                            ? na
                            : record.effective_hours === null && !record.clock_in_time
                              ? <span className="text-slate-400">0m</span>
                              : <LiveEffectiveHours record={record} />}
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

      {selectedDate && <DailyLogDialog userId={userId} date={selectedDate} employeeRole={employeeRole} viewer={viewer} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}
