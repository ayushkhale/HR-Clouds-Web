import React, { useState, useEffect } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import TeamStatusToday from "../components/TeamStatusToday";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function ManagerTeamPage() {
  const [teamToday, setTeamToday] = useState([]);

  useEffect(() => {
    fetchTeamToday();
  }, []);

  const fetchTeamToday = async () => {
    try {
      const res = await attendanceAPI.getManagerTeamToday();
      if (res.success) {
        setTeamToday(res.data || []);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <>
        <DashboardTopBar title="Team Status Today" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Team Status Today</h1>
              <p className="text-sm text-slate-500 mt-1">Monitor your team's real-time attendance, punctuality, and operational status.</p>
            </div>
          </div>

          <TeamStatusToday team={teamToday} />
        </main>
    </>
  );
}

export default ManagerTeamPage;
