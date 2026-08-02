import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiUserGroup,
  HiMail,
  HiClock,
  HiClipboardList,
  HiCalendar,
  HiTemplate,
  HiSparkles,
} from "react-icons/hi";

function HRDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Keep dummy invitations state to prevent breaking the metrics cards
  const [invitations] = useState([]);

  // Quick action toolbar items
  const quickActions = [
    { label: "Policies", icon: HiClipboardList, path: "/dashboard/hr/attendance/policies" },
    { label: "Shifts", icon: HiClock, path: "/dashboard/hr/attendance/shifts" },
    { label: "Roster", icon: HiUserGroup, path: "/dashboard/hr/attendance/roster" },
    { label: "Holidays", icon: HiCalendar, path: "/dashboard/hr/attendance/holidays" },
    { label: "Weekly Offs", icon: HiTemplate, path: "/dashboard/hr/attendance/weekly-offs" },
  ];

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="HR Dashboard" />

        <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            {/* Subtle background radial pattern rings */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="absolute right-12 top-12 w-64 h-64 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-24 top-24 w-40 h-40 border border-white/20 rounded-full opacity-20 pointer-events-none" />

            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                HR COMMAND CENTER
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Welcome back, {user?.identifier || "HR Administrator"}
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Manage team invitations, attendance rules, shift rosters, and holidays.
              </p>
            </div>

            <img 
              src="https://cdn.iconscout.com/strapi/hero_image_3_D_characters_33a9f45068.png?f=webp&w=312" 
              alt="HR Team Characters" 
              className="relative z-10 w-36 sm:w-56 md:w-64 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-6 sm:-mb-8"
            />
          </div>

          {/* SaaS Operational Metrics Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <HiUserGroup className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">TOTAL PERSONNEL</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{1 + invitations.length}</p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">1 Active • {invitations.length} Pending</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <HiMail className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">PENDING INVITES</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{invitations.length}</p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Awaiting user response</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <HiClipboardList className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ATTENDANCE RULES</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">Active</p>
                <p className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer mt-0.5" onClick={() => navigate("/dashboard/hr/attendance/policies")}>
                  Configure Policies →
                </p>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <HiClock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">WORK SHIFTS</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">Configured</p>
                <p className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer mt-0.5" onClick={() => navigate("/dashboard/hr/attendance/shifts")}>
                  Manage Shifts →
                </p>
              </div>
            </div>
          </div>

          {/* Attendance Shortcuts Bar */}
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              ATTENDANCE
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {quickActions.map((action) => {
                const IconComp = action.icon;
                const isActive = location.pathname === action.path;

                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                      isActive
                        ? "bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]"
                        : "bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50"
                    }`}
                  >
                    <IconComp className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-[#6D28D9]"}`} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
          
        </main>
      </div>
    </div>
  );
}

export default HRDashboard;
