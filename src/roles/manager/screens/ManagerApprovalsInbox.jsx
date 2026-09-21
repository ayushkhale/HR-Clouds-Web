import React, { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, leaveAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import LeaveRequestCard, { leaveApplicantName } from "../components/LeaveRequestCard";
import { listFrom } from "../../../shared/attendance/normalize";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../../../shared/attendance/events";
import {
  HiCheckCircle, HiXCircle, HiX, HiClock, HiCalendar, HiExclamationCircle, HiGift, HiDocumentText, HiInformationCircle
} from "react-icons/hi";

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

  return (
    <>
      <DashboardTopBar title="Inbox" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
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
