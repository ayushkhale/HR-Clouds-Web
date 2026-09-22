import React, { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import InboxCard from "../../../shared/components/InboxCard";
import { attendanceAPI, leaveAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import LeaveRequestCard, { leaveApplicantName } from "../components/LeaveRequestCard";
import { listFrom } from "../../../shared/attendance/normalize";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../../../shared/attendance/events";
import {
  HiCheckCircle, HiXCircle, HiX, HiClock, HiCalendar, HiExclamationCircle, HiGift, HiDocumentText,
  HiInformationCircle, HiRefresh,
} from "react-icons/hi";

// Same shape as the HR inbox: one card per queue, the chosen one opens below.
// Attendance queues run through the shared approval queue (same dialog, remarks
// rules and refresh behaviour as the per-type pages); leave keeps its own cards.
const GROUP = {
  title: "Time & leave",
  cols: "lg:grid-cols-3 xl:grid-cols-5",
  items: [
    { key: "leaves", label: "Leave requests", hint: "Leave and cancellation requests", icon: HiDocumentText },
    { key: "regularizations", label: DICTIONARY.TERMS.REGULARIZATION + "s", hint: "Missed or wrong punches to fix", icon: HiClock, queue: "regularization" },
    { key: "overtime", label: "Overtime", hint: "Extra hours waiting for approval", icon: HiCalendar, queue: "overtime" },
    { key: "compOffs", label: DICTIONARY.TERMS.COMP_OFF, hint: "Holiday work to credit", icon: HiGift, queue: "compoff" },
    { key: "anomalies", label: "Attendance flags", hint: "Unusual attendance to resolve", icon: HiExclamationCircle, queue: "anomaly" },
  ],
};
const ATTENDANCE_TABS = Object.fromEntries(GROUP.items.filter((i) => i.queue).map((i) => [i.key, i.queue]));

function ManagerApprovalsInbox() {
  const [selectedKey, setSelectedKey] = useState("regularizations");
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
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

  // A queue that fails to load shows N/A rather than a confident zero.
  const fetchAttendanceCounts = useCallback(async () => {
    setLoading(true);
    const [reg, ot, co, an] = await Promise.allSettled([
      attendanceAPI.getManagerPendingRegularizations(),
      attendanceAPI.getManagerPendingOvertime(),
      attendanceAPI.getManagerCompOffs(),
      attendanceAPI.getManagerAnomalies(),
    ]);
    const size = (r) => (r.status === "fulfilled" ? listFrom(r.value, ["requests", "anomalies", "comp_offs", "overtime"]).length : null);
    setCounts((c) => ({ ...c, regularizations: size(reg), overtime: size(ot), compOffs: size(co), anomalies: size(an) }));
    setLoading(false);
  }, []);

  const fetchLeaves = useCallback(async () => {
    setLeavesLoading(true);
    try {
      const res = await leaveAPI.getTeamPendingRequests();
      const rows = res.success ? (res.data || []) : [];
      setLeaves(rows);
      setCounts((c) => ({ ...c, leaves: rows.length }));
    } catch {
      setLeaves([]);
      setCounts((c) => ({ ...c, leaves: null }));
    } finally {
      setLeavesLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchAttendanceCounts();
    fetchLeaves();
  }, [fetchAttendanceCounts, fetchLeaves]);

  useEffect(() => { refresh(); }, [refresh]);
  useAttendanceChanged(INBOX_EVENT_KINDS, fetchAttendanceCounts);

  // The open attendance queue reports its own length after every reload.
  const onQueueCount = useCallback((type, n) => {
    const key = Object.keys(ATTENDANCE_TABS).find((k) => ATTENDANCE_TABS[k] === type);
    if (key) setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }));
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

  const renderLeaves = () => {
    if (leavesLoading) return <div className="p-8 text-center text-slate-500">Loading requests...</div>;
    if (leaves.length === 0) return <div className="p-12 text-center text-slate-400 font-medium">No pending leave requests.</div>;
    return (
      <div className="p-4 bg-slate-50/50 space-y-3">
        {leaves.map(item => (
          <LeaveRequestCard
            key={item.id}
            item={item}
            onApprove={(req) => {
              const empName = leaveApplicantName(req);
              const isCxl = req.status === "cancellation_pending";
              setActionModal({ isOpen: true, action: "approve", id: req.id, title: isCxl ? `Approve cancellation for ${empName}` : `Approve Request for ${empName}`, isCancellation: isCxl });
            }}
            onReject={(req) => {
              const empName = leaveApplicantName(req);
              const isCxl = req.status === "cancellation_pending";
              setActionModal({ isOpen: true, action: "reject", id: req.id, title: isCxl ? `Deny cancellation for ${empName}` : `Reject Request for ${empName}`, isCancellation: isCxl });
            }}
            showToast={showToast}
          />
        ))}
      </div>
    );
  };

  const selected = GROUP.items.find((i) => i.key === selectedKey);
  const waiting = GROUP.items.reduce((sum, i) => sum + (counts[i.key] || 0), 0);
  const busy = loading || leavesLoading;

  return (
    <>
      <DashboardTopBar title="Inbox" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
            <p className="text-sm text-slate-500 mt-1">
              {busy && !waiting ? "Checking every approval queue…" : `${waiting} item${waiting === 1 ? "" : "s"} waiting across your team.`}
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={busy} className="inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-4 py-2.5 rounded-xl transition disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <section className="space-y-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{GROUP.title}</h2>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${GROUP.cols}`}>
            {GROUP.items.map((item) => (
              <InboxCard key={item.key} item={item} count={counts[item.key]} loading={busy} selected={item.key === selectedKey} onSelect={setSelectedKey} />
            ))}
          </div>

          {selected && (
            <div key={selected.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><selected.icon className="w-4 h-4" /></span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Pending {selected.label.toLowerCase()}</h3>
                  <p className="text-[11px] text-slate-400">{selected.queue ? "Click a row to review and decide." : "Approve or reject each request below."}</p>
                </div>
              </div>
              {selected.queue
                ? <AttendanceApprovalQueue key={selected.key} type={selected.queue} onCountChange={onQueueCount} />
                : renderLeaves()}
            </div>
          )}
        </section>
      </main>

      {/* Leave Action Modal */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{actionModal.title}</h3>
              <button onClick={closeLeaveModal} className="text-slate-400 hover:text-slate-600">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionModal.isCancellation ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-fuchsia-50 border border-fuchsia-200 text-xs font-medium text-fuchsia-700 rounded-xl">
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
