import React, { useState, useEffect } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, leaveAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { formatDate } from "../../../shared/utils/formatUtils";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import {
  HiInboxIn, HiCheckCircle, HiXCircle, HiCheck, HiX, HiClock, HiCalendar, HiExclamationCircle, HiGift, HiDocumentText, HiUserCircle, HiThumbUp, HiThumbDown, HiInformationCircle
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

function ManagerApprovalsInbox() {
  const [activeTab, setActiveTab] = useState("regularizations");
  const [data, setData] = useState({
    regularizations: [],
    overtime: [],
    compOffs: [],
    anomalies: [],
    leaves: [] // If leaveAPI has getTeamPendingRequests
  });
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState({ isOpen: false, type: "", action: "", id: null, title: "", isCancellation: false });
  const [balanceModal, setBalanceModal] = useState({ isOpen: false, empName: "", balances: [], loading: false });
  const [remarks, setRemarks] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchAllRequests();
  }, []);

  const fetchAndShowBalances = async (userId, empName) => {
    setBalanceModal({ isOpen: true, empName, balances: [], loading: true });
    try {
      const res = await leaveAPI.getTeamMemberBalances(userId);
      if (res.success) {
        setBalanceModal({ isOpen: true, empName, balances: res.data || [], loading: false });
      } else {
        showToast(res.message || "Failed to fetch balances", "error");
        setBalanceModal({ isOpen: false, empName: "", balances: [], loading: false });
      }
    } catch (err) {
      showToast(err.message || "Failed to fetch balances", "error");
      setBalanceModal({ isOpen: false, empName: "", balances: [], loading: false });
    }
  };

  const fetchAllRequests = async () => {
    setLoading(true);
    try {
      const [regRes, otRes, coRes, anomRes, leaveRes] = await Promise.all([
        attendanceAPI.getManagerPendingRegularizations().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerPendingOvertime().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerCompOffs().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerAnomalies().catch(() => ({ success: false, data: [] })),
        leaveAPI.getTeamPendingRequests().catch(() => ({ success: false, data: [] }))
      ]);

      setData({
        regularizations: regRes.success ? (regRes.data || []) : [],
        overtime: otRes.success ? (otRes.data || []) : [],
        compOffs: coRes.success ? (coRes.data || []) : [],
        anomalies: anomRes.success ? (anomRes.data || []) : [],
        leaves: leaveRes.success ? (leaveRes.data || []) : []
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAction = async () => {
    const { type, action, id } = actionModal;
    const payload = action === "reject" ? { rejection_reason: remarks, remarks } : { remarks };

    try {
      let res;
      if (type === "regularization") {
        if (action === "approve") res = await attendanceAPI.approveManagerRegularization(id, payload);
        else res = await attendanceAPI.rejectManagerRegularization(id, payload);
      } else if (type === "overtime") {
        if (action === "approve") res = await attendanceAPI.approveManagerOvertime(id, payload);
        else res = await attendanceAPI.rejectManagerOvertime(id, payload);
      } else if (type === "compOff") {
        if (action === "approve") res = await attendanceAPI.approveManagerCompOff(id, payload);
        else res = await attendanceAPI.rejectManagerCompOff(id, payload);
      } else if (type === "anomaly") {
        res = await attendanceAPI.resolveManagerAnomaly(id, payload);
      } else if (type === "leaves") {
        if (action === "approve") res = await leaveAPI.approveRequest(id, payload);
        else res = await leaveAPI.rejectRequest(id, payload);
      }

      if (res && res.success) {
        showToast(`Successfully ${action === "approve" ? "approved" : "rejected"} request!`);
        setActionModal({ isOpen: false, type: "", action: "", id: null, title: "" });
        setRemarks("");
        fetchAllRequests();
      } else {
        showToast(res?.message || "Action failed", "error");
      }
    } catch (err) {
      showToast(type === "leaves" ? leaveErrorMessage(err, "Action failed") : (err.message || "Action failed"), "error");
    }
  };

  const tabs = [
    { id: "leaves", label: "Leaves", icon: HiDocumentText, count: data.leaves.length },
    { id: "regularizations", label: "Regularizations", icon: HiClock, count: data.regularizations.length },
    { id: "overtime", label: "Overtime", icon: HiCalendar, count: data.overtime.length },
    { id: "compOffs", label: `${DICTIONARY.TERMS.COMP_OFF}s`, icon: HiGift, count: data.compOffs.length },
    { id: "anomalies", label: "Anomalies", icon: HiExclamationCircle, count: data.anomalies.length },
  ];

  const renderActiveTabContent = () => {
    let list = data[activeTab];
    if (loading) return <div className="p-8 text-center text-slate-500">Loading requests...</div>;
    if (!list || list.length === 0) return <div className="p-12 text-center text-slate-400 font-medium">No pending requests here! 🎉</div>;

    if (activeTab === "leaves") {
      return (
        <div className="p-4 bg-slate-50/50">
          {list.map(item => (
            <LeaveInboxCard 
              key={item.id} 
              item={item} 
              onApprove={(req) => {
                const empName = resolveRequesterName(req);
                const isCxl = req.status === "cancellation_pending";
                setActionModal({ isOpen: true, type: "leaves", action: "approve", id: req.id, title: isCxl ? `Approve cancellation for ${empName}` : `Approve Request for ${empName}`, isCancellation: isCxl });
              }}
              onReject={(req) => {
                const empName = resolveRequesterName(req);
                const isCxl = req.status === "cancellation_pending";
                setActionModal({ isOpen: true, type: "leaves", action: "reject", id: req.id, title: isCxl ? `Deny cancellation for ${empName}` : `Reject Request for ${empName}`, isCancellation: isCxl });
              }}
              showToast={showToast}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {list.map((item) => {
              const empName = resolveRequesterName(item);
              let details = "";
              if (activeTab === "regularizations") details = `${item.date} - ${item.reason || 'No reason'}`;
              if (activeTab === "overtime") details = `${item.date} - ${item.overtime_minutes} mins`;
              if (activeTab === "compOffs") details = `Earned: ${item.earned_date} - ${item.worked_hours}h`;
              if (activeTab === "anomalies") details = `Type: ${item.anomaly_type} - ${item.date}`;

              return (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">{empName}</td>
                  <td className="px-6 py-4 font-medium">{details}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-100">
                      {item.status || "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {activeTab !== "anomalies" && (
                        <button
                          onClick={() => setActionModal({ isOpen: true, type: activeTab === "compOffs" ? "compOff" : activeTab, action: "approve", id: item.id, title: `Approve Request for ${empName}`, isCancellation: false })}
                          className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors" title="Approve">
                          <HiCheck className="w-4 h-4" />
                        </button>
                      )}
                      {activeTab === "anomalies" && (
                        <button 
                          onClick={() => setActionModal({ isOpen: true, type: "anomaly", action: "approve", id: item.id, title: `Resolve Anomaly for ${empName}` })} 
                          className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-xs px-3 py-1 font-semibold" title="Resolve">
                          Resolve
                        </button>
                      )}
                      {activeTab !== "anomalies" && (
                        <button 
                          onClick={() => setActionModal({ isOpen: true, type: activeTab === "compOffs" ? "compOff" : activeTab, action: "reject", id: item.id, title: `Reject Request for ${empName}`, isCancellation: false })} 
                          className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-lg transition-colors" title="Reject">
                          <HiX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
        <DashboardTopBar title="Approvals Inbox" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Approvals Inbox</h1>
              <p className="text-sm text-slate-500 mt-1">Review and action pending requests from your direct reports.</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex overflow-x-auto border-b border-slate-100 hide-scrollbar">
              {tabs.map(tab => (
                <button
                  key={tab.id}
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
                    <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] ${
                      activeTab === tab.id ? "bg-purple-200 text-purple-800" : "bg-slate-100 text-slate-500"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {renderActiveTabContent()}
          </div>
        </main>

      {/* Action Modal */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{actionModal.title}</h3>
              <button onClick={() => { setActionModal({ isOpen: false, type: "", action: "", id: null, title: "" }); setRemarks(""); }} className="text-slate-400 hover:text-slate-600">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionModal.type === "leaves" && actionModal.isCancellation ? (
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
              <button 
                onClick={() => { setActionModal({ isOpen: false, type: "", action: "", id: null, title: "" }); setRemarks(""); }} 
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button 
                onClick={handleAction} 
                disabled={actionModal.action === "reject" && !remarks.trim()}
                className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors ${
                  actionModal.action === "approve" ? "bg-purple-600 hover:bg-purple-700" : "bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                }`}>
                {actionModal.action === "approve" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Balances Modal */}
      {balanceModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Balances for {balanceModal.empName}</h3>
              <button onClick={() => setBalanceModal({ isOpen: false, empName: "", balances: [], loading: false })} className="text-slate-400 hover:text-slate-600">
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {balanceModal.loading ? (
                <div className="text-center py-8 text-slate-500 text-sm">Loading balances...</div>
              ) : balanceModal.balances.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No leave balances found for this employee.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {balanceModal.balances.map(b => (
                    <div key={b.id || b.leave_type_id} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{b.leave_type?.name || "Leave"}</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-slate-800">{b.current_balance}</span>
                        <span className="text-sm font-semibold text-slate-500">remaining</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Total Accrued: {b.total_accrued}</div>
                    </div>
                  ))}
                </div>
              )}
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
