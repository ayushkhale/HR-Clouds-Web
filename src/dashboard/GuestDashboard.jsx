import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import DashboardSidebar from "../shared/components/DashboardSidebar";
import DashboardTopBar from "../shared/components/DashboardTopBar";
import { HiOfficeBuilding, HiMail, HiArrowRight, HiCheck, HiOutlineSparkles } from "react-icons/hi";

function GuestDashboard() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Left Sidebar */}
      <DashboardSidebar role="guest" />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <DashboardTopBar title="Dashboard" />

        {/* Main Dashboard Body */}
        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
          {/* 4 Purple Metric Stat Cards matching the UI reference image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Stat 1 */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Account Status</p>
                <p className="text-2xl font-extrabold">Active</p>
                <p className="text-[10px] text-purple-200 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ready to onboard
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center font-bold text-xs bg-white/10">
                100%
              </div>
            </div>

            {/* Stat 2 */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Workspace Count</p>
                <p className="text-2xl font-extrabold">0 Orgs</p>
                <p className="text-[10px] text-purple-200 mt-1">
                  +0% Increase
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center font-bold text-xs bg-white/10">
                0%
              </div>
            </div>

            {/* Stat 3 */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Invitations Received</p>
                <p className="text-2xl font-extrabold">0 Pending</p>
                <p className="text-[10px] text-purple-200 mt-1">
                  Check spam folder
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center font-bold text-xs bg-white/10">
                0/0
              </div>
            </div>

            {/* Stat 4 */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-md shadow-purple-200/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 mb-1">Profile Email</p>
                <p className="text-sm font-bold truncate max-w-[110px]">{user?.identifier || "Guest"}</p>
                <p className="text-[10px] text-purple-200 mt-1">
                  Verified profile
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center font-bold text-xs bg-white/10">
                +74%
              </div>
            </div>

          </div>

          {/* Middle Layout: Setup Workspace Action Card vs Invite Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            
            {/* Left Main Action (2 Columns) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-7 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-600" />
                    <h2 className="text-lg font-bold text-slate-800">Setup Company Workspace</h2>
                  </div>
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-100 flex items-center gap-1">
                    <HiOutlineSparkles /> Admin Portal
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-6">
                  Are you an HR administrator or business owner? Create a new workspace for your company, configure check-in policies, run compliance payrolls, and invite your team.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <HiCheck className="w-4 h-4 text-purple-600 mb-2" />
                    <p className="text-xs font-bold text-slate-800">14-Day Trial</p>
                    <p className="text-[10px] text-slate-400">Full access on plans</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <HiCheck className="w-4 h-4 text-purple-600 mb-2" />
                    <p className="text-xs font-bold text-slate-800">Automated Payroll</p>
                    <p className="text-[10px] text-slate-400">India tax compliance</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <HiCheck className="w-4 h-4 text-purple-600 mb-2" />
                    <p className="text-xs font-bold text-slate-800">Attendance Log</p>
                    <p className="text-[10px] text-slate-400">Geo & biometric rules</p>
                  </div>
                </div>
              </div>

              <Link
                to="/register-organization"
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl transition-all shadow-sm shadow-purple-200 flex items-center justify-center gap-2"
              >
                Register New Workspace
                <HiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Right Card: Waiting for Invite (1 Column) */}
            <div className="bg-white rounded-2xl border border-slate-100 p-7 shadow-sm flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <HiMail className="text-purple-600" />
                  Team Invitation
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed mb-6">
                  Joined an existing company? Search your email inbox for an invitation link sent by your manager or HR.
                </p>

                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 text-xs text-slate-600 leading-relaxed mb-6">
                  <p className="font-semibold text-slate-800 mb-1">Your registered email:</p>
                  <p className="font-mono text-purple-700 bg-white px-2.5 py-1 rounded border border-purple-100 text-center font-bold">
                    {user?.identifier || "user@example.com"}
                  </p>
                </div>
              </div>

              <a
                href="mailto:support@hrclouds.in"
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl text-center transition-colors block"
              >
                Contact Support
              </a>
            </div>

          </div>

          {/* Bottom Layout: Activity Feed & Upcoming Meetings matching reference image */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Activity Feed */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm">Activity Feed</h3>
                <span className="text-[10px] text-slate-400 font-semibold">Live status</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-bold text-xs flex items-center justify-center">
                      HR
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Account Registration</p>
                      <p className="text-[10px] text-slate-400">Created profile account</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-lg">
                    Completed
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-bold text-xs flex items-center justify-center">
                      WO
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Workspace Selection</p>
                      <p className="text-[10px] text-slate-400">Pending workspace selection</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg">
                    Pending
                  </span>
                </div>
              </div>
            </div>

            {/* Support / Quick Links */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm">Need Help?</h3>
                <span className="text-[10px] text-slate-400 font-semibold">24/7 Support</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-bold text-slate-800 mb-1">HR Clouds Knowledge Base</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                  Read documentation on how to configure shifts, tax rules, and payroll processing.
                </p>
                <Link to="/" className="text-xs font-bold text-purple-600 hover:underline">
                  Visit Documentation →
                </Link>
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}

export default GuestDashboard;
