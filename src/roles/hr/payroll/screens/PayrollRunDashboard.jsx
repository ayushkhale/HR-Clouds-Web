import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiPlay, HiCalculator, HiDocumentSearch, HiCheck, HiCash } from "react-icons/hi";
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

export default function PayrollRunDashboard() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ cycle_month: "", cycle_year: new Date().getFullYear(), description: "" });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getRuns();
      setRuns(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load runs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateRun = async (e) => {
    e.preventDefault();
    try {
      const monthStr = formData.cycle_month.toString().padStart(2, '0');
      const payload = {
        period_month: `${formData.cycle_year}-${monthStr}`,
        run_type: "regular",
        notes: formData.description
      };
      await payrollAPI.createRun(payload);
      showToast("Run created successfully");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to create run", "error");
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'calculate') await payrollAPI.calculateRun(id);
      if (action === 'approve') await payrollAPI.approveRun(id);
      if (action === 'pay') await payrollAPI.payRun(id);
      if (action === 'cancel') await payrollAPI.cancelRun(id);
      showToast(`Run ${action}d successfully`);
      loadData();
    } catch (err) {
      showToast(err.message || `Failed to ${action} run`, "error");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-600';
      case 'calculated': return 'bg-blue-100 text-blue-700';
      case 'approved': return 'bg-purple-100 text-purple-700';
      case 'paid': return 'bg-emerald-100 text-emerald-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Payroll Run Engine" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiPlay className="text-purple-600 w-7 h-7" /> Payroll Runs
              </h1>
              <p className="text-sm text-slate-500 mt-1">Command center to execute and finalize monthly payroll.</p>
            </div>
            <button onClick={() => {
                const now = new Date();
                setFormData({ cycle_month: now.getMonth() + 1, cycle_year: now.getFullYear(), description: "" });
                setIsModalOpen(true);
              }} 
              className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlay className="w-5 h-5" /> Start New Run
            </button>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {runs.map(run => (
                <div key={run.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group">
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-800 text-lg">Run {run.cycle_month}/{run.cycle_year}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${getStatusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    {run.description && <p className="text-xs text-slate-500 line-clamp-1">{run.description}</p>}
                  </div>
                  
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Total Employees</p>
                      <p className="text-sm font-semibold text-slate-800">{run.total_employees || 0}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Gross Payout</p>
                      <p className="text-sm font-black text-purple-700">₹{parseFloat(run.total_gross || 0).toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-xs font-bold text-slate-400 uppercase">Net Payout</p>
                      <p className="text-sm font-black text-emerald-600">₹{parseFloat(run.total_net || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-white flex-wrap gap-2">
                    {run.status === 'draft' && (
                      <button onClick={() => handleAction(run.id, 'calculate')} className="flex-1 flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                        <HiCalculator className="w-4 h-4" /> Calculate
                      </button>
                    )}
                    {run.status === 'calculated' && (
                      <>
                        <button onClick={() => handleAction(run.id, 'calculate')} className="flex justify-center items-center gap-1.5 px-2 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition" title="Recalculate">
                          <HiCalculator className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleAction(run.id, 'approve')} className="flex-1 flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                          <HiCheck className="w-4 h-4" /> Approve
                        </button>
                      </>
                    )}
                    {run.status === 'approved' && (
                      <button onClick={() => handleAction(run.id, 'pay')} className="flex-1 flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition">
                        <HiCash className="w-4 h-4" /> Finalize (Pay)
                      </button>
                    )}
                    {['draft', 'calculated', 'approved'].includes(run.status) && (
                      <button onClick={() => handleAction(run.id, 'cancel')} className="flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Cancel Run">
                        <HiX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {runs.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">No payroll runs found. Start a new run to begin.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Start Payroll Run</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateRun} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select required value={formData.cycle_month} onChange={e => setFormData({...formData, cycle_month: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {Array.from({length: 12}).map((_, i) => <option key={i} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={formData.cycle_year} onChange={e => setFormData({...formData, cycle_year: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Description</label>
                <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Regular Payroll" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Start Run</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
