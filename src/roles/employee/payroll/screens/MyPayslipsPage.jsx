import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiDocumentDownload, HiDocumentText } from "react-icons/hi";
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

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getMyPayslips();
      setPayslips(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load payslips", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleView = async (runId) => {
    try {
      const res = await payrollAPI.getMyPayslip(runId);
      setSelectedPayslip(res.data);
      setIsModalOpen(true);
    } catch (err) {
      showToast(err.message || "Failed to fetch payslip details", "error");
    }
  };

  return (
    <>
        <DashboardTopBar title="My Payslips" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">My Payslips
            </h1>
            <p className="text-sm text-slate-500 mt-1">View and download your monthly salary slips.</p>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {payslips.map(slip => (
                <div key={slip.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group">
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">
                        {new Date(0, slip.payroll_run?.cycle_month - 1).toLocaleString('default', { month: 'long' })} {slip.payroll_run?.cycle_year}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Payable Days: {slip.payable_days}</p>
                    </div>
                    {slip.payroll_run?.status === 'paid' && (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">Paid</span>
                    )}
                  </div>
                  
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Gross Pay</p>
                      <p className="text-sm font-semibold text-slate-700">₹{parseFloat(slip.gross_pay || 0).toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Deductions</p>
                      <p className="text-sm font-semibold text-red-600">₹{parseFloat(slip.total_deductions || 0).toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase">Net Pay</p>
                      <p className="text-sm font-black text-emerald-600">₹{parseFloat(slip.net_pay || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-50 flex items-center gap-2 bg-white">
                    <button onClick={() => handleView(slip.run_id)} className="flex-1 flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <HiDocumentText className="w-4 h-4" /> View Details
                    </button>
                    <button className="flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition">
                      <HiDocumentDownload className="w-4 h-4" /> PDF
                    </button>
                  </div>
                </div>
              ))}
              {payslips.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">No payslips generated yet.</p>
                </div>
              )}
            </div>
          )}
        </main>

      {isModalOpen && selectedPayslip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                Payslip: {new Date(0, selectedPayslip.payroll_run?.cycle_month - 1).toLocaleString('default', { month: 'long' })} {selectedPayslip.payroll_run?.cycle_year}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
               <div className="grid grid-cols-3 gap-4 mb-6">
                 <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-center">
                   <p className="text-[10px] font-bold text-purple-400 uppercase">Gross Pay</p>
                   <p className="text-xl font-black text-purple-700">₹{parseFloat(selectedPayslip.gross_pay || 0).toLocaleString()}</p>
                 </div>
                 <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                   <p className="text-[10px] font-bold text-red-400 uppercase">Deductions</p>
                   <p className="text-xl font-black text-red-600">₹{parseFloat(selectedPayslip.total_deductions || 0).toLocaleString()}</p>
                 </div>
                 <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                   <p className="text-[10px] font-bold text-emerald-400 uppercase">Net Pay</p>
                   <p className="text-xl font-black text-emerald-700">₹{parseFloat(selectedPayslip.net_pay || 0).toLocaleString()}</p>
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-8">
                 <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Earnings</h3>
                    <div className="space-y-2 text-sm">
                      {(selectedPayslip.snapshot?.lines || []).filter(l => l.component_type === 'earning').map((line, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-slate-600">{line.name}</span>
                          <span className="font-semibold text-slate-800">₹{parseFloat(line.calculated_amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                 </div>
                 <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Deductions</h3>
                    <div className="space-y-2 text-sm">
                      {(selectedPayslip.snapshot?.lines || []).filter(l => l.component_type === 'deduction').map((line, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-slate-600">{line.name}</span>
                          <span className="font-semibold text-red-600">₹{parseFloat(line.calculated_amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                      {(selectedPayslip.snapshot?.lines || []).filter(l => l.component_type === 'deduction').length === 0 && (
                        <span className="text-slate-400 italic">No deductions</span>
                      )}
                    </div>
                 </div>
               </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
                <button className="flex justify-center items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition shadow-md shadow-purple-200">
                  <HiDocumentDownload className="w-5 h-5" /> Download PDF
                </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
