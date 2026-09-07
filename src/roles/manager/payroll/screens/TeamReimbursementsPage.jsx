import React from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiDocumentText, HiCheck } from "react-icons/hi";

export default function TeamReimbursementsPage() {
  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Team Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentText className="text-purple-600 w-7 h-7" /> Team Reimbursements
            </h1>
            <p className="text-sm text-slate-500 mt-1">Review and approve Level 1 reimbursement claims from your direct reports.</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
            <HiCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">All caught up! No pending claims.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
