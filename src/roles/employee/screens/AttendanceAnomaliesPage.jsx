import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiExclamationCircle, HiFilter } from "react-icons/hi";

function AttendanceAnomaliesPage({ role = "employee" }) {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchAnomalies();
  }, [statusFilter]);

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await attendanceAPI.getMyAnomalies(params);
      if (res.success) {
        const data = res.data?.data || res.data?.anomalies || res.data || [];
        setAnomalies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase();
    if (s === 'resolved') return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (s === 'ignored') return "bg-slate-100 text-slate-700 border-slate-200";
    return "bg-rose-100 text-rose-700 border-rose-200";
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="My Anomalies" />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiExclamationCircle className="text-rose-500 w-7 h-7" /> Attendance Anomalies
              </h1>
              <p className="text-sm text-slate-500 mt-1">Review your missed punches, late arrivals, and early departures.</p>
            </div>
            <div className="flex items-center gap-2">
              <HiFilter className="text-slate-400 w-5 h-5" />
              <select 
                className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Severity</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400">Loading anomalies...</td>
                    </tr>
                  ) : anomalies.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <HiExclamationCircle className="w-8 h-8 text-slate-200" />
                          <p>No anomalies found for the selected filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    anomalies.map((anom, idx) => (
                      <tr key={anom.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold">{anom.date}</td>
                        <td className="px-6 py-4 capitalize">{anom.type?.replace(/_/g, ' ') || '--'}</td>
                        <td className="px-6 py-4">
                           <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${anom.severity === 'high' ? 'bg-red-100 text-red-700' : anom.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                             {anom.severity || 'low'}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${getStatusBadge(anom.status)}`}>
                            {anom.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 truncate max-w-xs" title={anom.description}>{anom.description || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AttendanceAnomaliesPage;
