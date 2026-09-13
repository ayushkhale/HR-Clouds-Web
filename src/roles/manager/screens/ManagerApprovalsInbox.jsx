import React, { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, leaveAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { formatDate } from "../../../shared/utils/formatUtils";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import { listFrom } from "../../../shared/attendance/normalize";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../../../shared/attendance/events";
import {
  HiCheckCircle, HiXCircle, HiX, HiClock, HiCalendar, HiExclamationCircle, HiGift, HiDocumentText, HiUserCircle, HiThumbUp, HiThumbDown, HiInformationCircle
} from "react-icons/hi";

// Resolve a displayable employee name across the different request shapes this
// inbox aggregates. Leave requests nest the applicant under `applicant`
// (first_name/last_name/email); attendance requests use `user.profile`/`user.name`.
function resolveRequesterName(item) {
  const a = item.applicant;
  if (a) {
    const full = `${a.first_name || ""} ${a.last_name || ""}`.trim();
    if (full) return full;
    if (a.email) return a.email;
  }
  if (item.user?.profile) {
    const full = `${item.user.profile.first_name || ""} ${item.user.profile.last_name || ""}`.trim();
    if (full) return full;
  }
  return item.user?.name || item.user?.email || "Unknown";
}

// The user id to look up balances for, across request shapes.
function resolveRequesterId(item) {
  return item.applicant?.id ?? item.user_id ?? item.user?.id ?? null;
}

function LeaveInboxCard({ item, onApprove, onReject, showToast }) {
  const empName = resolveRequesterName(item);
  const isCancellation = item.status === "cancellation_pending";
  const [bal, setBal] = useState(null);
  const applicantId = resolveRequesterId(item);
  const leaveTypeId = item.leave_type_id || item.leave_type?.id;
  const paidDays = parseFloat(item.paid_days ?? item.total_days ?? 0);
  const unpaid = parseFloat(item.unpaid_days || 0);

  async function checkBalance() {
    if (bal && !bal.error) { setBal(null); return; }
    if (!applicantId) { showToast("Applicant id unavailable.", "error"); return; }
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
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden mb-4 ${isCancellation ? "border-orange-200" : "border-slate-100"}`}>
      {isCancellation && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-orange-50 border-b border-orange-200 text-xs font-semibold text-orange-700">
          <HiInformationCircle className="w-4 h-4" />
          This employee is requesting to cancel an approved leave. Approving will refund their balance.
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <HiUserCircle className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="text-sm font-bold text-slate-800">{empName}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCancellation ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {isCancellation ? "Cancellation Pending" : "Pending Approval"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Leave Type</p>
                <p className="text-xs font-bold text-slate-700">{item.leave_type?.name || "Leave"}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Dates</p>
                <p className="text-xs font-bold text-slate-700">
                  {(() => {
                    const start = formatDate(item.start_date || item.date);
                    const end = formatDate(item.end_date || item.date);
                    return start === end ? start : `${start} – ${end}`;
                  })()}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Duration</p>
                <p className="text-xs font-bold text-slate-700">
                  {parseFloat(item.total_days || 1).toFixed(1)} days
                  {item.is_half_day && <span className="ml-1 text-violet-600">({item.half_day_type === "first_half" ? "1st half" : "2nd half"})</span>}
                </p>
                {unpaid > 0 && (
                  <p className="text-[10px] mt-0.5">
                    <span className="text-emerald-600 font-semibold">{paidDays.toFixed(1)} paid</span>
                    {" · "}
                    <span className="text-rose-500 font-semibold">{unpaid.toFixed(1)} LWP</span>
                  </p>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Applied On</p>
                <p className="text-xs font-bold text-slate-700">{formatDate(item.created_at || item.requested_at)}</p>
              </div>
            </div>

            {item.reason && (
              <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                <span className="italic">"{item.reason}"</span>
              </div>
            )}

            {item.document_url && (
              <div className="mt-2">
                <a href={item.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition">
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
          <button onClick={checkBalance} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl transition mr-auto">
            <HiCalendar className="w-4 h-4" />{bal && !bal.error ? "Hide balance" : "Balance impact"}
          </button>
          <button onClick={() => onReject(item)} className="flex items-center gap-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl transition">
            <HiThumbDown className="w-4 h-4" />{isCancellation ? "Deny" : "Reject"}
          </button>
          <button onClick={() => onApprove(item)} className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition shadow-sm shadow-emerald-200">
            <HiThumbUp className="w-4 h-4" />{isCancellation ? "Approve Cancellation" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Attendance tabs use the shared approval queue (same dialog, remarks rules and
// refresh behaviour as the per-type pages). The leave branch is unchanged.
const ATTENDANCE_TABS = {
  regularizations: "regularization",
  overtime: "overtime",
  compOffs: "compoff",
  anomalies: "anomaly",
};

function ManagerApprovalsInbox() {
  const [activeTab, setActiveTab] = useState("regularizations");
  const [counts, setCounts] = useState({ regularizations: 0, overtime: 0, compOffs: 0, anomalies: 0 });
  const [leaves, setLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [actionModal, setActionModal] = useState({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAttendanceCounts = useCallback(async () => {
    const [reg, ot, co, an] = await Promise.allSettled([
      attendanceAPI.getManagerPendingRegularizations(),
      attendanceAPI.getManagerPendingOvertime(),
      attendanceAPI.getManagerCompOffs(),
      attendanceAPI.getManagerAnomalies(),
    ]);
    const size = (r) => (r.status === "fulfilled" ? listFrom(r.value, ["requests", "anomalies", "comp_offs", "overtime"]).length : 0);
    setCounts({ regularizations: size(reg), overtime: size(ot), compOffs: size(co), anomalies: size(an) });
  }, []);

  const fetchLeaves = useCallback(async () => {
    setLeavesLoading(true);
    try {
      const res = await leaveAPI.getTeamPendingRequests();
      setLeaves(res.success ? (res.data || []) : []);
    } catch {
      setLeaves([]);
    } finally {
      setLeavesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendanceCounts();
    fetchLeaves();
  }, [fetchAttendanceCounts, fetchLeaves]);
  useAttendanceChanged(INBOX_EVENT_KINDS, fetchAttendanceCounts);

  const onQueueCount = useCallback((type, n) => {
    const tab = Object.keys(ATTENDANCE_TABS).find((k) => ATTENDANCE_TABS[k] === type);
    if (tab) setCounts((c) => (c[tab] === n ? c : { ...c, [tab]: n }));
  }, []);

  const closeLeaveModal = () => {
    if (submitting) return;
    setActionModal({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
    setRemarks("");
  };

  const handleLeaveAction = async () => {
    const { action, id } = actionModal;
    if (submitting) return;
    const payload = action === "reject" ? { rejection_reason: remarks, remarks } : { remarks };
    setSubmitting(true);
    try {
      const res = action === "approve" ? await leaveAPI.approveRequest(id, payload) : await leaveAPI.rejectRequest(id, payload);
      if (res && res.success) {
        showToast(`Successfully ${action === "approve" ? "approved" : "rejected"} request!`);
        setActionModal({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
        setRemarks("");
        fetchLeaves();
      } else {
        showToast(res?.message || "Action failed", "error");
      }
    } catch (err) {
      showToast(leaveErrorMessage(err, "Action failed"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    { id: "leaves", label: "Leaves", icon: HiDocumentText, count: leaves.length },
    { id: "regularizations", label: "Regularizations", icon: HiClock, count: counts.regularizations },
    { id: "overtime", label: "Overtime", icon: HiCalendar, count: counts.overtime },
    { id: "compOffs", label: `${DICTIONARY.TERMS.COMP_OFF}s`, icon: HiGift, count: counts.compOffs },
    { id: "anomalies", label: "Flags", icon: HiExclamationCircle, count: counts.anomalies },
  ];

  const renderLeaves = () => {
    if (leavesLoading) return <div className="p-8 text-center text-slate-500">Loading requests...</div>;
    if (leaves.length === 0) return <div className="p-12 text-center text-slate-400 font-medium">No pending leave requests.</div>;
    return (
      <div className="p-4 bg-slate-50/50">
        {leaves.map(item => (
          <LeaveInboxCard
            key={item.id}
            item={item}
            onApprove={(req) => {
              const empName = resolveRequesterName(req);
              const isCxl = req.status === "cancellation_pending";
              setActionModal({ isOpen: true, action: "approve", id: req.id, title: isCxl ? `Approve cancellation for ${empName}` : `Approve Request for ${empName}`, isCancellation: isCxl });
            }}
            onReject={(req) => {
              const empName = resolveRequesterName(req);
              const isCxl = req.status === "cancellation_pending";
              setActionModal({ isOpen: true, action: "reject", id: req.id, title: isCxl ? `Deny cancellation for ${empName}` : `Reject Request for ${empName}`, isCancellation: isCxl });
            }}
            showToast={showToast}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <DashboardTopBar title="Approvals Inbox" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals Inbox</h1>
          <p className="text-sm text-slate-500 mt-1">Review and action pending requests from your reporting line.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto border-b border-slate-100 hide-scrollbar" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-purple-600 text-purple-700 bg-purple-50/50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-purple-600" : "text-slate-400"}`} />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? "bg-purple-200 text-purple-800" : "bg-slate-100 text-slate-500"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeTab === "leaves"
            ? renderLeaves()
            : <AttendanceApprovalQueue key={activeTab} type={ATTENDANCE_TABS[activeTab]} onCountChange={onQueueCount} />}
        </div>
      </main>

      {/* Leave Action Modal */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{actionModal.title}</h3>
              <button onClick={closeLeaveModal} className="text-slate-400 hover:text-slate-600">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionModal.isCancellation ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 text-xs font-medium text-orange-700 rounded-xl">
                  <HiInformationCircle className="w-5 h-5 shrink-0" />
                  {actionModal.action === "approve" ? "Approving this will cancel the approved leave and refund the employee's leave balance." : "Denying this will keep the approved leave active."}
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Are you sure you want to <strong>{actionModal.action}</strong> this request?
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Remarks {actionModal.action === "reject" ? "(Required)" : "(Optional)"}</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={actionModal.action === "reject" ? "Enter rejection reason..." : "Enter any remarks..."}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 min-h-[80px]"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeLeaveModal} disabled={submitting} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleLeaveAction}
                disabled={submitting || (actionModal.action === "reject" && !remarks.trim())}
                className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  actionModal.action === "approve" ? "bg-purple-600 hover:bg-purple-700" : "bg-rose-500 hover:bg-rose-600"
                }`}>
                {submitting ? "Saving…" : actionModal.action === "approve" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 ${toast.type === "error" ? "bg-rose-500 text-white" : "bg-purple-600 text-white"}`}>
          {toast.type === "error" ? <HiXCircle className="w-5 h-5" /> : <HiCheckCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}

export default ManagerApprovalsInbox;
