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
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                TEAM
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Team Anomalies
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Review and resolve active attendance anomalies for your team members.
              </p>
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
