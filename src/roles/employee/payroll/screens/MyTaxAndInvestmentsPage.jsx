import React from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiDocumentReport, HiUpload } from "react-icons/hi";

export default function MyTaxAndInvestmentsPage() {
  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Tax & Investments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-5xl mx-auto w-full">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiDocumentReport className="text-purple-600 w-7 h-7" /> Tax & Investments
              </h1>
              <p className="text-sm text-slate-500 mt-1">Submit proofs and view your TDS projections (Form 16 Part B).</p>
            </div>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold flex items-center gap-2 text-sm shadow-md shadow-purple-200">
              <HiUpload className="w-5 h-5" /> Submit Proofs
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
              <p className="text-slate-500">Your tax projections for this year will appear here once processed by HR.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
