import React from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiClock } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { fmtDate, fmtDateTime, fmtMinutes, ymdOnly } from "../../../shared/attendance/dates";
import { EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

// Response shape is undocumented (audit C14); minutes are the canonical unit
// elsewhere in the module, hours are accepted as a fallback.
function overtimeMinutes(record) {
  if (record.overtime_minutes != null) return Number(record.overtime_minutes);
  if (record.minutes != null) return Number(record.minutes);
  if (record.requested_minutes != null) return Number(record.requested_minutes);
  if (record.hours != null) return Math.round(Number(record.hours) * 60);
  return null;
}

function EmployeeOvertimePage() {
  const list = usePagedList(({ page, limit }) => attendanceAPI.getMyOvertime({ page, limit }), { limit: 20, keys: ["overtime", "requests", "records"] });

  return (
    <>
      <DashboardTopBar title="My Overtime" />
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Overtime</h1>
          <p className="text-sm text-slate-500 mt-1">Overtime recorded from your attendance and its approval status.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load your overtime." />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={4} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState icon={HiClock} title="No overtime yet" message="Overtime appears here when you work beyond your shift and your attendance policy tracks it." />
          ) : (
            <>
              <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
                <table className="w-full text-left text-sm min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5">Overtime</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Reviewer remarks</th>
                      <th className="px-6 py-3.5">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {list.items.map((record, idx) => {
                      const remarks = record.remarks || record.manager_remarks || record.manager_note;
                      return (
                        <tr key={record.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-3.5 font-semibold whitespace-nowrap">{fmtDate(ymdOnly(record.date || record.record_date || record.attendance_record?.date))}</td>
                          <td className="px-6 py-3.5 font-bold text-indigo-600">{fmtMinutes(overtimeMinutes(record))}</td>
                          <td className="px-6 py-3.5"><StatusBadge kind="overtime" status={record.status || "pending"} /></td>
                          <td className="px-6 py-3.5 max-w-xs truncate" title={remarks}>{remarks || "—"}</td>
                          <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(record.approved_at || record.reviewed_at || record.updated_at, "—")}</td>
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
      </main>
    </>
  );
}

export default EmployeeOvertimePage;
