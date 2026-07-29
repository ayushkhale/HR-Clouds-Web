import React from "react";
import DashboardSidebar from "../shared/components/DashboardSidebar";
import DashboardTopBar from "../shared/components/DashboardTopBar";
import { HiClock, HiDocumentText, HiCalendar, HiUser } from "react-icons/hi";

function EmployeeDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <DashboardSidebar role="employee" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Employee Portal" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Check-in Status</p>
                <p className="text-xl font-extrabold">Checked In</p>
                <p className="text-[10px] text-purple-200 mt-1">9:00 AM Today</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiClock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Leave Balance</p>
                <p className="text-xl font-extrabold">12 Days</p>
                <p className="text-[10px] text-purple-200 mt-1">Casual & Sick</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiCalendar className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Latest Payslip</p>
                <p className="text-xl font-extrabold">June 2026</p>
                <p className="text-[10px] text-purple-200 mt-1">Ready for download</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiDocumentText className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Shift Hours</p>
                <p className="text-xl font-extrabold">8.5 hrs</p>
                <p className="text-[10px] text-purple-200 mt-1">Standard shift</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiUser className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-4">Shifts & Time Tracking</h3>
              <p className="text-xs text-slate-500">Your logged hours for this week will appear here.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-4">Payslip Downloads</h3>
              <p className="text-xs text-slate-500">View and download your monthly salary slips.</p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
