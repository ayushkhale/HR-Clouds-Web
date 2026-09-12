import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiX,
  HiClock,
  HiSearch,
  HiFilter
} from "react-icons/hi";
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

function RejectModal({ req, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError("Rejection reason is required."); return; }
    setLoading(true);
    setError("");
    try {
      await attendanceAPI.rejectRegularization(req.id, { reason });
      onConfirm("Regularization request rejected.");
    } catch (err) {
      setError(err.message || "Failed to reject request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Reject Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm font-semibold flex items-center gap-2">
              <HiExclamationCircle className="w-5 h-5" /> <p>{error}</p>
            </div>
          )}
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Reason for rejection <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400 focus:bg-white transition-all resize-none h-24"
            placeholder="Please explain why this request is being rejected..."
          />
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition">
              {loading ? "Rejecting..." : "Reject Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AttendanceRegularizationsHRPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState("pending"); // pending, approved, rejected, all
  
  const [actionReq, setActionReq] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve', 'reject'
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getOrgRegularizations({ status: filter === "all" ? "" : filter });
      setRequests(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load regularizations.", "error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await attendanceAPI.approveRegularization(id);
      showToast("Regularization request approved.");
      loadRequests();
    } catch (err) {
      showToast(err.message || "Failed to approve request.", "error");
    } finally {
      setActionLoading(null);
      setActionReq(null);
    }
  };

  const confirmAction = (req, type) => {
    setActionReq(req);
    setActionType(type);
    if (type === 'approve') {
      handleApprove(req.id);
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <>
        <DashboardTopBar title="Regularization Requests" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiClock className="text-purple-600 w-6 h-6" />
                Regularizations
              </h1>
              <p className="text-sm text-slate-500 mt-1">Manage organization-wide attendance regularization requests.</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
              {['pending', 'approved', 'rejected', 'all'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg capitalize transition-colors ${filter === status ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Skeleton type="table" rows={6} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {requests.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                    <HiClock className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">No requests found</h3>
                  <p className="text-sm text-slate-500 mt-1">There are no {filter !== "all" ? filter : ""} regularization requests to show.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4">Employee</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Requested Times</th>
                        <th className="px-6 py-4">Reason</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                {req.user?.name?.charAt(0) || "U"}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{req.user?.name || "Unknown User"}</p>
                                <p className="text-[10px] text-slate-500">{req.user?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700">{fmtDate(req.date)}</td>
                          <td className="px-6 py-4">
                            <div className="text-xs space-y-1">
                              <div className="flex gap-2"><span className="w-6 text-slate-400 font-medium">In:</span> <span className="font-semibold">{req.check_in_time ? fmtTime(req.check_in_time) : "—"}</span></div>
                              <div className="flex gap-2"><span className="w-6 text-slate-400 font-medium">Out:</span> <span className="font-semibold">{req.check_out_time ? fmtTime(req.check_out_time) : "—"}</span></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 max-w-[200px] truncate" title={req.reason}>
                            {req.reason || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full border capitalize
                              ${req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                req.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 
                                'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {req.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => confirmAction(req, 'approve')}
                                  disabled={actionLoading === req.id}
                                  className="px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
                                >
                                  {actionLoading === req.id && actionType === 'approve' ? "..." : "Approve"}
                                </button>
                                <button 
                                  onClick={() => confirmAction(req, 'reject')}
                                  disabled={actionLoading === req.id}
                                  className="px-3 py-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>

      {actionReq && actionType === 'reject' && (
        <RejectModal 
          req={actionReq} 
          onClose={() => setActionReq(null)} 
          onConfirm={(msg) => {
            setActionReq(null);
            showToast(msg);
            loadRequests();
          }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
