import React from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiDocumentReport, HiDownload } from "react-icons/hi";

export default function PayrollReportsPage() {
  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Reports & Delivery" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentReport className="text-purple-600 w-7 h-7" /> Reports & Delivery
            </h1>
            <p className="text-sm text-slate-500 mt-1">Export payroll registers, bank NEFT files, and custom CSVs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between items-start h-40">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Payroll Register</h2>
                <p className="text-sm text-slate-500">Monthly master export of all earnings and deductions.</p>
              </div>
              <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-2 text-sm transition">
                <HiDownload className="w-4 h-4" /> Export CSV
              </button>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between items-start h-40">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Bank NEFT Advice</h2>
                <p className="text-sm text-slate-500">Generate bank-specific upload files for net payouts.</p>
              </div>
              <button className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg font-bold flex items-center gap-2 text-sm transition">
                <HiDownload className="w-4 h-4" /> Download Format
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
