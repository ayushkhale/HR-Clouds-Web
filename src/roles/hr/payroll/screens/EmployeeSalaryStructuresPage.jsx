import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCurrencyRupee, HiPencil, HiUserGroup } from "react-icons/hi";
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

export default function EmployeeSalaryStructuresPage() {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    annual_ctc: "", effective_from: new Date().toISOString().split('T')[0],
    revision_type: "initial", revision_reason: "", template_id: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, tplRes] = await Promise.all([
        organizationAPI.getEmployees({ purpose: "emp_report" }),
        payrollAPI.getTemplates()
      ]);
      setEmployees(empRes.data?.records || empRes.data || []);
      setTemplates(tplRes.data?.records || tplRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenAssign = (user) => {
    setSelectedUser(user);
    setFormData({
      annual_ctc: "", effective_from: new Date().toISOString().split('T')[0],
      revision_type: "initial", revision_reason: "", template_id: templates[0]?.id || ""
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const userId = selectedUser.id || selectedUser.user_id || selectedUser._id;
      await payrollAPI.assignEmployeeStructure(userId, formData);
      showToast("Salary structure proposed/assigned successfully");
      setIsModalOpen(false);
    } catch (err) {
      showToast(err.message || "Failed to assign structure", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Employee Salary Structures" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiUserGroup className="text-purple-600 w-7 h-7" /> Salary Assignment
            </h1>
            <p className="text-sm text-slate-500 mt-1">Assign or revise salary structures for employees.</p>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                    <th className="px-6 py-4 border-b border-slate-100">Email</th>
                    <th className="px-6 py-4 border-b border-slate-100">Role</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {employees.map((user, i) => (
                    <tr key={user.id || user.user_id || user._id || i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{user.name}</td>
                      <td className="px-6 py-4 text-slate-500">{user.email}</td>
                      <td className="px-6 py-4 text-slate-500 capitalize">{user.role}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleOpenAssign(user)} className="px-3 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                          Revise / Assign
                        </button>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Assign Salary to {selectedUser.name}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Annual CTC <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input type="number" required value={formData.annual_ctc} onChange={e => setFormData({...formData, annual_ctc: e.target.value})} className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Effective From</label>
                  <input type="date" required value={formData.effective_from} onChange={e => setFormData({...formData, effective_from: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Revision Type</label>
                  <select value={formData.revision_type} onChange={e => setFormData({...formData, revision_type: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="initial">Initial</option>
                    <option value="increment">Increment</option>
                    <option value="promotion">Promotion</option>
                    <option value="correction">Correction</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Template <span className="text-red-500">*</span></label>
                <select required value={formData.template_id} onChange={e => setFormData({...formData, template_id: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="">-- Select Template --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Revision Reason</label>
                <input type="text" value={formData.revision_reason} onChange={e => setFormData({...formData, revision_reason: e.target.value})} placeholder="Required for non-initial revisions" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-70 flex justify-center items-center gap-2">
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Assign Structure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
