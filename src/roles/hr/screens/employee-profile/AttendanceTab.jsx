import React, { useState, useEffect } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";

export default function AttendanceTab({ userId, employeeRole }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const isManager = employeeRole === "manager";
    const fn = isManager
      ? attendanceAPI.getIndividualManagerAttendanceDetail
      : attendanceAPI.getIndividualEmployeeAttendanceDetail;

    fn(userId, { month, year, page, limit: 20 })
      .then(res => {
        setRecords(res?.data?.records || []);
        setTotalPages(res?.data?.pagination?.total_pages || 1);
      })
      .catch(() => { setRecords([]); })
      .finally(() => setLoading(false));
  }, [userId, month, year, page, employeeRole]);

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setPage(1);
  };
  const handleNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setPage(1);
  };

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });

  const renderBadge = (status) => {
    const cfg = DICTIONARY.STATUS_CONFIG[status];
    if (cfg) {
      const Icon = cfg.icon;
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold w-max ${cfg.className}`}>
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {cfg.label}
        </span>
      );
    }
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[11px] font-bold">{status || "—"}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Attendance History</h2>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
          <button onClick={handlePrev} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <HiChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-32 text-center select-none">{monthName}</span>
          <button onClick={handleNext} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <HiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Day</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Clock In</th>
                <th className="px-6 py-4">Clock Out</th>
                <th className="px-6 py-4 text-right">Eff. Hrs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center text-slate-400 text-sm font-medium">
                    No attendance records for {monthName}.
                  </td>
                </tr>
              ) : (
                records.map((record, i) => {
                  const d = new Date(record.date);
                  return (
                    <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {d.toLocaleDateString("en-IN", { weekday: "long" })}
                      </td>
                      <td className="px-6 py-4">{renderBadge(record.status)}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{record.clock_in || "—"}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{record.clock_out || "—"}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800">
                        {record.effective_hours != null ? `${record.effective_hours}h` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
