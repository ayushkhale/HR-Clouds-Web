import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { organizationAPI } from "../../../shared/api";
import { FilterTabs } from "../../../shared/attendance/ui";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiUserGroup, HiSearch, HiMail, HiOfficeBuilding, HiRefresh, HiBan,
} from "react-icons/hi";
import { Toast, useToast } from "../../../shared/attendance/ui";

import GenderAvatar, { avatarUrlOf, genderOf } from "../../../shared/components/GenderAvatar";

/** "hr" → "HR", "employee" → "Employee". */
const titleCaseRole = (r) => (r === "hr" ? "HR" : r ? r.charAt(0).toUpperCase() + r.slice(1) : r);

function EmployeesPage() {
  const navigate = useNavigate();

  // Invite form state
  // Required
  
  // Optional Profile

  // Optional Organization

  // Optional Compliance/Address

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");


  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await organizationAPI.getEmployees({ purpose: "shift_assignment" });
      if (res.success && res.data) setEmployees(res.data);
    } catch (error) {
      console.error("Failed to fetch form data", error);
    }
  };

  // Pending-invite actions run from the cards, outside the invite modal, so
  // they report through the page toast. One action per address at a time.
  const { toast, showToast, clearToast } = useToast();
  const [inviteBusy, setInviteBusy] = useState("");

  const handleResendInvitation = async (email) => {
    if (!email || inviteBusy) return;
    setInviteBusy(email);
    try {
      await organizationAPI.resendInvitation({ email });
      showToast(`Invitation resent to ${email}`);
    } catch (err) {
      showToast(err?.data?.message || err.message || "Couldn't resend the invitation.", "error");
    } finally {
      setInviteBusy("");
    }
  };

  const handleRevokeInvitation = async (email) => {
    if (!email || inviteBusy) return;
    if (!(await window.confirm(`Revoke the invitation for ${email}?\n\nThe link in their email stops working. You can invite them again later.`))) return;
    setInviteBusy(email);
    try {
      await organizationAPI.revokeInvitation({ email });
      // The employee list can carry the invitee too (status "Pending"); drop only
      // that pending row, never an active person who shares the address.
      setEmployees((prev) => prev.filter((emp) => !(emp.email === email && String(emp.status || "").toLowerCase() === "pending")));
      showToast(`Invitation revoked for ${email}`);
    } catch (err) {
      showToast(err?.data?.message || err.message || "Couldn't revoke the invitation.", "error");
    } finally {
      setInviteBusy("");
    }
  };

  const allTeamMembers = [
    ...employees.map(emp => ({
      id: emp.user_id || emp.id,
      name: emp.name || emp.full_name || emp.email || "Unknown",
      email: emp.email || "",
      role: emp.role || "employee",
      status: emp.status || "Active",
      city: emp.city || emp.work_location || "",
      contact: emp.contact || emp.phone_number || "",
      empId: emp.employee_code || emp.emp_id || "",
      department: (typeof emp.department === "string" ? emp.department : emp.department?.name) || emp.department_name || "",
      isOwner: emp.role === 'owner',
      gender: genderOf(emp),
      avatar: avatarUrlOf(emp),
    })),
  ];

  const rolePriority = {
    'hr': 1,
    'manager': 2,
    'employee': 3
  };

  // Only the roles somebody is actually in become tabs, so a segment can never
  // lead to an empty list. `owner` and `admin` appear when the org has them,
  // which is why this is derived rather than a fixed list — and each tab carries
  // its own count, the way a segmented filter should.
  const roleTabs = [
    { value: "", label: `All (${allTeamMembers.length})` },
    ...[...new Set(allTeamMembers.map((m) => String(m.role || "").toLowerCase()).filter(Boolean))]
      .sort((a, b) => (rolePriority[a] || 4) - (rolePriority[b] || 4) || a.localeCompare(b))
      .map((r) => ({
        value: r,
        label: `${titleCaseRole(r)} (${allTeamMembers.filter((m) => String(m.role || "").toLowerCase() === r).length})`,
      })),
  ];

  const filteredMembers = allTeamMembers
    .filter((m) => {
      const matchesSearch =
        (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.email || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = !roleFilter || String(m.role || "").toLowerCase() === roleFilter;

      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const priorityA = rolePriority[a.role?.toLowerCase()] || 4;
      const priorityB = rolePriority[b.role?.toLowerCase()] || 4;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

  return (
    <>
        <DashboardTopBar title="Team" />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Team</h1>
              <p className="text-sm text-slate-500 mt-1">Manage all organization personnel and pending invitations.</p>
            </div>
            <button
              onClick={() => navigate("/dashboard/hr/invites")}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0 whitespace-nowrap"
            >
              <HiMail className="w-4 h-4" />
              Invites
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            {/* Same shape as Live Attendance: the role segments on the left,
                search on the right. Roles are a small fixed set you switch
                between, which is what segments are for — a dropdown hid them. */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <FilterTabs options={roleTabs} value={roleFilter} onChange={setRoleFilter} />
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative sm:w-64">
                  <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member or email…"
                    aria-label="Search people"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                  />
                </div>
                <p className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                  {filteredMembers.length} {filteredMembers.length === 1 ? "person" : "people"}
                </p>
              </div>
            </div>

            {/* Grid Layout instead of Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {filteredMembers.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 font-medium">
                  <HiUserGroup className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  {searchQuery
                    ? <>No personnel matching &ldquo;{searchQuery}&rdquo;{roleFilter ? ` in ${titleCaseRole(roleFilter)}` : ""}</>
                    : roleFilter
                      ? `Nobody in this organisation has the ${titleCaseRole(roleFilter)} role.`
                      : "No personnel yet. Invite someone to get started."}
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => { if (member.status !== "Pending") navigate(`/dashboard/hr/employees/${member.id}`); }}
                    className="bg-white rounded-[20px] border border-slate-100 hover:border-purple-200 hover:shadow-md hover:-translate-y-1 transition-all duration-200 group cursor-pointer relative flex flex-col overflow-hidden shadow-sm"
                  >

                    <div className="p-6 flex-1 flex flex-col">
                      {/* Status & Emp Code Row */}
                      <div className="flex justify-between items-center mb-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full ${
                          member.status === "Active" ? "bg-violet-50 text-violet-600 border border-violet-100" : "bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${member.status === "Active" ? "bg-violet-500" : "bg-fuchsia-500"}`} />
                          {member.status === "Active" ? "Active" : "Pending"}
                        </span>
                        {member.empId ? (
                          <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{member.empId}</span>
                        ) : (
                          <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200" title="No employee code on file">N/A</span>
                        )}
                      </div>

                      {/* Profile Section */}
                      <div className="flex flex-col items-center text-center mb-6">
                        <div className="relative mb-4">
                          <div className="w-20 h-20 rounded-full shadow-sm overflow-hidden bg-slate-50 shrink-0 ring-2 ring-purple-100 flex items-center justify-center">
                            <GenderAvatar person={member} name={member.name} />
                          </div>
                          {member.status === "Active" && (
                            <div className="absolute bottom-0.5 right-0.5 w-4.5 h-4.5 bg-violet-500 border-2 border-white rounded-full shadow-sm" />
                          )}
                        </div>
                        <h3 className="text-[17px] font-bold text-slate-900 leading-tight group-hover:text-purple-700 transition-colors px-2 truncate w-full">{member.name}</h3>
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase">
                          {member.role || "N/A"}
                        </p>
                        {member.status !== "Pending" && (
                          <span
                            className={`mt-2.5 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full text-[11px] font-semibold border ${member.department ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                            title={member.department || "No department assigned"}
                          >
                            <HiOfficeBuilding className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{member.department || "No department"}</span>
                          </span>
                        )}
                        {member.status === "Pending" && member.email && (
                          <div className="mt-3 flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleResendInvitation(member.email)}
                              disabled={!!inviteBusy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 hover:bg-purple-100 transition disabled:opacity-50"
                            >
                              <HiRefresh className={`w-3.5 h-3.5 ${inviteBusy === member.email ? "animate-spin" : ""}`} /> Resend
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeInvitation(member.email)}
                              disabled={!!inviteBusy}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 transition disabled:opacity-50"
                            >
                              <HiBan className="w-3.5 h-3.5" /> Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

      <Toast toast={toast} onClose={clearToast} />

    </>
  );
}

export default EmployeesPage;
