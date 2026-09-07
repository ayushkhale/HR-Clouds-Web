import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCash, HiCalendar } from "react-icons/hi";
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

export default function MyLoansAndAdvancesPage() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getMyLoans();
      setLoans(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load loans", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleViewSchedule = async (loan) => {
    try {
      const res = await payrollAPI.getMyLoanInstallments(loan.id);
      setInstallments(res.data || []);
      setSelectedLoan(loan);
      setIsModalOpen(true);
    } catch (err) {
      showToast(err.message || "Failed to fetch installments schedule", "error");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Loans & Advances" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-5xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiCash className="text-purple-600 w-7 h-7" /> Loans & Advances
            </h1>
            <p className="text-sm text-slate-500 mt-1">View your pending balances and EMI schedules.</p>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {loans.map(loan => (
                <div key={loan.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group">
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg capitalize">{loan.loan_type}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Approved on {new Date(loan.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${loan.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {loan.status}
                    </span>
                  </div>
                  
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Principal Amount</p>
                      <p className="text-sm font-black text-slate-800">₹{parseFloat(loan.principal_amount || 0).toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Remaining Balance</p>
                      <p className="text-sm font-black text-purple-700">₹{parseFloat(loan.remaining_balance || 0).toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Monthly EMI</p>
                      <p className="text-sm font-semibold text-slate-600">₹{parseFloat(loan.monthly_emi || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-50 flex items-center bg-white">
                    <button onClick={() => handleViewSchedule(loan)} className="w-full flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <HiCalendar className="w-4 h-4" /> View Repayment Schedule
                    </button>
                  </div>
                </div>
              ))}
              {loans.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">You do not have any active loans or advances.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {isModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Repayment Schedule</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-0 overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                    <th className="px-6 py-3">Month</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {installments.map(inst => (
                    <tr key={inst.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 text-slate-600 font-medium">{new Date(0, inst.applicable_month - 1).toLocaleString('default', { month: 'short' })} {inst.applicable_year}</td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-800">₹{parseFloat(inst.amount).toLocaleString()}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${inst.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {inst.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {installments.length === 0 && (
                    <tr><td colSpan={3} className="px-6 py-6 text-center text-slate-500">No installments found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
