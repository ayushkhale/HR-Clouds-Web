import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles, HiCheck, HiBan, HiCheckCircle, HiX } from "react-icons/hi";

function ManagerCompOffsPage() {
  const [compOffs, setCompOffs] = useState([]);
  const [remarksMap, setRemarksMap] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchCompOffs(); }, []);

  const fetchCompOffs = async () => {
    try {
      const res = await attendanceAPI.getManagerCompOffs();
      if (res.success) setCompOffs(res.data || []);
    } catch (err) { console.error(err); }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = async (id) => {
    try {
      const res = await attendanceAPI.approveManagerCompOff(id);
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
      const res = await attendanceAPI.rejectManagerCompOff(id, { remarks: remarksMap[id] || "" });
      if (res.success) {
        showToast("Comp Off rejected");
        fetchCompOffs();
      }
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Comp Off Requests" />
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Hero */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" /> REQUESTS
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Comp Off Requests</h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Review and manage compensatory off requests from your team members who worked on holidays or weekly offs.</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Earned Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Hours Worked</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {compOffs.length === 0 ? (
                    <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">No pending comp off requests from your team.</td></tr>
                  ) : compOffs.map(co => (
                    <tr key={co.id} className="hover:bg-slate-50/80 transition-colors">
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
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 border border-black/5">
                          {co.status || "earned"}
                        </span>
                      </td>
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
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 ${toast.type === "error" ? "bg-rose-500 text-white" : "bg-purple-600 text-white"}`}>
          {toast.type === "error" ? <HiX className="w-4 h-4" /> : <HiCheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default ManagerCompOffsPage;
