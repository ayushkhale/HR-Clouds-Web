import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { organizationAPI, attendanceAPI } from "../../../shared/api";
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
  HiClipboardList,
  HiCollection,
  HiCalendar,
  HiTemplate,
  HiSparkles,
  HiSearch,
  HiOutlineUserGroup,
  HiOutlineClock,
  HiOutlineClipboardList,
  HiOutlineCalendar,
} from "react-icons/hi";

function HRDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [invitations, setInvitations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // "all" | "active" | "pending"

  // Quick action toolbar items
  const quickActions = [
    { label: "Policies", icon: HiClipboardList, path: "/dashboard/hr/attendance/policies" },
    { label: "Shifts", icon: HiClock, path: "/dashboard/hr/attendance/shifts" },
    { label: "Roster", icon: HiCollection, path: "/dashboard/hr/attendance/roster" },
    { label: "Holidays", icon: HiCalendar, path: "/dashboard/hr/attendance/holidays" },
    { label: "Weekly Offs", icon: HiTemplate, path: "/dashboard/hr/attendance/weekly-offs" },
  ];

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;

    setInviteLoading(true);
    setInviteResult({ type: "", message: "" });

    try {
      const payload = { email, role, name, full_name: name };
      if (city) payload.city = city;
      if (contact) { payload.contact = contact; payload.phone_number = contact; }
      if (empId) { payload.emp_id = empId; payload.employee_id = empId; }

      await organizationAPI.inviteUser(payload);

      setInviteResult({
        type: "success",
        message: `Invitation sent to ${name || email}!`,
      });

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

      setName(""); setEmail(""); setCity(""); setContact(""); setEmpId("");

      setTimeout(() => {
        setInviteResult({ type: "", message: "" });
        setShowAddModal(false);
      }, 1500);
    } catch (err) {
      setInviteResult({
        type: "error",
        message: err.message || "Failed to send invitation.",
      });
    } finally {
      setInviteLoading(false);
    }
  }

  // Combine current HR user + sent invitations for search & filter
  const allTeamMembers = [
    {
      id: "owner",
      name: user?.identifier || "HR Admin",
      email: user?.email || "admin@company.com",
      role: "HR Admin",
      status: "Active",
      isOwner: true,
    },
    ...invitations.map((inv, idx) => ({
      id: `inv-${idx}`,
      name: inv.name,
      email: inv.email,
      role: inv.role,
      status: "Pending",
      city: inv.city,
      contact: inv.contact,
      empId: inv.empId,
      sentAt: inv.sentAt,
    })),
  ];

  const filteredMembers = allTeamMembers.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterTab === "active") return matchesSearch && m.status === "Active";
    if (filterTab === "pending") return matchesSearch && m.status === "Pending";
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <DashboardSidebar role="hr" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="HR Dashboard" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Top Banner */}
          <div className="bg-purple-900 rounded-xl p-5 sm:p-6 text-white border border-purple-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-purple-800 text-purple-200 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                  <HiSparkles className="w-3 h-3 text-purple-300" />
                  HR Command Center
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Welcome back, {user?.identifier || "HR Administrator"}
              </h1>
              <p className="text-xs text-purple-200 mt-0.5">
                Manage team invitations, attendance rules, shift rosters, and holidays.
              </p>
            </div>

            <button
              onClick={() => {
                setInviteResult({ type: "", message: "" });
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-white text-purple-900 hover:bg-purple-50 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" />
              Invite Member
            </button>
          </div>

          {/* SaaS Operational Metrics Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Personnel</span>
                <HiOutlineUserGroup className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-800 mt-2">{1 + invitations.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">1 Active • {invitations.length} Pending</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Invites</span>
                <HiMail className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-800 mt-2">{invitations.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Awaiting user response</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attendance Rules</span>
                <HiOutlineClipboardList className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-800 mt-2">Active</p>
              <p className="text-[10px] text-purple-600 font-medium mt-0.5 hover:underline cursor-pointer" onClick={() => navigate("/dashboard/hr/attendance/policies")}>
                Configure Policies →
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Work Shifts</span>
                <HiOutlineClock className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-800 mt-2">Configured</p>
              <p className="text-[10px] text-purple-600 font-medium mt-0.5 hover:underline cursor-pointer" onClick={() => navigate("/dashboard/hr/attendance/shifts")}>
                Manage Shifts →
              </p>
            </div>
          </div>

          {/* Quick Shortcuts Bar (Positioned directly above Team Directory) */}
          <div className="space-y-2">
            <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Attendance
            </h2>
            <div className="flex items-center gap-2.5 flex-wrap">
              {quickActions.map((action) => {
                const IconComp = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200/70 hover:border-purple-300 text-xs font-medium transition-all cursor-pointer"
                  >
                    <IconComp className="w-4 h-4 text-purple-600" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Operational Table: Team Directory */}
          <div className="bg-white rounded-xl border border-slate-200/70 overflow-hidden">
            {/* Table Header Controls */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-800 text-sm">Team Directory & Invitations</h2>
                <p className="text-xs text-slate-400 mt-0.5">View organization members and manage pending invites</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* Search Bar */}
                <div className="relative flex-1 sm:w-64">
                  <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member or email…"
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setFilterTab("all")}
                    className={`px-2.5 py-1 rounded-md transition-all ${filterTab === "all" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterTab("active")}
                    className={`px-2.5 py-1 rounded-md transition-all ${filterTab === "active" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setFilterTab("pending")}
                    className={`px-2.5 py-1 rounded-md transition-all ${filterTab === "pending" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-slate-100">
              {filteredMembers.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  No personnel matching "{searchQuery}"
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div key={member.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center ${
                        member.isOwner ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-700 border border-purple-100"
                      }`}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-800">{member.name}</p>
                          <span className="text-[10px] text-slate-400 font-mono">({member.email})</span>
                          {member.empId && (
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              #{member.empId}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 capitalize mt-0.5">
                          Role: {member.role} {member.city ? `• ${member.city}` : ""} {member.contact ? `• ${member.contact}` : ""} {member.sentAt ? `• Invited: ${member.sentAt}` : ""}
                        </p>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                      member.status === "Active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {member.status === "Active" ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active Member
                        </>
                      ) : (
                        <>
                          <HiClock className="w-3 h-3 text-amber-500" /> Pending Invite
                        </>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Add Team Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 relative">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Invite Team Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>

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
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
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
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
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
                    placeholder="EMP001"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 outline-none focus:border-purple-500 transition-colors bg-white"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
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
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {inviteResult.message && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    inviteResult.type === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {inviteResult.type === "success" && <HiCheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  {inviteResult.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {inviteLoading ? (
                    "Sending..."
                  ) : (
                    <>
                      <HiPaperAirplane className="w-3.5 h-3.5" />
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
