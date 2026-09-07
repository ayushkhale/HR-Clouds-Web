import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiUpload, HiCheck, HiAdjustments, HiTrash } from "react-icons/hi";
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

export default function PayrollAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [formData, setFormData] = useState({
    user_id: "", adjustment_type: "earning", category: "bonus", amount: "", 
    component_id: "", component_code: "", component_name: "", reason: "",
    applicable_month: new Date().getMonth() + 1, applicable_year: new Date().getFullYear(),
    is_taxable: true, pf_applicable: false, esi_applicable: false
  });
  
  const [csvPreview, setCsvPreview] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adjRes, empRes, compRes] = await Promise.all([
        payrollAPI.getAdjustments(),
        organizationAPI.getEmployees({ purpose: "emp_report" }),
        payrollAPI.getComponents()
      ]);
      setAdjustments(adjRes.data?.records || adjRes.data || []);
      setEmployees(empRes.data?.records || empRes.data || []);
      setComponents(compRes.data?.records || compRes.data || []);
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
      const monthStr = formData.applicable_month.toString().padStart(2, '0');
      const payload = {
        ...formData,
        period_month: `${formData.applicable_year}-${monthStr}`,
        amount: parseFloat(formData.amount)
      };
      delete payload.applicable_month;
      delete payload.applicable_year;
      if (!payload.component_id) delete payload.component_id;
      
      await payrollAPI.createAdjustment(payload);
      showToast("Adjustment created successfully");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to create adjustment", "error");
    }
  };

  const handleApprove = async (id) => {
    try {
      await payrollAPI.approveAdjustment(id);
      showToast("Approved successfully");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to approve", "error");
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) return showToast("Reason required", "error");
    try {
      await payrollAPI.rejectAdjustment(rejectingId, { rejection_reason: rejectionReason });
      showToast("Rejected");
      setRejectingId(null);
      setRejectionReason("");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this adjustment?")) return;
    try {
      await payrollAPI.cancelAdjustment(id);
      showToast("Cancelled successfully");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to cancel", "error");
    }
  };

  // Mocking file selection for bulk adjustments
  const handleBulkSimulate = () => {
    setCsvPreview([
      { row: 1, employee: "EMP-001", amount: 5000, type: "earning", status: "valid" },
      { row: 2, employee: "EMP-002", amount: 1500, type: "deduction", status: "valid" },
      { row: 3, employee: "EMP-003", amount: 0, type: "earning", status: "invalid", error: "Amount must be > 0" }
    ]);
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Variable Pay & Adjustments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiAdjustments className="text-purple-600 w-7 h-7" /> Salary Adjustments
              </h1>
              <p className="text-sm text-slate-500 mt-1">Manage one-off additions, deductions, and bonuses.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { setCsvPreview(null); setIsBulkModalOpen(true); }} className="px-4 py-2.5 text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-2">
                <HiUpload className="w-5 h-5" /> Bulk Upload
              </button>
              <button onClick={() => setIsModalOpen(true)} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiPlus className="w-5 h-5" /> New Adjustment
              </button>
            </div>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                    <th className="px-6 py-4 border-b border-slate-100">Cycle</th>
                    <th className="px-6 py-4 border-b border-slate-100">Type</th>
                    <th className="px-6 py-4 border-b border-slate-100">Amount</th>
                    <th className="px-6 py-4 border-b border-slate-100">Status</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {adjustments.map(adj => (
                    <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{employees.find(e => (e.id || e.user_id || e._id) === adj.user_id)?.name || adj.employee?.name || adj.user_id}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {adj.period_month ? (() => {
                          const [y, m] = adj.period_month.split('-');
                          return `${new Date(0, parseInt(m) - 1).toLocaleString('default', { month: 'short' })} ${y}`;
                        })() : "-"}
                      </td>
                      <td className="px-6 py-4 capitalize text-slate-600">
                        {adj.adjustment_type}
                        <span className="block text-[10px] text-slate-400 font-bold">{adj.category?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">₹{parseFloat(adj.amount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${adj.status === 'proposed' ? 'bg-amber-100 text-amber-700' : adj.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : adj.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          {adj.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {adj.status === 'pending' && (
                            <>
                              <button onClick={() => handleApprove(adj.id)} className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition" title="Approve"><HiCheck className="w-4 h-4" /></button>
                              <button onClick={() => setRejectingId(adj.id)} className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition" title="Reject"><HiX className="w-4 h-4" /></button>
                            </>
                          )}
                          {(adj.status === 'approved' || adj.status === 'pending') && (
                            <button onClick={() => handleCancel(adj.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Cancel"><HiTrash className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {adjustments.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No adjustments found.</td></tr>
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
              <h2 className="text-lg font-bold text-slate-800">New Adjustment</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Employee <span className="text-red-500">*</span></label>
                <select required value={formData.user_id} onChange={e => setFormData({...formData, user_id: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="">-- Select Employee --</option>
                  {employees.map(e => <option key={e.id || e.user_id || e._id} value={e.id || e.user_id || e._id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                  <select value={formData.adjustment_type} onChange={e => {
                    const type = e.target.value;
                    setFormData({...formData, adjustment_type: type, category: type === 'earning' ? 'bonus' : 'recovery'});
                  }} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="earning">Earning (+)</option>
                    <option value="deduction">Deduction (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Category</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {formData.adjustment_type === 'earning' ? (
                      <>
                        <option value="bonus">Bonus</option>
                        <option value="incentive">Incentive</option>
                        <option value="ad_hoc_earning">Ad-hoc Earning</option>
                      </>
                    ) : (
                      <>
                        <option value="recovery">Recovery</option>
                        <option value="ad_hoc_deduction">Ad-hoc Deduction</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Amount <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Target Month</label>
                  <select value={formData.applicable_month} onChange={e => setFormData({...formData, applicable_month: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {Array.from({length: 12}).map((_, i) => <option key={i} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Target Year</label>
                  <input type="number" required value={formData.applicable_year} onChange={e => setFormData({...formData, applicable_year: parseInt(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Component <span className="text-red-500">*</span></label>
                  <select required value={formData.component_id} onChange={e => {
                    const comp = components.find(c => c.id === e.target.value);
                    if (comp) {
                      setFormData({
                        ...formData, 
                        component_id: comp.id,
                        component_code: comp.code,
                        component_name: comp.name,
                        is_taxable: comp.is_taxable || false,
                        pf_applicable: comp.pf_applicable || false,
                        esi_applicable: comp.esi_applicable || false
                      });
                    }
                  }} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="">-- Select Component --</option>
                    {components.filter(c => c.component_type === formData.adjustment_type && c.is_active !== false).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} placeholder="e.g. Outstanding Delivery" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>

              <div className="flex items-center gap-6 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.is_taxable} onChange={e => setFormData({...formData, is_taxable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  <span className="text-sm font-medium text-slate-700">Taxable</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.pf_applicable} onChange={e => setFormData({...formData, pf_applicable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  <span className="text-sm font-medium text-slate-700">PF Applicable</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.esi_applicable} onChange={e => setFormData({...formData, esi_applicable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  <span className="text-sm font-medium text-slate-700">ESI Applicable</span>
                </label>
              </div>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Adjustments Modal (Simulated) */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Bulk Adjustments Upload</h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
               {!csvPreview ? (
                 <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center flex flex-col items-center gap-3">
                   <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
                     <HiUpload className="w-6 h-6" />
                   </div>
                   <div>
                     <p className="text-sm font-bold text-slate-800">Drag & Drop CSV File Here</p>
                     <p className="text-xs text-slate-500 mt-1">Format: email, amount, type (earning/deduction), description</p>
                   </div>
                   <button onClick={handleBulkSimulate} className="mt-4 px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700">Simulate Upload</button>
                 </div>
               ) : (
                 <div>
                   <h3 className="text-sm font-bold text-slate-800 mb-4">Preview Validation</h3>
                   <div className="space-y-2 text-sm">
                     {csvPreview.map(row => (
                       <div key={row.row} className={`p-3 rounded-lg border flex justify-between items-center ${row.status === 'valid' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                         <span className="font-semibold">{row.employee}</span>
                         <span className="text-slate-600 capitalize">{row.type}: ₹{row.amount}</span>
                         {row.status === 'invalid' && <span className="text-xs font-bold text-red-600">{row.error}</span>}
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </div>
            {csvPreview && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                  <button onClick={() => setCsvPreview(null)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition">Reset</button>
                  <button onClick={() => { setIsBulkModalOpen(false); showToast("Bulk batch committed successfully"); }} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200">
                    Commit Valid Rows
                  </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Reject Adjustment</h2>
              <button onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleReject} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea required value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-red-400 outline-none resize-none" placeholder="Provide a reason..." />
              </div>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition shadow-md shadow-red-200">Reject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
