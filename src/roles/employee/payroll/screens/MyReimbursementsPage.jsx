import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiDocumentText } from "react-icons/hi";

export default function MyReimbursementsPage() {
  return (
    <>
        <DashboardTopBar title="My Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">My Reimbursements
            </h1>
            <p className="text-sm text-slate-500 mt-1">Submit claims and track benefit enrollments.</p>
          </div>

          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm mt-6">
            <HiDocumentText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No claims yet</h3>
            <p className="text-slate-500 text-sm mt-1">Reimbursement claims ship in an upcoming payroll release.</p>
          </div>
        </main>
    </>
  );
}
