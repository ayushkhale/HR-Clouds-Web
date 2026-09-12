import React from "react";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceDirectory from "../components/AttendanceDirectory";

function HRAttendancePage() {
  const { user } = useAuth();

  return (
    <>
        <DashboardTopBar user={user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <AttendanceDirectory />
          </div>
        </main>
    </>
  );
}

export default HRAttendancePage;
