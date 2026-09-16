import { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../../../shared/attendance/events";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { EmbeddedPageContext } from "../../../shared/contexts/EmbeddedPageContext";
import { fetchHrInboxCounts, inboxTotal, peekHrInboxCounts } from "../../../shared/utils/hrInboxCounts";
import HRLeaveRequestsPage from "../leaves/screens/HRLeaveRequestsPage";
import PayrollApprovalsPage from "../payroll/screens/PayrollApprovalsPage";
import PayrollReimbursementsPage from "../payroll/screens/PayrollReimbursementsPage";
import PayrollLoansPage from "../payroll/screens/PayrollLoansPage";
import TaxDeclarationsPage from "../payroll/screens/TaxDeclarationsPage";
import {
  HiArrowRight, HiCash, HiClipboardCheck, HiClock, HiCurrencyRupee, HiDocumentText,
  HiExclamationCircle, HiGift, HiLightningBolt, HiReceiptRefund, HiRefresh,
} from "react-icons/hi";

const TERM = DICTIONARY.TERMS.COMP_OFF;

// Every queue is reviewed on this page: attendance queues through the shared
// approval queue, the rest by embedding their page (without its top bar).
const GROUPS = [
  {
    title: "Time & leave",
    cols: "lg:grid-cols-3 xl:grid-cols-5",
    items: [
      { key: "leaves", label: "Leave requests", hint: "Leave and cancellation requests", icon: HiDocumentText, render: () => <HRLeaveRequestsPage /> },
      { key: "regularizations", label: "Regularizations", hint: "Missed or wrong punches to fix", icon: HiClock, queue: "regularization" },
      { key: "overtime", label: "Overtime", hint: "Extra hours waiting for approval", icon: HiLightningBolt, queue: "overtime" },
      { key: "compOffs", label: `${TERM}s`, hint: "Holiday work to credit", icon: HiGift, queue: "compoff" },
      { key: "anomalies", label: "Attendance flags", hint: "Unusual attendance to resolve", icon: HiExclamationCircle, queue: "anomaly" },
    ],
  },
  {
    title: "Payroll & tax",
    cols: "lg:grid-cols-4",
    items: [
      { key: "salaryApprovals", label: "Salary approvals", hint: "Proposed salary structures", icon: HiCurrencyRupee, render: () => <PayrollApprovalsPage /> },
      { key: "claims", label: "Claims", hint: "New and manager-reviewed claims", icon: HiReceiptRefund, render: () => <PayrollReimbursementsPage embedded /> },
      { key: "loans", label: "Loans & advances", hint: "Loan requests to approve", icon: HiCash, render: () => <PayrollLoansPage initialStatus="pending" /> },
      { key: "declarations", label: "Tax declarations", hint: "Submitted this financial year", icon: HiClipboardCheck, render: () => <TaxDeclarationsPage /> },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function CountValue({ value, loading }) {
  if (value == null) {
    return loading
      ? <span className="inline-block w-8 h-7 rounded-lg bg-slate-100 animate-pulse" aria-label="Loading" />
      : <span className="text-sm font-bold text-slate-400">N/A</span>;
  }
  return <span className={`text-2xl font-bold tabular-nums ${value > 0 ? "text-purple-700" : "text-slate-300"}`}>{value}</span>;
}

function InboxCard({ item, count, loading, selected, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-pressed={selected}
      className={`text-left bg-white rounded-2xl border p-5 transition hover:shadow-md ${selected ? "border-purple-500 ring-2 ring-purple-100" : "border-slate-100 shadow-sm hover:border-purple-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600"}`}>
          <Icon className="w-5 h-5" />
        </span>
        <CountValue value={count} loading={loading} />
      </div>
      <p className="mt-3 text-sm font-bold text-slate-800">{item.label}</p>
      <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-purple-600">
        {selected ? "Showing below" : "Review here"}
        <HiArrowRight className={`w-3.5 h-3.5 transition-transform ${selected ? "rotate-90" : ""}`} />
      </p>
    </button>
  );
}

export default function HRInboxPage() {
  const [counts, setCounts] = useState(() => peekHrInboxCounts() || {});
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("regularizations");

  const refresh = useCallback(async (force) => {
    setLoading(true);
    const next = await fetchHrInboxCounts(force);
    setCounts(next);
    setLoading(false);
  }, []);

  // Counts come from the shared cache; switching queues never re-reads all nine.
  // Decisions refresh them through attendance events, and Refresh forces a read.
  useEffect(() => { refresh(false); }, [refresh]);
  useAttendanceChanged(INBOX_EVENT_KINDS, () => refresh(true));

  // The open attendance queue reports its own length after every reload.
  const onQueueCount = useCallback((type, n) => {
    const item = ALL_ITEMS.find((i) => i.queue === type);
    if (item) setCounts((c) => (c[item.key] === n ? c : { ...c, [item.key]: n }));
  }, []);

  const selected = ALL_ITEMS.find((i) => i.key === selectedKey);
  const waiting = inboxTotal(counts);

  return (
    <>
      <DashboardTopBar title="HR Inbox" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">HR Inbox</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading && !waiting ? "Checking every approval queue…" : `${waiting} item${waiting === 1 ? "" : "s"} waiting across the organisation.`}
            </p>
          </div>
          <button type="button" onClick={() => refresh(true)} disabled={loading} className="inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-4 py-2.5 rounded-xl transition disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {GROUPS.map((group) => {
          const showPanel = selected && group.items.includes(selected);
          return (
            <section key={group.title} className="space-y-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{group.title}</h2>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${group.cols}`}>
                {group.items.map((item) => (
                  <InboxCard key={item.key} item={item} count={counts[item.key]} loading={loading} selected={item.key === selectedKey} onSelect={setSelectedKey} />
                ))}
              </div>

              {showPanel && (
                <div key={selected.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {selected.queue ? (
                    <>
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><selected.icon className="w-4 h-4" /></span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Pending {selected.label.toLowerCase()}</h3>
                          <p className="text-[11px] text-slate-400">Click a row to review and decide.</p>
                        </div>
                      </div>
                      <AttendanceApprovalQueue type={selected.queue} scope="org" onCountChange={onQueueCount} />
                    </>
                  ) : (
                    <EmbeddedPageContext.Provider value>{selected.render()}</EmbeddedPageContext.Provider>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <p className="text-[11px] text-slate-400">Bank accounts waiting for verification are listed under Payroll → Bank Verification.</p>
      </main>
    </>
  );
}
