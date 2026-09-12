import React, { useState, useEffect } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { HiGift, HiInformationCircle } from "react-icons/hi";

function EmployeeCompOffsPage() {
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
    if (s === 'approved') return "bg-emerald-50 text-emerald-700";
    if (s === 'rejected') return "bg-rose-50 text-rose-700";
    return "bg-purple-50 text-purple-600";
  };

  return (
    <>
        <DashboardTopBar title={`My ${DICTIONARY.TERMS.COMP_OFF}s`} />

        <main className="p-6 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6 lg:space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                  <HiGift className="w-5 h-5" />
                </div>
                Compensatory Time Off
              </h1>
              <p className="text-sm text-slate-500 mt-1">Track your extra days worked and available {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} balance.</p>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                  <HiGift className="w-5 h-5" />
                </div>
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary.available_balance || 0}</span>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Available Balance</div>
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3 sm:mb-4 bg-emerald-50">
                  <span className="font-black text-lg">+</span>
                </div>
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary.total_earned || 0}</span>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Earned</div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                  <span className="font-black text-lg">-</span>
                </div>
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary.total_used || 0}</span>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Used</div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto p-4 sm:p-6">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-4 py-3 rounded-l-xl">Worked Date</th>
                    <th className="px-4 py-3">Days Earned</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 rounded-r-xl">Manager Note</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-semibold text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-12 text-center text-slate-400 text-xs">Loading {DICTIONARY.TERMS.COMP_OFF.toLowerCase()}s...</td>
                    </tr>
                  ) : compOffs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-16 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-200">
                            <HiGift className="w-6 h-6" />
                          </div>
                          <p className="text-xs font-semibold text-slate-500">No {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} records found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    compOffs.map((record, idx) => (
                      <tr key={record.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-slate-700">{record.worked_date}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">+{record.days_earned}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full capitalize ${getStatusBadge(record.status)}`}>
                            {record.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 truncate max-w-xs text-slate-500 font-medium" title={record.manager_note}>{record.manager_note || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
    </>
  );
}

export default EmployeeCompOffsPage;
