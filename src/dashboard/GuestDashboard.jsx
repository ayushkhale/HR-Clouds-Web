import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import hrcloudsLogo from "../assets/logo2.png";
import { HiOfficeBuilding, HiMail, HiArrowRight, HiCheck, HiOutlineSparkles, HiLogout } from "react-icons/hi";

function GuestDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/auth/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      {/* Top Navigation Header */}
      <header className="border-b border-gray-100 px-6 sm:px-12 py-4 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/">
            <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 font-medium hidden sm:inline-block">
              {user?.identifier || user?.email || "Guest User"}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer bg-gray-100 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200"
            >
              <HiLogout className="w-3.5 h-3.5" /> Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full mx-auto">
          {/* Header Title Section */}
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold mb-3">
              <HiOutlineSparkles className="w-3.5 h-3.5 text-purple-600" />
              Onboarding • Step 2 of 2
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2">
              Setup Your Workspace
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              How would you like to get started with HR Clouds? Choose one of the options below.
            </p>
          </div>

          {/* 2 Main Onboarding Option Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            
            {/* Option A: Register / Create Organization */}
            <div className="bg-white rounded-2xl border-2 border-purple-200 hover:border-purple-500 p-8 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />

              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-200">
                    <HiOfficeBuilding className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-[11px] font-bold rounded-full border border-purple-200">
                    For HR & Owners
                  </span>
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors">
                  Register Organization
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed mb-6">
                  Create a brand new workspace for your company. Configure payroll, manage employee attendance, and set up your HR portal.
                </p>

                <div className="space-y-2 mb-8 bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-700 font-medium">
                    <HiCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span>Free Plan & 14-day trial options</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-700 font-medium">
                    <HiCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span>Automated Statutory Payroll (India)</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-700 font-medium">
                    <HiCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span>Biometric & Geo Attendance</span>
                  </div>
                </div>
              </div>

              <Link
                to="/register-organization"
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-purple-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                Create New Organization
                <HiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Option B: Wait for Invitation Code */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 hover:border-purple-300 p-8 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                    <HiMail className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-bold rounded-full border border-gray-200">
                    For Team Members
                  </span>
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors">
                  Join Existing Organization
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed mb-6">
                  Are you an employee? If your HR or manager invited you, check your inbox for an invitation link to accept your role.
                </p>

                <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 text-xs text-gray-600 leading-relaxed mb-8">
                  <p className="font-semibold text-gray-800 mb-1">Your registered email address:</p>
                  <p className="font-mono text-purple-700 bg-white px-3 py-1.5 rounded border border-purple-200 text-center font-bold text-xs truncate">
                    {user?.identifier || user?.email || "user@company.com"}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-2 text-center">
                    Ask your HR admin to invite this email.
                  </p>
                </div>
              </div>

              <a
                href="mailto:support@hrclouds.in"
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm rounded-xl text-center transition-colors block"
              >
                Need Help? Contact Support
              </a>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400 border-t border-gray-100 bg-white">
        © {new Date().getFullYear()} HR Clouds. All rights reserved.
      </footer>
    </div>
  );
}

export default GuestDashboard;
