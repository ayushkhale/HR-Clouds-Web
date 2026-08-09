import React from "react";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceDirectory from "../components/AttendanceDirectory";

function HRAttendancePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardTopBar user={user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <AttendanceDirectory />
          </div>
        </main>
      </div>
    </div>
  );
}

export default HRAttendancePage;
