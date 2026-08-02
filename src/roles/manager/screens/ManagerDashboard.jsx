import React from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { HiUserGroup, HiClipboardList, HiChartBar } from "react-icons/hi";

function ManagerDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <DashboardSidebar role="manager" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Manager Workspace" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Direct Reports</p>
                <p className="text-xl font-extrabold">8 Members</p>
                <p className="text-[10px] text-purple-200 mt-1">Active team</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiUserGroup className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Pending Approvals</p>
                <p className="text-xl font-extrabold">2 Requests</p>
                <p className="text-[10px] text-purple-200 mt-1">Leave & Expenses</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiClipboardList className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Team Attendance</p>
                <p className="text-xl font-extrabold">100% Present</p>
                <p className="text-[10px] text-purple-200 mt-1">Today</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiUserGroup className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Team Goals</p>
                <p className="text-xl font-extrabold">4 Active</p>
                <p className="text-[10px] text-purple-200 mt-1">Quarterly OKRs</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <HiChartBar className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-4">Team Roster</h3>
              <p className="text-xs text-slate-500">Your direct reports overview will appear here.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-4">Team Approvals</h3>
              <p className="text-xs text-slate-500">Review pending leave applications and expense submissions.</p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

export default ManagerDashboard;
