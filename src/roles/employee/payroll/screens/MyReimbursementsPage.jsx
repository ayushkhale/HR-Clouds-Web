import React from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiCurrencyRupee, HiPlus } from "react-icons/hi";

export default function MyReimbursementsPage() {
  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="My Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiCurrencyRupee className="text-purple-600 w-7 h-7" /> My Reimbursements
              </h1>
              <p className="text-sm text-slate-500 mt-1">Submit claims and track benefit enrollments.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
            <p className="text-slate-500 font-medium">You have no active reimbursement claims.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
