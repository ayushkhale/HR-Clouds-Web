import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiClock } from "react-icons/hi";

function EmployeeOvertimePage({ role = "employee" }) {
  const [overtime, setOvertime] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOvertime();
  }, []);

  const fetchOvertime = async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getMyOvertime();
      if (res.success) {
        const data = res.data?.data || res.data?.overtime || res.data || [];
        setOvertime(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase();
    if (s === 'approved') return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (s === 'rejected') return "bg-rose-100 text-rose-700 border-rose-200";
    return "bg-amber-100 text-amber-700 border-amber-200";
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="My Overtime" />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Overtime Hours</h1>
              <p className="text-sm text-slate-500 mt-1">Track your approved extra hours.</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Hours</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Manager Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400">Loading overtime records...</td>
                    </tr>
                  ) : overtime.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <HiClock className="w-8 h-8 text-slate-200" />
                          <p>No overtime records found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    overtime.map((record, idx) => (
                      <tr key={record.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold">{record.date}</td>
                        <td className="px-6 py-4 font-bold text-indigo-600">{record.hours} hrs</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${getStatusBadge(record.status)}`}>
                            {record.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 truncate max-w-xs" title={record.manager_note}>{record.manager_note || '--'}</td>
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

export default EmployeeOvertimePage;
