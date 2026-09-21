import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI, organizationAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiCalendar,
  HiThumbUp, HiThumbDown, HiInformationCircle, HiDocumentText, HiSearch,
  HiChevronLeft, HiChevronRight, HiScale,
} from "react-icons/hi";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Leave endpoints nest the applicant under `applicant` {id, first_name, last_name, email}.
function applicantName(req) {
  const a = req.applicant || req.user;
  if (!a) return "Employee";
  const full = `${a.first_name || a.profile?.first_name || ""} ${a.last_name || a.profile?.last_name || ""}`.trim();
  return full || a.email || a.name || "Employee";
}
const applicantEmail = (req) => {
  const a = req.applicant || req.user || {};
  return a.email || a.identifier || "";
};
function empId(e) { return e.user_id || e.id || e.employee_id || ""; }
function empLabel(e) {
  if (e.profile?.first_name) return `${e.profile.first_name} ${e.profile.last_name || ""}`.trim();
  if (e.user?.name) return e.user.name;
  return e.name || e.email || empId(e);
}

const ACTIONABLE = ["pending", "cancellation_pending"];
const statusLabel = (status) => (status ? status.replace(/_/g, " ") : "N/A");

/** "1 day" / "2.5 days"; null when the value is missing. */
function fmtDays(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;
}
const dateRange = (req) =>
  req.start_date && req.end_date && req.start_date !== req.end_date
    ? `${formatDate(req.start_date)} – ${formatDate(req.end_date)}`
    : formatDate(req.start_date);

