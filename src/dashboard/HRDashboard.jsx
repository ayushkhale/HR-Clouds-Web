import React, { useState } from "react";
import { organizationAPI } from "../shared/api";
import DashboardSidebar from "../shared/components/DashboardSidebar";
import DashboardTopBar from "../shared/components/DashboardTopBar";
import {
  HiUserGroup,
  HiCalendar,
  HiClipboardCheck,
  HiCurrencyRupee,
  HiPaperAirplane,
} from "react-icons/hi";

function HRDashboard() {
  // Invite form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState({ type: "", message: "" });

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;

    setInviteLoading(true);
    setInviteResult({ type: "", message: "" });

    try {
      await organizationAPI.inviteUser({ email, role });
      setInviteResult({
        type: "success",
        message: `Invitation sent to ${email} as ${role}!`,
      });
      setEmail("");
    } catch (err) {
      setInviteResult({
        type: "error",
        message: err.message || "Failed to send invitation.",
      });
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Sidebar */}
      <DashboardSidebar role="hr" />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="HR Dashboard" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm max-w-xl">
            <div className="flex items-center gap-2 mb-1">
              <HiUserGroup className="w-5 h-5 text-purple-600" />
              <h2 className="font-bold text-slate-800 text-base">Invite Team Member</h2>
            </div>
            <p className="text-xs text-slate-500 mb-6">Send an email invitation to onboard a new employee or manager.</p>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee@company.com"
                  required
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Assign Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 transition-all bg-white"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={inviteLoading || !email}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl py-3 transition-colors disabled:opacity-60 cursor-pointer shadow-sm shadow-purple-200"
              >
                {inviteLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    <HiPaperAirplane className="w-4 h-4 rotate-90" />
                    Send Invitation
                  </>
                )}
              </button>

              {inviteResult.message && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${
                  inviteResult.type === "success"
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-red-600 bg-red-50 border-red-200"
                }`}>
                  {inviteResult.message}
                </p>
              )}
            </form>
          </div>

        </main>
      </div>
    </div>
  );
}

export default HRDashboard;
