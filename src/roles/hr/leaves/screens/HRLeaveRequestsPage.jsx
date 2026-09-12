import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI, organizationAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiCalendar, HiUserCircle,
  HiThumbUp, HiThumbDown, HiInformationCircle, HiDocumentText, HiSearch,
  HiChevronLeft, HiChevronRight,
} from "react-icons/hi";

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Leave endpoints nest the applicant under `applicant` {id, first_name, last_name, email}.
function applicantName(req) {
  const a = req.applicant || req.user;
  if (!a) return "Employee";
  const full = `${a.first_name || a.profile?.first_name || ""} ${a.last_name || a.profile?.last_name || ""}`.trim();
  return full || a.email || a.name || "Employee";
}
function empId(e) { return e.user_id || e.id || e.employee_id || ""; }
function empLabel(e) {
  if (e.profile?.first_name) return `${e.profile.first_name} ${e.profile.last_name || ""}`.trim();
  if (e.user?.name) return e.user.name;
  return e.name || e.email || empId(e);
}

const STATUS_STYLES = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  terminated_cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  cancellation_pending: "bg-orange-50 text-orange-700 border-orange-200",
};
function StatusPill({ status }) {
  const cls = STATUS_STYLES[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${cls}`}>
      {status?.replace(/_/g, " ") || "—"}
    </span>
  );
}

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
  const name = applicantName(request);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) { setError("A rejection reason is required."); return; }
    setLoading(true); setError("");
    try {
      await leaveAPI.rejectRequest(request.id, { rejection_reason: reason.trim() });
      onRejected(isCancellation ? "Cancellation denied." : "Leave request rejected.");
    } catch (err) {
      setError(leaveErrorMessage(err, "Failed to reject."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isCancellation ? "Deny Cancellation Request" : "Reject Leave Request"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isCancellation
                ? <><strong>{name}</strong>'s cancellation will be denied — the leave stays approved.</>
                : <>Rejecting leave for <strong>{name}</strong></>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><HiX className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rejection Reason <span className="text-red-400">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={1000}
              placeholder="Explain why the leave cannot be approved..."
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none" />
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

// ─── Pending Card ─────────────────────────────────────────────────────────────
function PendingCard({ request, onApprove, onReject, acting }) {
  const name = applicantName(request);
  const isCancellation = request.status === "cancellation_pending";
  const unpaid = parseFloat(request.unpaid_days || 0);

  const [bal, setBal] = useState(null);
  const applicantId = request.applicant?.id ?? request.user_id;
  const leaveTypeId = request.leave_type_id || request.leave_type?.id;
  const paidDays = parseFloat(request.paid_days ?? request.total_days ?? 0);

  async function checkBalance() {
    if (bal && !bal.error) { setBal(null); return; }
    if (!applicantId) { setBal({ error: "Applicant id unavailable." }); return; }
    setBal({ loading: true });
    try {
      const res = await leaveAPI.getTeamMemberBalances(applicantId);
      const row = (res.data || []).find(b => b.leave_type_id === leaveTypeId) || null;
      setBal({ loading: false, row });
    } catch (err) {
      setBal({ loading: false, error: leaveErrorMessage(err, "Couldn't load balance.") });
    }
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isCancellation ? "border-orange-200" : "border-slate-100"}`}>
      {isCancellation && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-orange-50 border-b border-orange-200 text-xs font-semibold text-orange-700">
          <HiInformationCircle className="w-4 h-4" />
          This employee is requesting to cancel a leave that already started. Approving refunds their balance.
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0"><HiUserCircle className="w-6 h-6 text-purple-400" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">{name}</p>
              <StatusPill status={request.status} />
            </div>
            {request.applicant?.email && <p className="text-xs text-slate-400 mb-3 truncate">{request.applicant.email}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Leave Type</p>
                <p className="text-xs font-bold text-slate-700">{request.leave_type?.name || "Leave"}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Dates</p>
                <p className="text-xs font-bold text-slate-700">
                  {formatDate(request.start_date)}{request.start_date !== request.end_date && <> – {formatDate(request.end_date)}</>}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Duration</p>
                <p className="text-xs font-bold text-slate-700">
                  {parseFloat(request.total_days).toFixed(1)} days
                  {request.is_half_day && <span className="ml-1 text-violet-600">({request.half_day_type === "first_half" ? "1st half" : "2nd half"})</span>}
                </p>
                {unpaid > 0 && (
                  <p className="text-[10px] mt-0.5">
                    <span className="text-emerald-600 font-semibold">{parseFloat(request.paid_days || 0).toFixed(1)} paid</span>
                    {" · "}<span className="text-rose-500 font-semibold">{unpaid.toFixed(1)} LWP</span>
                  </p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Applied On</p>
                <p className="text-xs font-bold text-slate-700">{formatDate(request.created_at || request.requested_at)}</p>
              </div>
            </div>
            {request.reason && (
              <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" /><span className="italic">"{request.reason}"</span>
              </div>
            )}
            {request.document_url && (
              <div className="mt-2">
                <a href={request.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition">
                  <HiDocumentText className="w-3.5 h-3.5" /> View Supporting Document
                </a>
              </div>
            )}
          </div>
        </div>
        {bal && (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            {bal.loading ? (
              <span className="text-slate-400">Loading balance…</span>
            ) : bal.error ? (
              <span className="text-red-500">{bal.error}</span>
            ) : bal.row ? (
              (() => {
                const current = parseFloat(bal.row.current_balance);
                const projected = current - paidDays;
                return (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-slate-500">Current <strong className="text-slate-800">{Number.isInteger(current) ? current : current.toFixed(1)}</strong></span>
                    <span className="text-slate-400">− {paidDays.toFixed(1)} paid</span>
                    <span className="text-slate-500">→ after approval <strong className={projected < 0 ? "text-rose-600" : "text-emerald-700"}>{Number.isInteger(projected) ? projected : projected.toFixed(1)}</strong></span>
                    {projected < 0 && (
                      <span className="flex items-center gap-1 text-rose-600 font-semibold"><HiExclamationCircle className="w-3.5 h-3.5" /> Goes negative — approval may hit the overdraft limit.</span>
                    )}
                  </div>
                );
              })()
            ) : (
              <span className="text-slate-400">No balance record for this leave type.</span>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={checkBalance}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl transition mr-auto">
            <HiCalendar className="w-4 h-4" />{bal && !bal.error ? "Hide balance" : "Balance impact"}
          </button>
          <button onClick={() => onReject(request)} disabled={acting === request.id}
            className="flex items-center gap-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl transition disabled:opacity-50">
            <HiThumbDown className="w-4 h-4" />{isCancellation ? "Deny" : "Reject"}
          </button>
          <button onClick={() => onApprove(request.id)} disabled={acting === request.id}
            className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition disabled:opacity-50 shadow-sm shadow-emerald-200">
            {acting === request.id ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiThumbUp className="w-4 h-4" />}
            {acting === request.id ? "Working…" : (isCancellation ? "Approve Cancellation" : "Approve")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const HISTORY_LIMIT = 20;

export default function HRLeaveRequestsPage() {
  const [activeTab, setActiveTab] = useState("pending");

  // Pending queue (org-wide for HR)
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingSearch, setPendingSearch] = useState("");
  const [acting, setActing] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState([]);

  const [toast, setToast] = useState(null);
  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await leaveAPI.getTeamPendingRequests();
      setPending(res.data || []);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to load pending requests."), "error");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = { page, limit: HISTORY_LIMIT };
      if (statusFilter) params.status = statusFilter;
      if (userFilter) params.user_id = userFilter;
      const res = await leaveAPI.getTeamRequests(params);
      setHistory(res.data || []);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to load leave history."), "error");
    } finally {
      setHistoryLoading(false);
    }
  }, [page, statusFilter, userFilter]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { if (activeTab === "history") loadHistory(); }, [activeTab, loadHistory]);

  // Employee list for the history filter (best-effort; non-blocking).
  useEffect(() => {
    organizationAPI.getEmployees({ purpose: "all_hr_list" })
      .then(res => {
        const list = res.data || [];
        setEmployees(Array.isArray(list) ? list : (list.employees || list.members || []));
      })
      .catch(() => {});
  }, []);

  // Changing a filter resets to page 1 in the same update so loadHistory fires once.
  function changeStatus(v) { setStatusFilter(v); setPage(1); }
  function changeUser(v) { setUserFilter(v); setPage(1); }

  async function handleApprove(id) {
    setActing(id);
    try {
      await leaveAPI.approveRequest(id);
      showToast("Leave request approved.");
      setPending(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to approve request."), "error");
    } finally {
      setActing(null);
    }
  }

  function onRejected(msg) {
    const id = rejectTarget?.id;
    setRejectTarget(null);
    showToast(msg);
    setPending(prev => prev.filter(r => r.id !== id));
  }

  const filteredPending = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter(r =>
      applicantName(r).toLowerCase().includes(q) ||
      (r.leave_type?.name || "").toLowerCase().includes(q)
    );
  }, [pending, pendingSearch]);

  const pendingCount = pending.filter(r => r.status === "pending").length;
  const cancellationCount = pending.filter(r => r.status === "cancellation_pending").length;

  return (
    <>
      <DashboardTopBar title="Leave Requests" />
      <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
            <p className="text-sm text-slate-500 mt-1">Review the organisation-wide leave queue, including escalated requests, and view full history.</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab("pending")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "pending" ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Pending Queue
            </button>
            <button onClick={() => setActiveTab("history")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "history" ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              All History
            </button>
          </div>
        </div>

        {/* ─── PENDING ─── */}
        {activeTab === "pending" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div className="relative w-full sm:max-w-xs">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  placeholder="Search by employee or leave type…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{pendingCount} pending
                  </span>
                )}
                {cancellationCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{cancellationCount} cancellation{cancellationCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {pendingLoading ? (
              <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}</div>
            ) : filteredPending.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center"><HiCheckCircle className="w-7 h-7 text-emerald-400" /></div>
                <p className="text-sm font-semibold text-slate-600">{pending.length === 0 ? "All caught up!" : "No matches"}</p>
                <p className="text-xs text-slate-400">{pending.length === 0 ? "No pending leave requests across the organisation." : "No pending requests match your search."}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPending.map(r => (
                  <PendingCard key={r.id} request={r} onApprove={handleApprove} onReject={setRejectTarget} acting={acting} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── HISTORY ─── */}
        {activeTab === "history" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <select value={statusFilter} onChange={e => changeStatus(e.target.value)}
                className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="cancellation_pending">Cancellation Pending</option>
                <option value="terminated_cancelled">Terminated Cancelled</option>
              </select>
              <select value={userFilter} onChange={e => changeUser(e.target.value)}
                className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white sm:max-w-xs">
                <option value="">All employees</option>
                {employees.map(e => (
                  <option key={empId(e)} value={empId(e)}>{empLabel(e)}</option>
                ))}
              </select>
            </div>

            {historyLoading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}</div>
            ) : history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center"><HiCalendar className="w-7 h-7 text-slate-400" /></div>
                <p className="text-sm font-semibold text-slate-600">No leave history found</p>
                <p className="text-xs text-slate-400">{(statusFilter || userFilter) ? "Try clearing the filters." : "No leave requests recorded yet."}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {history.map(req => (
                    <div key={req.id} className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-800">{applicantName(req)}</h4>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm font-semibold text-slate-600">{req.leave_type?.name || "Leave"}</span>
                          <StatusPill status={req.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDate(req.start_date)}{req.start_date !== req.end_date && ` – ${formatDate(req.end_date)}`}
                          <span className="mx-2">•</span>{parseFloat(req.total_days).toFixed(1)} days
                          {parseFloat(req.unpaid_days || 0) > 0 && <span className="ml-2 text-rose-500 font-semibold">{parseFloat(req.unpaid_days).toFixed(1)} LWP</span>}
                        </p>
                      </div>
                      {req.reason && (
                        <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 max-w-[240px] truncate italic">"{req.reason}"</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pagination (page/limit — total meta pending backend B4) */}
                <div className="flex items-center justify-between mt-6">
                  <p className="text-xs text-slate-400">Page {page}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                      <HiChevronLeft className="w-4 h-4" /> Prev
                    </button>
                    <button onClick={() => setPage(p => p + 1)} disabled={history.length < HISTORY_LIMIT}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                      Next <HiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {rejectTarget && <RejectModal request={rejectTarget} onClose={() => setRejectTarget(null)} onRejected={onRejected} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
