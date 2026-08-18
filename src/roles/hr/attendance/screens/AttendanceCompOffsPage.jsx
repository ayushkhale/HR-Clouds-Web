import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import { HiSparkles, HiCheck, HiX, HiCheckCircle, HiBan } from "react-icons/hi";

const STATUS_TABS = [
  { key: "earned", label: "Earned", badgeClass: "bg-purple-100 text-purple-700" },
  { key: "approved", label: "Approved", badgeClass: "bg-indigo-100 text-indigo-700" },
  { key: "rejected", label: "Rejected", badgeClass: "bg-slate-100 text-slate-600" },
  { key: "expired", label: "Expired", badgeClass: "bg-slate-100 text-slate-400" },
  { key: "consumed", label: "Consumed", badgeClass: "bg-purple-50 text-purple-500" },
];

function AttendanceCompOffsPage() {
  const [compOffs, setCompOffs] = useState([]);
  const [activeTab, setActiveTab] = useState("earned");
  const [selected, setSelected] = useState([]);
  const [remarksMap, setRemarksMap] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchCompOffs(); }, [activeTab]);

  const fetchCompOffs = async () => {
    try {
      const res = await attendanceAPI.getCompOffs({ status: activeTab });
      if (res.success) setCompOffs(res.data || []);
    } catch (err) { console.error(err); setCompOffs([]); }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = async (id) => {
    try {
      const res = await attendanceAPI.approveCompOff(id);
      if (res.success) {
        const expiry = res.data?.expiry_date ? new Date(res.data.expiry_date).toLocaleDateString() : "90 days";
        showToast(`Comp Off approved! Expires: ${expiry}`);
        fetchCompOffs();
      }
    } catch (err) {
      showToast(err.message || "Failed to approve", "error");
    }
  };

  const handleReject = async (id) => {
    try {
      const res = await attendanceAPI.rejectCompOff(id, { remarks: remarksMap[id] || "" });
      if (res.success) {
        showToast("Comp Off rejected");
        fetchCompOffs();
      }
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    }
  };

  const handleBulkApprove = async () => {
    if (selected.length === 0) return;
    let count = 0;
    for (const id of selected) {
      try {
        const res = await attendanceAPI.approveCompOff(id);
        if (res.success) count++;
      } catch (err) { console.error(err); }
    }
    showToast(`${count} comp off(s) approved!`);
    setSelected([]);
    fetchCompOffs();
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === compOffs.length) setSelected([]);
    else setSelected(compOffs.map(c => c.id));
  };

  const getStatusBadge = (status) => {
    const tab = STATUS_TABS.find(t => t.key === status);
    return tab ? tab.badgeClass : "bg-slate-100 text-slate-500";
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Compensatory Offs" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Compensatory Offs</h1>
              <p className="text-sm text-slate-500 mt-1">Review, approve, or reject compensatory off requests earned by employees working on holidays or weekly offs.</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map(tab => (
                <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelected([]); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${activeTab === tab.key ? "bg-[#6D28D9] text-white border-[#6D28D9]" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            {activeTab === "earned" && selected.length > 0 && (
              <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-5 py-3">
                <span className="text-sm font-semibold text-purple-700">{selected.length} selected</span>
                <button onClick={handleBulkApprove} className="ml-auto px-4 py-2 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer">
                  <HiCheckCircle className="w-4 h-4" /> Approve Selected
                </button>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                  <tr>
                    {activeTab === "earned" && (
                      <th className="px-4 py-4"><input type="checkbox" checked={selected.length === compOffs.length && compOffs.length > 0} onChange={toggleSelectAll} className="accent-purple-600" /></th>
                    )}
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Earned Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Hours Worked</th>
                    <th className="px-6 py-4">Status</th>
                    {activeTab === "earned" && <th className="px-6 py-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {compOffs.length === 0 ? (
                    <tr><td colSpan={activeTab === "earned" ? 7 : 6} className="px-6 py-12 text-center text-slate-400">No {activeTab} comp offs found.</td></tr>
                  ) : compOffs.map(co => (
                    <tr key={co.id} className="hover:bg-slate-50/80 transition-colors">
                      {activeTab === "earned" && (
                        <td className="px-4 py-4"><input type="checkbox" checked={selected.includes(co.id)} onChange={() => toggleSelect(co.id)} className="accent-purple-600" /></td>
                      )}
                      <td className="px-6 py-4 font-semibold text-primary-800">
                        {co.user?.profile ? `${co.user.profile.first_name} ${co.user.profile.last_name}` : (co.user?.name || co.user_id?.split("-")[0] || "Unknown")}
                      </td>
                      <td className="px-6 py-4 font-medium">{co.earned_date}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-100">
                          {co.worked_type ? co.worked_type.replace("_", " ") : "--"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">{co.worked_hours ? `${co.worked_hours}h` : "--"}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border border-black/5 ${getStatusBadge(co.status)}`}>
                          {co.status}
                        </span>
                      </td>
                      {activeTab === "earned" && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <input type="text" placeholder="Remarks..." value={remarksMap[co.id] || ""} onChange={e => setRemarksMap({ ...remarksMap, [co.id]: e.target.value })}
                              className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-purple-500" />
                            <button onClick={() => handleApprove(co.id)} className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors" title="Approve">
                              <HiCheck className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleReject(co.id)} className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg transition-colors" title="Reject">
                              <HiBan className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 animate-[slideUp_0.3s_ease] ${toast.type === "error" ? "bg-rose-500 text-white" : "bg-purple-600 text-white"}`}>
          {toast.type === "error" ? <HiX className="w-4 h-4" /> : <HiCheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default AttendanceCompOffsPage;
