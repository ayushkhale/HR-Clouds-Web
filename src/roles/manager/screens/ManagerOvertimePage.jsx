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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Overtime Requests</h1>
              <p className="text-sm text-slate-500 mt-1">Review and manage overtime requests from your team.</p>
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
