import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiClock } from "react-icons/hi";
import AttendanceApprovalQueue from "../../../../shared/attendance/AttendanceApprovalQueue";
import { InlineAlert } from "../../../../shared/attendance/ui";

// Contract §2 C1: there is no /hr/regularizations route. For HR, the manager
// pending queue is already org-wide (hierarchy filter is null for global
// approvers) and HR decisions never hit HIERARCHY_VIOLATION — so HR uses the
// same queue, dialog, remarks rules and refresh events as managers.
export default function AttendanceRegularizationsHRPage() {
  return (
    <>
      <DashboardTopBar title="Regularization Requests" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Regularizations</h1>
          <p className="text-sm text-slate-500 mt-1">Pending attendance correction requests across the organisation. HR can approve or reject any of them.</p>
        </div>

        <InlineAlert tone="sky">
          Only pending requests are listed. An organisation-wide history of approved and rejected corrections isn't available from the server yet — each employee's own history shows their past requests.
        </InlineAlert>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <AttendanceApprovalQueue type="regularization" scope="org" />
        </div>
      </main>
    </>
  );
}
