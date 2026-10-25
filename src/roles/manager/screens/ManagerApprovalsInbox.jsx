import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import InboxCard from "../../../shared/components/InboxCard";
import { leaveAPI } from "../../../shared/api";
import { useBadgeCounts } from "../../../shared/hooks/useBadgeCounts";
import { sortNewestFirst } from "../../../shared/utils/sortUtils";
import { EmbeddedPageContext } from "../../../shared/contexts/EmbeddedPageContext";
import TaskReviewScreen from "../../../shared/tasks/TaskReviewScreen";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import ReasonDialog from "../../../shared/components/ReasonDialog";
import LeaveRequestCard, { leaveApplicantName } from "../components/LeaveRequestCard";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../../../shared/attendance/events";
import {
  HiCheckCircle, HiXCircle, HiClock, HiCalendar, HiExclamationCircle, HiGift, HiDocumentText,
  HiRefresh, HiClipboardList,
} from "react-icons/hi";

// Same shape as the HR inbox: one card per queue, the chosen one opens below.
// Attendance queues run through the shared approval queue (same dialog, remarks
// rules and refresh behaviour as the per-type pages); leave keeps its own cards.
const GROUP = {
  title: "Time & leave",
  // Six cards now that task deliverables are a queue here too.
  cols: "lg:grid-cols-3 xl:grid-cols-6",
  items: [
    { key: "leaves", label: "Leave requests", hint: "Leave and cancellation requests", icon: HiDocumentText },
    { key: "regularizations", label: DICTIONARY.TERMS.REGULARIZATION + "s", hint: "Missed or wrong punches to fix", icon: HiClock, queue: "regularization" },
    { key: "overtime", label: "Overtime", hint: "Extra hours waiting for approval", icon: HiCalendar, queue: "overtime" },
    { key: "compOffs", label: DICTIONARY.TERMS.COMP_OFF, hint: "Holiday work to credit", icon: HiGift, queue: "compoff" },
    { key: "anomalies", label: "Attendance flags", hint: "Unusual attendance to resolve", icon: HiExclamationCircle, queue: "anomaly" },
    // Work the team has handed in and that waits on this manager (#259/#260).
    // Opened on the same queue the count came from, so the card and the panel
    // never disagree — and embedded, so it brings no second top bar.
    {
      key: "tasks",
      label: "Task deliverables",
      hint: "Work handed in for your review",
      icon: HiClipboardList,
      render: () => <TaskReviewScreen viewer="manager" scope="all" initialStatus="in_review" />,
    },
  ],
};
const ATTENDANCE_TABS = Object.fromEntries(GROUP.items.filter((i) => i.queue).map((i) => [i.key, i.queue]));

