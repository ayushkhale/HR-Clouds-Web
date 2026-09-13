import React from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { TeamDirectoryTable } from "./ManagerDashboard";

function ManagerTeamPage() {
  return (
    <>
      <DashboardTopBar title="My Team" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Status Today</h1>
          <p className="text-sm text-slate-500 mt-1">Live attendance for everyone in your reporting line.</p>
        </div>
        <TeamDirectoryTable />
      </main>
    </>
  );
}

export default ManagerTeamPage;
