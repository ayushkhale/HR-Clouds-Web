import React from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { HiOutlineSparkles } from "react-icons/hi";

function EmployeeDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <DashboardSidebar role="employee" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Employee Portal" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex flex-col items-center justify-center flex-1">
          <div className="bg-white rounded-3xl border border-slate-100 p-12 shadow-sm text-center max-w-lg w-full flex flex-col items-center mt-20">
            <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-6">
              <HiOutlineSparkles className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Coming Soon</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              We are working hard to build the employee dashboard. Stay tuned for exciting new features and updates!
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
