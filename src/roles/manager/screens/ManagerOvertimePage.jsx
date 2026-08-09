import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import PendingOvertime from "../components/PendingOvertime";
import ActionModal from "../components/ActionModal";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function ManagerOvertimePage() {
  const [pendingOT, setPendingOT] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, id: null, title: '' });

  useEffect(() => {
    fetchPendingOT();
  }, []);

  const fetchPendingOT = async () => {
    try {
      const res = await attendanceAPI.getManagerPendingOvertime();
      if (res.success) {
        setPendingOT(res.data?.map(req => ({
          ...req,
          employeeName: req.user?.profile ? `${req.user.profile.first_name} ${req.user.profile.last_name}` : (req.user?.identifier || 'Unknown'),
          overtimeMinutes: req.overtime_minutes || 0
        })) || []);
      }
    } catch (err) { console.error(err); }
  };

  const handleReview = (type, id, title) => {
    setModalState({ isOpen: true, type, id, title });
  };

  const handleExecuteAction = async (decision, remarks) => {
    const payload = { remarks };
    try {
      let res;
      if (modalState.type === 'ot') {
        if (decision === 'approve') res = await attendanceAPI.approveManagerOvertime(modalState.id, payload);
        else res = await attendanceAPI.rejectManagerOvertime(modalState.id, payload);
      }

      if (res && res.success) {
        setModalState({ ...modalState, isOpen: false });
        fetchPendingOT();
      }
    } catch (err) {
      console.error(err);
      alert("Action failed to execute");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="OverTime Requests" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                REQUESTS
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                OverTime Requests
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Review and manage overtime requests from your team.
              </p>
            </div>
          </div>

          <PendingOvertime overtime={pendingOT} onReview={handleReview} />
        </main>
      </div>

      <ActionModal 
        isOpen={modalState.isOpen}
        title={modalState.title}
        type={modalState.type}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        onExecute={handleExecuteAction}
      />
    </div>
  );
}

export default ManagerOvertimePage;
