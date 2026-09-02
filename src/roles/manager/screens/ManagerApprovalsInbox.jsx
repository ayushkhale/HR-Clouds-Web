import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, leaveAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { 
  HiInboxIn, HiCheckCircle, HiXCircle, HiCheck, HiX, HiClock, HiCalendar, HiExclamationCircle, HiGift 
} from "react-icons/hi";

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
  const [actionModal, setActionModal] = useState({ isOpen: false, type: "", action: "", id: null, title: "" });
  const [remarks, setRemarks] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchAllRequests();
  }, []);

  const fetchAllRequests = async () => {
    setLoading(true);
    try {
      const [regRes, otRes, coRes, anomRes] = await Promise.all([
        attendanceAPI.getManagerPendingRegularizations().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerPendingOvertime().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerCompOffs().catch(() => ({ success: false, data: [] })),
        attendanceAPI.getManagerAnomalies().catch(() => ({ success: false, data: [] }))
      ]);

      setData({
        regularizations: regRes.success ? (regRes.data || []) : [],
        overtime: otRes.success ? (otRes.data || []) : [],
        compOffs: coRes.success ? (coRes.data || []) : [],
        anomalies: anomRes.success ? (anomRes.data || []) : [],
        leaves: [] // Leaves to be implemented when leaveAPI is fully ready
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
      showToast(err.message || "Action failed", "error");
    }
  };

  const tabs = [
    { id: "regularizations", label: "Regularizations", icon: HiClock, count: data.regularizations.length },
    { id: "overtime", label: "Overtime", icon: HiCalendar, count: data.overtime.length },
    { id: "compOffs", label: `${DICTIONARY.TERMS.COMP_OFF}s`, icon: HiGift, count: data.compOffs.length },
    { id: "anomalies", label: "Anomalies", icon: HiExclamationCircle, count: data.anomalies.length },
  ];

  const renderActiveTabContent = () => {
    let list = data[activeTab];
    if (loading) return <div className="p-8 text-center text-slate-500">Loading requests...</div>;
    if (!list || list.length === 0) return <div className="p-12 text-center text-slate-400 font-medium">No pending requests here! 🎉</div>;

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
              const empName = item.user?.profile ? `${item.user.profile.first_name} ${item.user.profile.last_name}` : (item.user?.name || "Unknown");
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
                          onClick={() => setActionModal({ isOpen: true, type: activeTab === "compOffs" ? "compOff" : activeTab, action: "approve", id: item.id, title: `Approve Request for ${empName}` })} 
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
                          onClick={() => setActionModal({ isOpen: true, type: activeTab === "compOffs" ? "compOff" : activeTab, action: "reject", id: item.id, title: `Reject Request for ${empName}` })} 
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
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Approvals Inbox" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          <div className="bg-gradient-to-r from-purple-700 to-fuchsia-800 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                  <HiInboxIn className="w-3.5 h-3.5 text-purple-200" />
                  MANAGER INBOX
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-4">
                  Approvals Inbox
                </h1>
                <p className="text-xs sm:text-sm text-purple-100/80 font-normal pt-2">
                  Review and action pending requests from your direct reports.
                </p>
              </div>
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
      </div>

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
              <p className="text-sm text-slate-600">
                Are you sure you want to <strong>{actionModal.action}</strong> this request?
              </p>
              
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 ${toast.type === "error" ? "bg-rose-500 text-white" : "bg-purple-600 text-white"}`}>
          {toast.type === "error" ? <HiXCircle className="w-5 h-5" /> : <HiCheckCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default ManagerApprovalsInbox;