function ManagerApprovalsInbox() {
  // The same one read the sidebar badge uses, scoped to this manager's direct
  // reports by the server (#278). The six cards used to cost six requests of
  // their own, which is why they disagreed with the sidebar after a decision.
  const { counts: badgeCounts, isUnavailable, loading, loadedAt, refreshing, rateLimited, refresh: refreshCounts } = useBadgeCounts();
  const [selectedKey, setSelectedKey] = useState("regularizations");
  // A panel's own count of what it just listed, with the moment it was taken.
  // It is only newer than the snapshot until the next read lands — see `counts`.
  const [live, setLive] = useState({ at: 0, values: {} });
  const [leaves, setLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [actionModal, setActionModal] = useState({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // The leave panel below shows the requests themselves, so this read is for
  // the rows, not for the count — the card reads the badge like every other.
  const fetchLeaves = useCallback(async () => {
    setLeavesLoading(true);
    try {
      const res = await leaveAPI.getTeamPendingRequests();
      const rows = res.success ? (res.data || []) : [];
      setLeaves(sortNewestFirst(rows));
      setLive((c) => ({ at: Date.now(), values: { ...c.values, leaves: rows.length } }));
    } catch {
      setLeaves([]);
      // The card's number comes from the badge snapshot, not from this read.
      // A failed list drops our correction and lets the server's count stand
      // rather than blanking a figure that was never in doubt.
      setLive((c) => {
        if (!("leaves" in c.values)) return c;
        const values = { ...c.values };
        delete values.leaves;
        return { at: Date.now(), values };
      });
    } finally {
      setLeavesLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    refreshCounts();
    fetchLeaves();
  }, [refreshCounts, fetchLeaves]);


  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);
  // The counts refresh themselves on the same events; only the leave rows on
  // screen have to be re-read here.
  useAttendanceChanged([ATTENDANCE_EVENTS.LEAVE], fetchLeaves);

  // The open attendance queue reports its own length after every reload.
  const onQueueCount = useCallback((type, n) => {
    const key = Object.keys(ATTENDANCE_TABS).find((k) => ATTENDANCE_TABS[k] === type);
    if (key) setLive((c) => ({ at: Date.now(), values: { ...c.values, [key]: n } }));
  }, []);

  // What the server counted, with any correction a panel on this page made
  // AFTER that read — the open queue's own length is newer than the snapshot
  // for the moment between a decision and the re-read it triggers. Once the
  // re-read lands the correction is the stale one, so it is dropped whole; a
  // panel that has since closed, or whose own reload failed, can never pin an
  // old number to a card the way an override that never expired would.
  const counts = useMemo(
    () => (live.at > loadedAt ? { ...badgeCounts, ...live.values } : badgeCounts),
    [badgeCounts, live, loadedAt],
  );
  const items = useMemo(() => GROUP.items.filter((i) => !isUnavailable(i.key)), [isUnavailable]);

  const closeLeaveModal = () => {
    if (submitting) return;
    setActionModal({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
  };

  // `reason` comes from the shared ReasonDialog — required on reject (it gates
  // its own Confirm), optional on approve. Reject carries it under both keys the
  // leave API has accepted historically.
  const handleLeaveAction = async (reason) => {
    const { action, id } = actionModal;
    if (submitting) return;
    const payload = action === "reject" ? { rejection_reason: reason, remarks: reason } : { remarks: reason };
    setSubmitting(true);
    try {
      const res = action === "approve" ? await leaveAPI.approveRequest(id, payload) : await leaveAPI.rejectRequest(id, payload);
      if (res && res.success) {
        showToast(`Successfully ${action === "approve" ? "approved" : "rejected"} request!`);
        setActionModal({ isOpen: false, action: "", id: null, title: "", isCancellation: false });
        fetchLeaves();
        emitAttendanceChanged(ATTENDANCE_EVENTS.LEAVE, { id, action });
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
            // The prop is `request`, not `item`: passing `item` left `request`
            // undefined and the card threw on its first field, so the Inbox's
            // whole Leave requests panel rendered as a blank crash.
            request={item}
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

  const selected = items.find((i) => i.key === selectedKey);
  const waiting = items.reduce((sum, i) => sum + (counts[i.key] || 0), 0);
  const busy = loading || leavesLoading;

  // Open on the first queue that has work in it. Starting on an empty queue
  // while three others were waiting made the inbox look clear when it wasn't.
  // This happens once, when the counts first arrive: clearing the last item
  // in a queue must not whisk the person off to another one mid-work, and a
  // card they pick themselves always stands.
  const picked = useRef(false);
  const pick = (key) => { picked.current = true; setSelectedKey(key); };
  useEffect(() => {
    if (picked.current || busy) return;
    picked.current = true;
    if ((counts[selectedKey] || 0) > 0) return;
    const first = items.find((i) => (counts[i.key] || 0) > 0);
    if (first) setSelectedKey(first.key);
  }, [counts, busy, selectedKey, items]);

  // A queue this manager turns out not to have must not stay open below cards
  // it has just disappeared from.
  useEffect(() => {
    if (items.length > 0 && !items.some((i) => i.key === selectedKey)) setSelectedKey(items[0].key);
  }, [items, selectedKey]);

  return (
    <>
      <DashboardTopBar title="Inbox" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
            <p className="text-sm text-slate-500 mt-1">
              {busy && !waiting ? "Checking every approval queue…" : `${waiting} item${waiting === 1 ? "" : "s"} waiting across your team.`}
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={busy || refreshing || rateLimited} title={rateLimited ? "Checked too often just now — this updates itself in a moment." : undefined} className="inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-4 py-2.5 rounded-xl transition disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${busy || refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <section className="space-y-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{GROUP.title}</h2>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${GROUP.cols}`}>
            {items.map((item) => (
              <InboxCard key={item.key} item={item} count={counts[item.key]} loading={busy} selected={item.key === selectedKey} onSelect={pick} />
            ))}
          </div>

          {selected && (
            <div key={selected.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><selected.icon className="w-4 h-4" /></span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Pending {selected.label.toLowerCase()}</h3>
                  <p className="text-[11px] text-slate-400">{selected.queue || selected.render ? "Click a row to review and decide." : "Approve or reject each request below."}</p>
                </div>
              </div>
              {selected.queue
                ? <AttendanceApprovalQueue key={selected.key} type={selected.queue} onCountChange={onQueueCount} />
                : selected.render
                  ? <EmbeddedPageContext.Provider value>{selected.render()}</EmbeddedPageContext.Provider>
                  : renderLeaves()}
            </div>
          )}
        </section>
      </main>

      {/* Leave approve/reject — the same reason dialog HR decisions use, so the
          two inboxes capture a remark the same way. Approve records one only if
          written; reject requires it (the dialog gates its own Confirm). */}
      {actionModal.isOpen && (
        <ReasonDialog
          title={actionModal.title}
          description={actionModal.isCancellation
            ? (actionModal.action === "approve"
                ? "Approving this cancels the approved leave and refunds the employee’s leave balance."
                : "Denying this keeps the approved leave active.")
            : (actionModal.action === "reject"
                ? "Let the employee know why their request can’t be approved."
                : "The employee will be able to take this leave.")}
          label="Remarks"
          placeholder={actionModal.action === "reject" ? "Why this request can’t be approved…" : "Any remarks for the employee (optional)…"}
          confirmLabel={actionModal.action === "approve"
            ? (actionModal.isCancellation ? "Approve cancellation" : "Confirm approval")
            : (actionModal.isCancellation ? "Deny cancellation" : "Confirm rejection")}
          tone={actionModal.action === "approve" ? "primary" : "danger"}
          optional={actionModal.action === "approve"}
          busy={submitting}
          onSubmit={handleLeaveAction}
          onClose={closeLeaveModal}
        />
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