const STATUS_STYLES = {
  approved: "bg-violet-50 text-violet-700 border-violet-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  terminated_cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  pending: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  cancellation_pending: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
};
function StatusPill({ status }) {
  const cls = STATUS_STYLES[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

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
// Sits above the request preview (DetailDialog is z-[140]).
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
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isCancellation ? "Deny Cancellation Request" : "Reject Leave Request"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isCancellation
                ? <><strong>{name}</strong>&apos;s cancellation will be denied — the leave stays approved.</>
                : <>Rejecting leave for <strong>{name}</strong></>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><HiX className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rejection Reason <span className="text-rose-400">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={1000}
              placeholder="Explain why the leave cannot be approved..."
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none" />
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

// ─── Request table ────────────────────────────────────────────────────────────
function LeaveTable({ rows, onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-slate-100">
              {["Employee", "Leave Type", "Dates", "Days", "Applied On", "Status"].map((h) => (
                <th key={h} className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => {
              const name = applicantName(r);
              const email = applicantEmail(r);
              const unpaid = parseFloat(r.unpaid_days || 0);
              return (
                <tr key={r.id} {...rowPreviewProps(() => onOpen(r), `View ${name}'s leave request`)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 text-xs"><GenderAvatar person={r.applicant || r.user} name={name} /></div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                        {email && email !== name && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-semibold text-slate-700">{r.leave_type?.name || "Leave"}</p>
                    {r.status === "cancellation_pending" && <p className="text-[10px] font-semibold text-fuchsia-600">Cancellation request</p>}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">{dateRange(r)}</td>
                  <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                    {fmtDays(r.total_days) || "N/A"}
                    {r.is_half_day && <span className="block text-[10px] text-slate-400">{r.half_day_type === "first_half" ? "First half" : "Second half"}</span>}
                    {unpaid > 0 && <span className="block text-[10px] font-semibold text-rose-500">{fmtDays(unpaid)} unpaid</span>}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{formatDate(r.created_at || r.requested_at)}</td>
                  <td className="px-6 py-4"><StatusPill status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyCard({ icon: Icon, title, message }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
      <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center"><Icon className="w-7 h-7 text-purple-400" /></div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="text-xs text-slate-400">{message}</p>
    </div>
  );
}

const TableSkeleton = () => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
    {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />)}
  </div>
);

// ─── Request preview ──────────────────────────────────────────────────────────
function useBalanceImpact(request, enabled) {
  const [state, setState] = useState({ loading: enabled, row: null, error: "" });
  const applicantId = request.applicant?.id ?? request.user_id;
  const leaveTypeId = request.leave_type_id || request.leave_type?.id;

  useEffect(() => {
    if (!enabled) return undefined;
    if (!applicantId) { setState({ loading: false, row: null, error: "The applicant couldn't be identified." }); return undefined; }
    let alive = true;
    setState({ loading: true, row: null, error: "" });
    leaveAPI.getTeamMemberBalances(applicantId)
      .then((res) => alive && setState({ loading: false, row: (res.data || []).find((b) => b.leave_type_id === leaveTypeId) || null, error: "" }))
      .catch((err) => alive && setState({ loading: false, row: null, error: leaveErrorMessage(err, "Couldn't load the balance.") }));
    return () => { alive = false; };
  }, [enabled, applicantId, leaveTypeId]);

  return state;
}

function LeavePreview({ request, acting, onApprove, onReject, onClose }) {
  const name = applicantName(request);
  const email = applicantEmail(request);
  const canAct = ACTIONABLE.includes(request.status);
  const isCancellation = request.status === "cancellation_pending";
  const paidDays = parseFloat(request.paid_days ?? request.total_days ?? 0) || 0;
  const balance = useBalanceImpact(request, canAct);
  const busy = acting === request.id;

  const current = balance.row ? parseFloat(balance.row.current_balance) : null;
  const after = Number.isFinite(current) ? current - paidDays : null;
  const fmtBal = (n) => (Number.isFinite(n) ? (Number.isInteger(n) ? n : n.toFixed(1)) : null);

  return (
    <DetailDialog
      eyebrow={isCancellation ? "Leave cancellation request" : "Leave request"}
      icon={HiCalendar}
      title={name}
      subtitle={email && email !== name ? email : undefined}
      badge={<DetailPill>{statusLabel(request.status)}</DetailPill>}
      onClose={onClose}
      footer={canAct && (
        <>
          <button onClick={() => onReject(request)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
            <HiThumbDown className="w-4 h-4" /> {isCancellation ? "Deny cancellation" : "Reject"}
          </button>
          <button onClick={() => onApprove(request)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiThumbUp className="w-4 h-4" />}
            {busy ? "Working…" : isCancellation ? "Approve cancellation" : "Approve"}
          </button>
        </>
      )}
    >
      {isCancellation && (
        <div className="flex items-start gap-2 text-sm font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-3">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5" />
          This employee wants to cancel a leave that has already started. Approving refunds their balance.
        </div>
      )}

      <DetailSection title="Leave details" icon={HiCalendar}>
        <DetailGrid
          items={[
            ["Leave type", request.leave_type?.name || "Leave"],
            ["From", formatDate(request.start_date)],
            ["To", formatDate(request.end_date)],
            ["Total", fmtDays(request.total_days)],
            ["Half day", request.is_half_day ? (request.half_day_type === "first_half" ? "First half" : "Second half") : "No"],
            ["Paid", fmtDays(request.paid_days ?? request.total_days)],
            ["Unpaid", fmtDays(request.unpaid_days ?? 0)],
            ["Applied on", formatDate(request.created_at || request.requested_at)],
          ]}
        />
      </DetailSection>

      <DetailSection
        title="Reason"
        icon={HiDocumentText}
        action={request.document_url && (
          <a href={request.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 px-3 py-1.5 rounded-lg transition">
            <HiDocumentText className="w-3.5 h-3.5" /> View document
          </a>
        )}
      >
        <DetailText>{request.reason}</DetailText>
        {request.rejection_reason && <div className="mt-4"><DetailText label="Rejection reason">{request.rejection_reason}</DetailText></div>}
      </DetailSection>

      {canAct && (
        <DetailSection title="Balance impact" icon={HiScale}>
          {balance.loading ? (
            <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-label="Loading balance" />
          ) : balance.error ? (
            <p className="text-sm text-rose-600">{balance.error}</p>
          ) : !balance.row ? (
            <p className="text-sm text-slate-500">No balance record exists for this leave type.</p>
          ) : (
            <>
              <DetailGrid
                cols={3}
                items={[
                  ["Current balance", fmtBal(current)],
                  [isCancellation ? "Days involved" : "Paid days used", fmtBal(paidDays)],
                  [isCancellation ? "Balance if denied" : "Balance after approval", fmtBal(after)],
                ]}
              />
              {!isCancellation && after < 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                  <HiExclamationCircle className="w-4 h-4" /> The balance goes below zero — approval may be refused by the overdraft limit.
                </p>
              )}
            </>
          )}
        </DetailSection>
      )}
    </DetailDialog>
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
  const [preview, setPreview] = useState(null);

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

  // A decision drops the request from the queue and refreshes history if it's open.
  function afterDecision(id) {
    setPending(prev => prev.filter(r => r.id !== id));
    if (activeTab === "history") loadHistory();
  }

  async function handleApprove(request) {
    setActing(request.id);
    try {
      await leaveAPI.approveRequest(request.id);
      showToast(request.status === "cancellation_pending" ? "Cancellation approved." : "Leave request approved.");
      setPreview(null);
      afterDecision(request.id);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to approve request."), "error");
    } finally {
      setActing(null);
    }
  }

  function onRejected(msg) {
    const id = rejectTarget?.id;
    setRejectTarget(null);
    setPreview(null);
    showToast(msg);
    afterDecision(id);
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
            <p className="text-sm text-slate-500 mt-1">Review the organisation-wide leave queue, including escalated requests. Click a row to see the full request.</p>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="relative w-full sm:max-w-xs">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  placeholder="Search by employee or leave type…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />{pendingCount} pending
                  </span>
                )}
                {cancellationCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />{cancellationCount} cancellation{cancellationCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {pendingLoading ? (
              <TableSkeleton />
            ) : filteredPending.length === 0 ? (
              <EmptyCard
                icon={HiCheckCircle}
                title={pending.length === 0 ? "All caught up!" : "No matches"}
                message={pending.length === 0 ? "No pending leave requests across the organisation." : "No pending requests match your search."}
              />
            ) : (
              <LeaveTable rows={filteredPending} onOpen={setPreview} />
            )}
          </>
        )}

        {/* ─── HISTORY ─── */}
        {activeTab === "history" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
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
              <PersonSelect className="sm:w-72" people={employees} value={userFilter} onChange={(id) => changeUser(id)} clearLabel="All employees" aria-label="Filter by employee" />
            </div>

            {historyLoading ? (
              <TableSkeleton />
            ) : history.length === 0 ? (
              <EmptyCard
                icon={HiCalendar}
                title="No leave history found"
                message={(statusFilter || userFilter) ? "Try clearing the filters." : "No leave requests recorded yet."}
              />
            ) : (
              <>
                <LeaveTable rows={history} onOpen={setPreview} />

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

      {preview && (
        <LeavePreview
          key={preview.id}
          request={preview}
          acting={acting}
          onApprove={handleApprove}
          onReject={setRejectTarget}
          onClose={() => setPreview(null)}
        />
      )}
      {rejectTarget && <RejectModal request={rejectTarget} onClose={() => setRejectTarget(null)} onRejected={onRejected} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
