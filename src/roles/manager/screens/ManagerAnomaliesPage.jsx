import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import ActiveAnomalies from "../components/ActiveAnomalies";
import ActionModal from "../components/ActionModal";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function ManagerAnomaliesPage() {
  const [anomalies, setAnomalies] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, id: null, title: '' });

  useEffect(() => {
    fetchAnomalies();
  }, []);

  const fetchAnomalies = async () => {
    try {
      const res = await attendanceAPI.getManagerAnomalies();
      if (res.success) {
        setAnomalies(res.data?.map(anomaly => ({
          ...anomaly,
          employeeName: anomaly.user?.profile ? `${anomaly.user.profile.first_name} ${anomaly.user.profile.last_name}` : (anomaly.user?.identifier || anomaly.user_id.split('-')[0])
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
      if (modalState.type === 'anomaly') {
        if (decision === 'resolve') res = await attendanceAPI.resolveManagerAnomaly(modalState.id, payload);
      }

      if (res && res.success) {
        setModalState({ ...modalState, isOpen: false });
        fetchAnomalies();
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
        <DashboardTopBar title="Team Anomalies" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Team Anomalies</h1>
              <p className="text-sm text-slate-500 mt-1">Review and resolve active attendance anomalies for your team members.</p>
            </div>
          </div>

          <ActiveAnomalies anomalies={anomalies} onReview={handleReview} />
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

export default ManagerAnomaliesPage;
