import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

export default function TeamPayslipsPage() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    // We get the runs via HR endpoint for simplicity, but in a real app, 
    // Manager might have a dedicated endpoint for visible runs, or we can use the HR endpoint if the token has basic HR roles, 
    // but the backend handles permissions. We'll use getRuns() assuming it returns visible ones.
    payrollAPI.getRuns()
      .then(res => {
        const approvedOrPaid = (res.data?.records || res.data || []).filter(r => ['approved', 'paid'].includes(r.status));
        setRuns(approvedOrPaid);
        if (approvedOrPaid.length > 0) {
          setSelectedRunId(approvedOrPaid[0].id);
        }
        setLoadingRuns(false);
      })
      .catch(err => {
        showToast(err.message, "error");
        setLoadingRuns(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoadingPayslips(true);
    payrollAPI.getTeamRunItems(selectedRunId)
      .then(res => setPayslips(res.data?.records || res.data || []))
      .catch(err => showToast(err.message, "error"))
      .finally(() => setLoadingPayslips(false));
  }, [selectedRunId]);

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Team Payslips" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiDocumentReport className="text-purple-600 w-7 h-7" /> Team Payslips
              </h1>
              <p className="text-sm text-slate-500 mt-1">View finalized payslips for your direct reports.</p>
            </div>
            {!loadingRuns && runs.length > 0 && (
              <select 
                value={selectedRunId || ""} 
                onChange={e => setSelectedRunId(e.target.value)}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-purple-400 shadow-sm"
              >
                {runs.map(r => (
                  <option key={r.id} value={r.id}>Run {r.cycle_month}/{r.cycle_year} ({r.status})</option>
                ))}
              </select>
            )}
          </div>

          {loadingRuns || loadingPayslips ? <Skeleton type="table" rows={4} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                    <th className="px-6 py-4 border-b border-slate-100">Payable Days</th>
                    <th className="px-6 py-4 border-b border-slate-100">Gross Pay</th>
                    <th className="px-6 py-4 border-b border-slate-100">Deductions</th>
                    <th className="px-6 py-4 border-b border-slate-100">Net Pay</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {payslips.map(slip => (
                    <tr key={slip.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{slip.employee?.name}</p>
                        <p className="text-xs text-slate-500">{slip.employee?.email}</p>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700">{slip.payable_days}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700">₹{parseFloat(slip.gross_pay || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 font-semibold text-red-600">₹{parseFloat(slip.total_deductions || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 font-black text-emerald-600">₹{parseFloat(slip.net_pay || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="px-3 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {payslips.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No payslips available for this run.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
