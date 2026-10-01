import React from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { TeamDirectoryTable } from "./ManagerDashboard";

function ManagerTeamPage() {
  return (
    <>
      <DashboardTopBar title="Live Attendance" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <TeamDirectoryTable title="Live Attendance" headingLevel="h1" description="Today's attendance for everyone in your reporting line." />
      </main>
    </>
  );
}

export default ManagerTeamPage;
