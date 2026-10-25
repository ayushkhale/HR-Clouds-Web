import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import InboxCard from "../../../shared/components/InboxCard";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { EmbeddedPageContext } from "../../../shared/contexts/EmbeddedPageContext";
import { sumCounts } from "../../../shared/contexts/badgeCountsStore";
import { useBadgeCounts } from "../../../shared/hooks/useBadgeCounts";
import HRLeaveRequestsPage from "../leaves/screens/HRLeaveRequestsPage";
import PayrollApprovalsPage from "../payroll/screens/PayrollApprovalsPage";
import PayrollReimbursementsPage from "../payroll/screens/PayrollReimbursementsPage";
import PayrollLoansPage from "../payroll/screens/PayrollLoansPage";
import TaxDeclarationsPage from "../payroll/screens/TaxDeclarationsPage";
import LetterProposalsPage from "../documents/screens/LetterProposalsPage";
import EmployeeDevicesPage from "../attendance/screens/EmployeeDevicesPage";
import TaskReviewScreen from "../../../shared/tasks/TaskReviewScreen";
import {
  HiCash, HiClipboardCheck, HiClock, HiCurrencyRupee, HiDeviceMobile, HiDocumentText,
  HiExclamationCircle, HiGift, HiLightningBolt, HiMail, HiReceiptRefund, HiRefresh, HiClipboardList,
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
      { key: "regularizations", label: `${DICTIONARY.TERMS.REGULARIZATION}s`, hint: "Missed or wrong punches to fix", icon: HiClock, queue: "regularization" },
      { key: "overtime", label: "Overtime", hint: "Extra hours waiting for approval", icon: HiLightningBolt, queue: "overtime" },
      { key: "compOffs", label: TERM, hint: "Holiday work to credit", icon: HiGift, queue: "compoff" },
      { key: "anomalies", label: "Attendance flags", hint: "Unusual attendance to resolve", icon: HiExclamationCircle, queue: "anomaly" },
    ],
  },
  {
    // Its own group rather than a sixth card in Time & leave: six cards would
    // have wrapped one onto a row of its own at every width.
    //
    // One card, so it SHARES A ROW with Payroll & tax (`row: "work"`): 1 + 4
    // makes five cards on one line, the same five-across as Time & leave above
    // it. Alone it sat on a line of its own with three empty slots beside it,
    // which read as a loading state rather than a group with one thing in it.
    title: "Tasks",
    row: "work",
    span: "xl:col-span-1",
    // Full width of its own column once the row splits at xl; a quarter of the
    // page below that, where it stacks above Payroll & tax like Documents does.
    cols: "lg:grid-cols-4 xl:grid-cols-1",
    items: [
      // Deliverables handed in and waiting on a reviewer (#259/#260). Opens on
      // the same queue the count came from, so the card and the panel agree.
      { key: "tasks", label: "Task deliverables", hint: "Work handed in for your review", icon: HiClipboardList, render: () => <TaskReviewScreen viewer="hr" scope="all" initialStatus="in_review" /> },
    ],
  },
  {
    title: "Payroll & tax",
    row: "work",
    span: "xl:col-span-4",
    cols: "lg:grid-cols-4",
    items: [
      { key: "salaryApprovals", label: "Salary approvals", hint: "Proposed salary structures", icon: HiCurrencyRupee, render: () => <PayrollApprovalsPage /> },
      // Both kinds of claim that wait on HR: one a manager has passed up, and
      // one that comes straight here on a single-approval chain. The second
      // was missing from this card and its list until `pending_hr` (#133).
      { key: "claims", label: "Claims", hint: "Claims waiting for your decision", icon: HiReceiptRefund, render: () => <PayrollReimbursementsPage embedded /> },
      { key: "loans", label: "Loans & advances", hint: "Loan requests to approve", icon: HiCash, render: () => <PayrollLoansPage initialStatus="pending" /> },
      { key: "declarations", label: "Tax declarations", hint: "Submitted this financial year", icon: HiClipboardCheck, render: () => <TaxDeclarationsPage /> },
    ],
  },
  {
    // Only ever non-zero where the device policy says HR approves each device,
    // and a server without device trust reports zero rather than N/A
    // (hrInboxCounts.js). A device sitting here cannot clock anybody in, which
    // is why it is a queue and not just a page in Setup.
    title: "Devices",
    cols: "lg:grid-cols-4 xl:grid-cols-5",
    items: [
      { key: "devices", label: "Employee Devices", hint: "Devices waiting for you to approve", icon: HiDeviceMobile, render: () => <EmployeeDevicesPage /> },
    ],
  },

  {
    title: "Documents",
    // Five across once the rows above are five across, so the lone card keeps
    // the same column width as every other card rather than sitting a quarter
    // of the page wide under a grid of fifths.
    cols: "lg:grid-cols-4 xl:grid-cols-5",
    items: [
      // Approving one of these issues a real, numbered letter — so it is
      // reviewed in the same place as every other decision that waits on HR.
      { key: "letterProposals", label: "Letter Proposals", hint: "Letters managers have asked you to issue", icon: HiMail, render: () => <LetterProposalsPage embedded /> },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

/**
 * Consecutive groups carrying the same `row` are laid out side by side on one
 * line; everything else is a row of its own. The open queue's panel belongs to
 * the ROW, not to the section — an embedded page in a four-fifths column would
 * have its own table squeezed while a fifth of the page sat empty beside it.
 *
 * Computed from the groups left after the unavailable ones are dropped, so a
 * pair that loses one half falls back to a full-width row of its own instead
 * of leaving a gap where the other used to be.
 */
const rowsOf = (groups) => groups.reduce((rows, group) => {
  const last = rows[rows.length - 1];
  if (group.row && last?.[0]?.row === group.row) last.push(group);
  else rows.push([group]);
  return rows;
}, []);

export default function HRInboxPage() {
  // One read for every card here and for the sidebar badge that links to this
  // page, so the two can never disagree (#278). The queue open below still
  // reports its own length after a decision, and that correction wins until
  // the next read lands — see `counts`.
  const { counts: badgeCounts, isUnavailable, loading, loadedAt, refreshing, rateLimited, refresh } = useBadgeCounts();
  const [live, setLive] = useState({ at: 0, values: {} });
  const [selectedKey, setSelectedKey] = useState("regularizations");

  // The panel's correction only outranks the snapshot while it is the newer
  // of the two. The moment a read lands it covers every queue, including the
  // one that was open, so the whole override is dropped — otherwise a count
  // reported by a panel that has since closed would shadow the server's
  // number for the rest of the session and quietly disagree with the sidebar.
  const counts = useMemo(
    () => (live.at > loadedAt ? { ...badgeCounts, ...live.values } : badgeCounts),
    [badgeCounts, live, loadedAt],
  );
  // A queue this organisation cannot have — payroll switched off, a role that
  // may not see it — is left out rather than shown as an empty queue nobody
  // can ever act on (§2). Nothing is hidden on a server that still counts the
  // old way, because those reads cannot tell "not for you" from "failed".
  const groups = useMemo(() => GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !isUnavailable(i.key)) }))
    .filter((g) => g.items.length > 0), [isUnavailable]);
  const visibleItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const rows = useMemo(() => rowsOf(groups), [groups]);

  // The open attendance queue reports its own length after every reload.
  const onQueueCount = useCallback((type, n) => {
    const item = ALL_ITEMS.find((i) => i.queue === type);
    if (item) setLive((c) => ({ at: Date.now(), values: { ...c.values, [item.key]: n } }));
  }, []);

  // Open on the first queue that has work in it. Starting on an empty queue
  // while three others were waiting made the inbox look clear when it wasn't.
  // This happens once, when the counts first arrive: clearing the last item
  // in a queue must not whisk the person off to another one mid-work, and a
  // card they pick themselves always stands.
  const picked = useRef(false);
  const pick = (key) => { picked.current = true; setSelectedKey(key); };
  useEffect(() => {
    if (picked.current || loading) return;
    picked.current = true;
    if ((counts[selectedKey] || 0) > 0) return;
    const first = visibleItems.find((i) => (counts[i.key] || 0) > 0);
    if (first) setSelectedKey(first.key);
  }, [counts, loading, selectedKey, visibleItems]);

  // A queue that turns out to be unavailable must not stay open underneath
  // the cards it has just disappeared from.
  useEffect(() => {
    if (visibleItems.length > 0 && !visibleItems.some((i) => i.key === selectedKey)) {
      setSelectedKey(visibleItems[0].key);
    }
  }, [visibleItems, selectedKey]);

  const selected = visibleItems.find((i) => i.key === selectedKey);
  const waiting = sumCounts(counts);

  return (
    <>
      <DashboardTopBar title="Inbox" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading && !waiting ? "Checking every approval queue…" : `${waiting} item${waiting === 1 ? "" : "s"} waiting across the organisation.`}
            </p>
          </div>
          <button type="button" onClick={() => refresh()} disabled={refreshing || rateLimited} title={rateLimited ? "Checked too often just now — this updates itself in a moment." : undefined} className="inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-4 py-2.5 rounded-xl transition disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {rows.map((row) => {
          const showPanel = selected && row.some((g) => g.items.includes(selected));
          return (
            <section key={row.map((g) => g.title).join("+")} className="space-y-4">
              {/* Five columns, so a paired row's cards line up with the five in
                  Time & leave. One group to a row keeps its own full width. */}
              {/* Below xl the pair stacks, so it takes the same breathing room
                  between its two headings that any two groups get (space-y-8). */}
              <div className={row.length > 1 ? "grid grid-cols-1 xl:grid-cols-5 gap-x-4 gap-y-8 xl:gap-y-4" : ""}>
                {row.map((group) => (
                  <div key={group.title} className={`space-y-4 min-w-0 ${group.span || ""}`}>
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{group.title}</h2>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${group.cols}`}>
                      {group.items.map((item) => (
                        <InboxCard key={item.key} item={item} count={counts[item.key]} loading={loading} selected={item.key === selectedKey} onSelect={pick} />
                      ))}
                    </div>
                  </div>
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
