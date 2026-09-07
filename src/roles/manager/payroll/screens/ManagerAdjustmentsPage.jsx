import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiAdjustments, HiUserGroup } from "react-icons/hi";
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

export default function ManagerAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    user_id: "", adjustment_type: "addition", amount: "", description: "",
    applicable_month: new Date().getMonth() + 1, applicable_year: new Date().getFullYear()
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adjRes, teamRes] = await Promise.all([
        payrollAPI.getTeamAdjustments().catch(e => { console.error("getTeamAdjustments failed:", e); return { data: [] }; }),
        organizationAPI.getEmployees({ purpose: "shift_assignment" }).catch(e => { console.error("getEmployees failed:", e); return { data: [] }; })
      ]);
      console.log("teamRes full:", teamRes);
      const rawAdj = adjRes.data?.records ?? adjRes.data ?? [];
      const rawTeam = Array.isArray(teamRes.data)
        ? teamRes.data
        : (teamRes.data?.employees ?? teamRes.data?.records ?? teamRes.data?.data ?? []);
      console.log("rawTeam:", rawTeam);
      setAdjustments(Array.isArray(rawAdj) ? rawAdj : []);
      setTeamMembers(Array.isArray(rawTeam) ? rawTeam : []);
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await payrollAPI.proposeTeamAdjustment(formData.user_id, {
        ...formData,
        amount: parseFloat(formData.amount)
      });
      showToast("Adjustment proposed to HR successfully");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to propose adjustment", "error");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Propose Adjustments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiAdjustments className="text-purple-600 w-7 h-7" /> Team Variable Pay
              </h1>
              <p className="text-sm text-slate-500 mt-1">Propose bonuses or one-off deductions for your team.</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlus className="w-5 h-5" /> Propose Adjustment
            </button>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                    <th className="px-6 py-4 border-b border-slate-100">Cycle</th>
                    <th className="px-6 py-4 border-b border-slate-100">Type</th>
                    <th className="px-6 py-4 border-b border-slate-100">Amount</th>
                    <th className="px-6 py-4 border-b border-slate-100">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {adjustments.map(adj => (
                    <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{adj.employee?.name || adj.user_id}</td>
                      <td className="px-6 py-4 text-slate-600">{new Date(0, adj.applicable_month - 1).toLocaleString('default', { month: 'short' })} {adj.applicable_year}</td>
                      <td className="px-6 py-4 capitalize text-slate-600">{adj.adjustment_type}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">₹{parseFloat(adj.amount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${adj.status === 'proposed' ? 'bg-amber-100 text-amber-700' : adj.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : adj.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          {adj.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {adjustments.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No adjustments proposed yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose Variable Pay</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Team Member <span className="text-red-500">*</span></label>
                <select required value={formData.user_id} onChange={e => setFormData({...formData, user_id: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="">-- Select Report --</option>
                  {teamMembers.map(m => <option key={m.id || m._id} value={m.id || m._id}>{m.name || m.identifier}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                  <select value={formData.adjustment_type} onChange={e => setFormData({...formData, adjustment_type: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="addition">Addition (Bonus)</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Amount <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Why is this proposed?" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <p className="text-xs text-slate-400 italic">This proposal will be sent to HR for final approval.</p>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Propose to HR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
