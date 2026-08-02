import React, { useState } from "react";
import { organizationAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { HiUserGroup, HiPlus, HiX, HiPaperAirplane, HiCheckCircle, HiSearch } from "react-icons/hi";

function EmployeesPage() {
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
  const [invitations, setInvitations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");

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
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Employees" />

        <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Team Directory</h1>
              <p className="text-sm text-slate-500 mt-1">Manage all organization personnel and pending invitations.</p>
            </div>
            <button
              onClick={() => {
                setInviteResult({ type: "", message: "" });
                setShowAddModal(true);
              }}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" />
              Invite Member
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <HiSearch className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member or email…"
                    className="w-full bg-slate-50/70 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex items-center bg-slate-50 p-1 rounded-xl text-xs font-bold border border-slate-100">
                  <button
                    onClick={() => setFilterTab("all")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      filterTab === "all" ? "bg-purple-100 text-purple-700" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterTab("active")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      filterTab === "active" ? "bg-purple-100 text-purple-700" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setFilterTab("pending")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      filterTab === "pending" ? "bg-purple-100 text-purple-700" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-50 pt-2">
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-normal">
                  No personnel matching "{searchQuery}"
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div key={member.id} className="py-4 flex items-center justify-between hover:bg-slate-50/50 rounded-2xl px-3 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-full bg-[#6D28D9] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-2xs">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{member.name}</p>
                          <span className="text-xs text-slate-400 font-normal">({member.email})</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium capitalize mt-0.5">
                          Role: {member.role} {member.city ? `• ${member.city}` : ""} {member.contact ? `• ${member.contact}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3.5 py-1.5 text-xs font-bold rounded-full flex items-center gap-1.5 ${
                      member.status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${member.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {member.status === "Active" ? "Active Member" : "Pending Invite"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full p-7 relative">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Invite Team Member</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address <span className="text-red-400">*</span></label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Emp ID <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                  <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Role <span className="text-red-400">*</span></label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Contact <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                  <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">City <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
              </div>

              {inviteResult.message && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${inviteResult.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {inviteResult.type === "success" && <HiCheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  {inviteResult.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">Cancel</button>
                <button type="submit" disabled={inviteLoading} className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                  {inviteLoading ? "Sending..." : <><HiPaperAirplane className="w-3.5 h-3.5" />Send Invitation</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeesPage;
