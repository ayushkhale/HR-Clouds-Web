import React from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceApprovalQueue from "../../../shared/attendance/AttendanceApprovalQueue";

// Shared shell for the per-type manager request pages. The queue owns fetching,
// the decision dialog and refresh events, so these pages and the Approvals
// Inbox behave identically.
export default function ManagerQueuePage({ topBarTitle, title, description, type }) {
  return (
    <>
      <DashboardTopBar title={topBarTitle || title} />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <AttendanceApprovalQueue type={type} />
        </div>
      </main>
    </>
  );
}
