import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../shared/api";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiCalendar, HiChevronLeft, HiChevronRight,
} from "react-icons/hi";
import LeaveRequestCard, { leaveApplicantName } from "../components/LeaveRequestCard";

const HISTORY_LIMIT = 20;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ request, onClose, onRejected }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isCancellation = request.status === "cancellation_pending";
  const name = leaveApplicantName(request);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) { setError("A rejection reason is required."); return; }
    setLoading(true); setError("");
    try {
      await leaveAPI.rejectRequest(request.id, { rejection_reason: reason.trim() });
      onRejected("Leave request rejected.");
    } catch (err) {
      if (err.status === 403) {
        setError("You don't have authority to reject this request.");
      } else {
        setError(err.message || "Failed to reject.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {isCancellation ? "Deny Cancellation Request" : "Reject Leave Request"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isCancellation
                ? <><strong>{name}</strong>'s cancellation will be denied — the leave remains approved.</>  
                : <>Rejecting leave for <strong>{name}</strong></>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Rejection Reason <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Explain why the leave cannot be approved..."
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1 text-right">{reason.length}/1000</p>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Submitting…" : (isCancellation ? "Deny Cancellation" : "Confirm Reject")}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ManagerLeavePage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "pending") {
        const res = await leaveAPI.getTeamPendingRequests();
        setRequests(res.data || []);
      } else {
        const params = { page: historyPage, limit: HISTORY_LIMIT };
        if (historyStatus) params.status = historyStatus;
        const res = await leaveAPI.getTeamRequests(params);
        setHistoryRequests(res.data || []);
      }
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to load leave requests."), "error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, historyStatus, historyPage]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Changing the status filter resets to page 1 in one update so loadRequests fires once.
  function changeHistoryStatus(v) { setHistoryStatus(v); setHistoryPage(1); }

  async function handleApprove(id) {
    setApproving(id);
    try {
      await leaveAPI.approveRequest(id);
      showToast("Leave request approved.");
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      if (err.status === 403) {
        showToast("You don't have authority to approve this request.", "error");
      } else {
        // Surface conflict messages (employee present, balance exceeded)
        showToast(leaveErrorMessage(err, "Failed to approve request."), "error");
      }
    } finally {
      setApproving(null);
    }
  }

  function handleRejectClick(request) {
    setRejectTarget(request);
  }

  function onRejected(msg) {
    setRejectTarget(null);
    showToast(msg);
    setRequests(prev => prev.filter(r => r.id !== rejectTarget?.id));
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const cancellationCount = requests.filter(r => r.status === "cancellation_pending").length;

  return (
    <>
        <DashboardTopBar title="Leave Requests" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">

          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
              <p className="text-sm text-slate-500 mt-1">
                Review and action leave requests from your direct reports.
              </p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab("pending")} 
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "pending" ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Pending Approvals
              </button>
              <button 
                onClick={() => setActiveTab("history")} 
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "history" ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Team History
              </button>
            </div>
          </div>

          {activeTab === "pending" && (
            <div className="flex items-start justify-between mb-6">
              <div />
              {/* Summary pills */}
            <div className="flex gap-2 shrink-0">
              {pendingCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
                  {pendingCount} pending
                </span>
              )}
              {cancellationCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
                  {cancellationCount} cancellation{cancellationCount !== 1 ? "s" : ""}
                </span>
              )}
              </div>
            </div>
          )}

          {/* History filters */}
          {activeTab === "history" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <select value={historyStatus} onChange={e => changeHistoryStatus(e.target.value)}
                className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="cancellation_pending">Cancellation Pending</option>
                <option value="terminated_cancelled">Terminated Cancelled</option>
              </select>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-44 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : activeTab === "history" ? (
            <>
            {historyRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center">
                  <HiCalendar className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No History Found</p>
                <p className="text-xs text-slate-400">{historyStatus ? "No requests match this status filter." : "Your team doesn't have any past leave requests."}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyRequests.map(req => {
                  const name = leaveApplicantName(req);
                  return (
                    <div key={req.id} className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-800">{name}</h4>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm font-semibold text-slate-600">{req.leave_type?.name || "Leave"}</span>
                          <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full border 
                            ${req.status === 'approved' ? 'bg-violet-50 text-violet-700 border-violet-200' : 
                              req.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                              req.status === 'cancelled' ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                              'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'}`}>
                            {req.status?.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(req.start_date).toLocaleDateString()} 
                          {req.start_date !== req.end_date && ` – ${new Date(req.end_date).toLocaleDateString()}`}
                          <span className="mx-2">•</span> 
                          {parseFloat(req.total_days).toFixed(1)} days
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(historyPage > 1 || historyRequests.length >= HISTORY_LIMIT) && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-xs text-slate-400">Page {historyPage}</p>
                <div className="flex gap-2">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                    <HiChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyRequests.length < HISTORY_LIMIT}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                    Next <HiChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            </>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center">
                <HiCheckCircle className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">All caught up!</p>
              <p className="text-xs text-slate-400">No pending leave requests from your team.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ── Pending Approval ── */}
              {requests.filter(r => r.status === "pending").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-fuchsia-500" />
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Pending Approval ({requests.filter(r => r.status === "pending").length})
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {requests.filter(r => r.status === "pending").map(r => (
                      <LeaveRequestCard
                        key={r.id}
                        request={r}
                        onApprove={(req) => handleApprove(req.id)}
                        onReject={handleRejectClick}
                        busy={approving === r.id}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* ── Cancellation Requests ── */}
              {requests.filter(r => r.status === "cancellation_pending").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-fuchsia-500" />
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Cancellation Requests ({requests.filter(r => r.status === "cancellation_pending").length})
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {requests.filter(r => r.status === "cancellation_pending").map(r => (
                      <LeaveRequestCard
                        key={r.id}
                        request={r}
                        onApprove={(req) => handleApprove(req.id)}
                        onReject={handleRejectClick}
                        busy={approving === r.id}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={onRejected}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
