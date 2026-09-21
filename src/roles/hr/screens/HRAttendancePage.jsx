import React from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceDirectory from "../components/AttendanceDirectory";

function HRAttendancePage() {
  return (
    <>
        <DashboardTopBar title="Live Attendance" />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <AttendanceDirectory title="Live Attendance" headingLevel="h1" />
          </div>
        </main>
    </>
  );
}

export default HRAttendancePage;
