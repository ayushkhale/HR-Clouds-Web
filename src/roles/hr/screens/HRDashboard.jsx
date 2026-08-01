import React, { useState } from "react";
import { organizationAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiUserGroup,
  HiPlus,
  HiX,
  HiMail,
  HiPaperAirplane,
  HiCheckCircle,
  HiClock,
} from "react-icons/hi";

function HRDashboard() {
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);

  // Invite form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [city, setCity] = useState("");
  const [contact, setContact] = useState("");
  const [empId, setEmpId] = useState("");

  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState({ type: "", message: "" });

  // Local state for sent invitations/team list
  const [invitations, setInvitations] = useState([]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;

    setInviteLoading(true);
    setInviteResult({ type: "", message: "" });

    try {
      const payload = {
        email,
        role,
        name,
        full_name: name,
      };

      if (city) payload.city = city;
      if (contact) {
        payload.contact = contact;
        payload.phone_number = contact;
      }
      if (empId) {
        payload.emp_id = empId;
        payload.employee_id = empId;
      }

      await organizationAPI.inviteUser(payload);

      setInviteResult({
        type: "success",
        message: `Invitation sent to ${name || email} as ${role}!`,
      });

      // Add to local list
      setInvitations((prev) => [
        {
          name: name || "Team Member",
          email,
          role,
          city,
          contact,
          empId,
          status: "Pending",
          sentAt: new Date().toLocaleDateString(),
        },
        ...prev,
      ]);

      // Reset form
      setName("");
      setEmail("");
      setCity("");
      setContact("");
      setEmpId("");

      setTimeout(() => {
        setInviteResult({ type: "", message: "" });
        setShowAddModal(false);
      }, 1500);
    } catch (err) {
      setInviteResult({
        type: "error",
        message: err.message || "Failed to send invitation. Please try again.",
      });
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Sidebar - Single "Team" item */}
      <DashboardSidebar role="hr" />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Team" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Team Page Header Banner */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <HiUserGroup className="w-6 h-6 text-purple-600" />
                <h1 className="text-xl font-bold text-slate-800">Team Management</h1>
              </div>
              <p className="text-xs text-slate-500">
                View your active organization team members and invite new personnel.
              </p>
            </div>

            {/* "+ Add Team" Button */}
            <button
              onClick={() => {
                setInviteResult({ type: "", message: "" });
                setShowAddModal(true);
              }}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-purple-200 flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" />
              Add Team
            </button>
          </div>

          {/* Team Members List / Invitations Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-sm">Team Members & Invitations</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                {1 + invitations.length} Total
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Current HR User */}
              <div className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
                    {(user?.identifier || "H").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{user?.identifier || "HR Admin"}</p>
                    <p className="text-[10px] text-slate-400">Owner / HR Admin</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              </div>

              {/* Sent Invitations */}
              {invitations.map((inv, idx) => (
                <div key={idx} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                      <HiMail className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-800">{inv.name} ({inv.email})</p>
                        {inv.empId && (
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            #{inv.empId}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 capitalize">
                        Role: {inv.role} {inv.city ? `• ${inv.city}` : ""} {inv.contact ? `• ${inv.contact}` : ""} • Invited on {inv.sentAt}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-full flex items-center gap-1">
                    <HiClock className="w-3 h-3 text-amber-500" /> Invitation Sent
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Add Team Modal / Form */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-lg w-full p-6 sm:p-7 relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Add Team Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    required
                    autoFocus
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul@company.com"
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Emp ID <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    placeholder="e.g. EMP-101"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Assign Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 transition-all bg-white"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Number <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="+91-9876543210"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    City <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {inviteResult.message && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${
                  inviteResult.type === "success"
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-red-600 bg-red-50 border-red-200"
                }`}>
                  {inviteResult.message}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading || !email || !name}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl py-2.5 transition-colors disabled:opacity-60 cursor-pointer shadow-sm shadow-purple-200"
                >
                  {inviteLoading ? (
                    "Sending…"
                  ) : (
                    <>
                      <HiPaperAirplane className="w-4 h-4 rotate-90" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HRDashboard;
