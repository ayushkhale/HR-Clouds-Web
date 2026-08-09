import React, { useState } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { HiDocumentReport, HiDownload } from "react-icons/hi";

export default function ReportsTab({ userId }) {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = async () => {
    if (!userId || !fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await attendanceAPI.getEmployeeReport(userId, { start_date: fromDate, end_date: toDate });
      setRecords(res?.data?.records || res?.data || []);
    } catch (err) {
      setError("Failed to load report. Please try again.");
      setRecords(null);
    } finally {
      setLoading(false);
    }
  };

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

  const totalPresent = Array.isArray(records) ? records.filter(r => r.status === "present").length : 0;
  const totalAbsent = Array.isArray(records) ? records.filter(r => r.status === "absent").length : 0;
  const totalLate = Array.isArray(records) ? records.filter(r => r.status === "late").length : 0;

  return (
    <div className="space-y-5">
      <h2 className="text-base font-bold text-slate-800">Attendance Report</h2>

      {/* Date Range Picker */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Select Date Range</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-60 shrink-0"
          >
            <HiDocumentReport className="w-4 h-4" />
            {loading ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold rounded-xl px-5 py-3">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      {Array.isArray(records) && records.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Present", value: totalPresent, cls: "text-purple-700 bg-purple-50 border-purple-100" },
              { label: "Absent", value: totalAbsent, cls: "text-purple-500 bg-purple-100 border-purple-200" },
              { label: "Late", value: totalLate, cls: "text-violet-500 bg-violet-50 border-violet-100" },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.cls}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-semibold mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Report Table */}
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
                  {records.map((record, i) => {
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && records !== null && Array.isArray(records) && records.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-xs">
          <HiDocumentReport className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">No records found for this date range</p>
        </div>
      )}

      {records === null && !loading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 shadow-xs">
          <HiDocumentReport className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Select a date range and generate report</p>
          <p className="text-xs mt-1">You can generate detailed attendance reports for any period</p>
        </div>
      )}
    </div>
  );
}
