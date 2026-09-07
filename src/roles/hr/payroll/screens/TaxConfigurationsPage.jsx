import React from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HiDocumentText, HiCurrencyRupee, HiCheckCircle } from "react-icons/hi";

export default function TaxConfigurationsPage() {
  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Statutory & Tax" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentText className="text-purple-600 w-7 h-7" /> Tax & Statutory Configurations
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manage PF, ESI, Professional Tax slabs, and review Investment Declarations.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <HiCurrencyRupee className="text-emerald-500" /> PF & ESI Settings
              </h2>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">PF Wage Ceiling</span>
                  <span className="font-bold">₹15,000</span>
                </div>
                <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">ESI Gross Threshold</span>
                  <span className="font-bold">₹21,000</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <HiCheckCircle className="text-purple-500" /> Investment Declarations Queue
              </h2>
              <p className="text-sm text-slate-500 mb-4">Pending proofs to verify for TDS projections.</p>
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-400">All caught up! No pending declarations.</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
