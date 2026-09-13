import React, { useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiExclamationCircle } from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { ANOMALY_FILTERS, anomalyStatusKey, anomalyTypeLabel } from "../../../shared/attendance/enums";
import { fmtDate, fmtDateTime, ymdOnly } from "../../../shared/attendance/dates";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";

function AttendanceAnomaliesPage() {
  const [status, setStatus] = useState("open");
  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyAnomalies({ status, page, limit }),
    { limit: 20, keys: ["anomalies", "records"], filterKey: status }
  );

  return (
    <>
      <DashboardTopBar title="My Anomalies" />
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Attendance Flags
            </h1>
            <p className="text-sm text-slate-500 mt-1">Punches the system flagged for review — e.g. outside the office geofence or breaks over the limit.</p>
          </div>
          <FilterTabs options={ANOMALY_FILTERS} value={status} onChange={setStatus} />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load your attendance flags." />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={4} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState icon={HiExclamationCircle} title={status === "open" ? "No open flags" : "Nothing to show"} message={status === "open" ? "You're all clear." : "No flags match this filter."} />
          ) : (
            <>
              <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
                <table className="w-full text-left text-sm min-w-[760px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5">Flag</th>
                      <th className="px-6 py-3.5">Severity</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {list.items.map((anom, idx) => {
                      // Records expose `is_resolved` + `resolution_notes` — no status string (§2 C16).
                      const remarks = anom.resolution_notes;
                      return (
                        <tr key={anom.id || idx} className="hover:bg-slate-50/80 transition-colors align-top">
                          <td className="px-6 py-3.5 font-semibold whitespace-nowrap">{fmtDate(ymdOnly(anom.date || anom.record_date || anom.created_at))}</td>
                          <td className="px-6 py-3.5">{anomalyTypeLabel(anom.type || anom.anomaly_type)}</td>
                          <td className="px-6 py-3.5">{anom.severity ? <StatusBadge kind="severity" status={anom.severity} /> : <span className="text-slate-400">—</span>}</td>
                          <td className="px-6 py-3.5"><StatusBadge kind="anomaly" status={anomalyStatusKey(anom)} /></td>
                          <td className="px-6 py-3.5 max-w-sm">
                            <p className="truncate" title={anom.description}>{anom.description || "—"}</p>
                            {remarks && <p className="text-[11px] text-slate-400 truncate mt-0.5" title={remarks}>Resolution: {remarks}</p>}
                            {anom.resolved_at && <p className="text-[10px] text-slate-400">Resolved {fmtDateTime(anom.resolved_at)}</p>}
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
      </main>
    </>
  );
}

export default AttendanceAnomaliesPage;
