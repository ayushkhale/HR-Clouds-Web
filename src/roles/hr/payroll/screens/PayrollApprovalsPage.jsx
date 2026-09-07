import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCheck, HiClipboardList } from "react-icons/hi";
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

export default function PayrollApprovalsPage() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getProposals({ status: 'proposed' });
      setProposals(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load proposals", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const handleApprove = async (id) => {
    try {
      await payrollAPI.approveProposal(id);
      showToast("Proposal approved successfully");
      loadProposals();
    } catch (err) {
      showToast(err.message || "Failed to approve proposal", "error");
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) return showToast("Reason is required", "error");
    try {
      await payrollAPI.rejectProposal(rejectingId, { rejection_reason: rejectionReason });
      showToast("Proposal rejected");
      setRejectingId(null);
      setRejectionReason("");
      loadProposals();
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Salary Approvals" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiClipboardList className="text-purple-600 w-7 h-7" /> Maker-Checker Queue
            </h1>
            <p className="text-sm text-slate-500 mt-1">Review and approve salary structures proposed by managers or other HRs.</p>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                    <th className="px-6 py-4 border-b border-slate-100">Proposed CTC</th>
                    <th className="px-6 py-4 border-b border-slate-100">Effective Date</th>
                    <th className="px-6 py-4 border-b border-slate-100">Type / Reason</th>
                    <th className="px-6 py-4 border-b border-slate-100">Proposed By</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {proposals.map(prop => (
                    <tr key={prop.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{prop.employee?.name || prop.user_id}</td>
                      <td className="px-6 py-4 font-black text-purple-700">₹{parseFloat(prop.annual_ctc || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-600">{new Date(prop.effective_from).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className="capitalize font-semibold text-slate-700">{prop.revision_type}</span>
                        {prop.revision_reason && <p className="text-xs text-slate-400 mt-1">{prop.revision_reason}</p>}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{prop.proposer?.name || prop.proposed_by}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleApprove(prop.id)} className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition flex items-center gap-1">
                            <HiCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button onClick={() => setRejectingId(prop.id)} className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition flex items-center gap-1">
                            <HiX className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {proposals.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No pending proposals in the queue.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Reject Proposal</h2>
              <button onClick={() => { setRejectingId(null); setRejectionReason(""); }} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleReject} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea required value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={3} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-red-400 outline-none resize-none" placeholder="Provide a reason for the manager..." />
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
