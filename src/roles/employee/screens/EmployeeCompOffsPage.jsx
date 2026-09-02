import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { HiGift, HiInformationCircle } from "react-icons/hi";

function EmployeeCompOffsPage({ role = "employee" }) {
  const [compOffs, setCompOffs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        attendanceAPI.getMyCompOffs(),
        attendanceAPI.getMyCompOffSummary()
      ]);
      
      if (listRes.success) {
        const data = listRes.data?.data || listRes.data?.compOffs || listRes.data || [];
        setCompOffs(Array.isArray(data) ? data : []);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
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
        <DashboardTopBar title={`My ${DICTIONARY.TERMS.COMP_OFF}s`} />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Compensatory Time Off</h1>
              <p className="text-sm text-slate-500 mt-1">Track your extra days worked and available {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} balance.</p>
            </div>
            {summary && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm min-w-[200px]">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Available Balance</p>
                <p className="text-3xl font-black text-slate-900">{summary.available_balance || 0} <span className="text-sm font-medium text-slate-500">days</span></p>
                <div className="mt-2 flex gap-4 text-[10px] uppercase font-bold text-slate-500">
                  <span>{summary.total_earned || 0} Earned</span>
                  <span>{summary.total_used || 0} Used</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Worked Date</th>
                    <th className="px-6 py-4">Days Earned</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Manager Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400">Loading {DICTIONARY.TERMS.COMP_OFF.toLowerCase()}s...</td>
                    </tr>
                  ) : compOffs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <HiGift className="w-8 h-8 text-slate-200" />
                          <p>No {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} records found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    compOffs.map((record, idx) => (
                      <tr key={record.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold">{record.worked_date}</td>
                        <td className="px-6 py-4 font-bold text-emerald-600">+{record.days_earned}</td>
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

export default EmployeeCompOffsPage;
