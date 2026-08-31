import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiCalendar,
  HiUserCircle, HiClock, HiBan, HiThumbUp, HiThumbDown,
  HiInformationCircle, HiDocumentText,
} from "react-icons/hi";

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" />}
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
  const applicant = request.applicant;
  const name = applicant ? `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || applicant.email : "Employee";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
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
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Rejection Reason <span className="text-red-400">*</span>
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
            <button type="submit" disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Submitting…" : (isCancellation ? "Deny Cancellation" : "Confirm Reject")}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Leave Request Card ───────────────────────────────────────────────────────
function LeaveRequestCard({ request, onApprove, onReject, approving, showToast }) {
  const applicant = request.applicant;
  const name = applicant ? `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() || applicant.email : "Employee";
  const leaveTypeName = request.leave_type?.name || "Leave";

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  const isCancellationPending = request.status === "cancellation_pending";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isCancellationPending ? "border-orange-200" : "border-slate-100"}`}>
      {/* Cancellation banner */}
      {isCancellationPending && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-orange-50 border-b border-orange-200 text-xs font-semibold text-orange-700">
          <HiInformationCircle className="w-4 h-4" />
          This employee is requesting to cancel a leave they already took. Approving will refund their balance.
        </div>
      )}

      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar / Icon */}
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <HiUserCircle className="w-6 h-6 text-purple-400" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">{name}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCancellationPending ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {isCancellationPending ? "Cancellation Pending" : "Pending Approval"}
              </span>
            </div>
            {applicant?.email && (
              <p className="text-xs text-slate-400 mb-3 truncate">{applicant.email}</p>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Leave Type</p>
                <p className="text-xs font-bold text-slate-700">{leaveTypeName}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Dates</p>
                <p className="text-xs font-bold text-slate-700">
                  {fmtDate(request.start_date)}
                  {request.start_date !== request.end_date && <> – {fmtDate(request.end_date)}</>}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Duration</p>
                <p className="text-xs font-bold text-slate-700">
                  {parseFloat(request.total_days).toFixed(1)} days
                  {request.is_half_day && <span className="ml-1 text-violet-600">({request.half_day_type === "first_half" ? "1st half" : "2nd half"})</span>}
                </p>
                {parseFloat(request.unpaid_days || 0) > 0 && (
                  <p className="text-[10px] mt-0.5">
                    <span className="text-emerald-600 font-semibold">{parseFloat(request.paid_days || 0).toFixed(1)} paid</span>
                    {" · "}
                    <span className="text-rose-500 font-semibold">{parseFloat(request.unpaid_days).toFixed(1)} LWP</span>
                  </p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Applied On</p>
                <p className="text-xs font-bold text-slate-700">{fmtDate(request.created_at || request.requested_at)}</p>
              </div>
            </div>

            {request.reason && (
              <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                <span className="italic">"{request.reason}"</span>
              </div>
            )}
            {request.document_url && (
              <div className="mt-2">
                <a
                  href={request.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition"
                >
                  <HiDocumentText className="w-3.5 h-3.5" />
                  View Supporting Document
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={() => onReject(request)}
            disabled={approving === request.id}
            className="flex items-center gap-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl transition disabled:opacity-50"
          >
            <HiThumbDown className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => onApprove(request.id)}
            disabled={approving === request.id}
            className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition disabled:opacity-50 shadow-sm shadow-emerald-200"
          >
            {approving === request.id ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <HiThumbUp className="w-4 h-4" />
            )}
            {approving === request.id ? "Approving…" : (isCancellationPending ? "Approve Cancellation" : "Approve")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ManagerLeavePage() {
  const [requests, setRequests] = useState([]);
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
      const res = await leaveAPI.getTeamPendingRequests();
      setRequests(res.data || []);
    } catch {
      showToast("Failed to load leave requests.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

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
        showToast(err.message || "Failed to approve request.", "error");
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
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col overflow-hidden">
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
            {/* Summary pills */}
            <div className="flex gap-2 shrink-0">
              {pendingCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {pendingCount} pending
                </span>
              )}
              {cancellationCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {cancellationCount} cancellation{cancellationCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-44 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center">
                <HiCheckCircle className="w-7 h-7 text-emerald-400" />
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
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Pending Approval ({requests.filter(r => r.status === "pending").length})
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {requests.filter(r => r.status === "pending").map(r => (
                      <LeaveRequestCard
                        key={r.id}
                        request={r}
                        onApprove={handleApprove}
                        onReject={handleRejectClick}
                        approving={approving}
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
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Cancellation Requests ({requests.filter(r => r.status === "cancellation_pending").length})
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {requests.filter(r => r.status === "cancellation_pending").map(r => (
                      <LeaveRequestCard
                        key={r.id}
                        request={r}
                        onApprove={handleApprove}
                        onReject={handleRejectClick}
                        approving={approving}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Reject Modal */}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={onRejected}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
