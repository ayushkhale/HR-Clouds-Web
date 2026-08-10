import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { organizationAPI, attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiOutlineUserGroup, HiOutlineMail, HiOutlinePhone, HiOutlineOfficeBuilding,
  HiDotsHorizontal, HiUserGroup, HiSearch, HiFilter, HiPlus, HiX,
  HiMail, HiPhone, HiPaperAirplane, HiCheckCircle
} from "react-icons/hi";

import Avatar, { genConfig } from 'react-nice-avatar';

function EmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);

  // Invite form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [workLocation, setWorkLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [contact, setContact] = useState("");
  const [empId, setEmpId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [gender, setGender] = useState("");
  const [reportingManager, setReportingManager] = useState("");
  const [status, setStatus] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [allowEmployeeToFill, setAllowEmployeeToFill] = useState(false);
  const [probationPeriodDays, setProbationPeriodDays] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [spouseName, setSpouseName] = useState("");

  const [managers, setManagers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState({ type: "", message: "" });
  const [invitations, setInvitations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [openDropdownId, setOpenDropdownId] = useState(null); // Track which member's options menu is open

  const [employees, setEmployees] = useState([]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const [res, locRes, depRes] = await Promise.all([
        organizationAPI.getEmployees({ purpose: "shift_assignment" }),
        organizationAPI.getLocations().catch(() => ({ success: false, data: [] })),
        organizationAPI.getDepartments().catch(() => ({ success: false, data: [] }))
      ]);
      
      if (res.success && res.data) {
        setEmployees(res.data);
        setManagers(res.data.filter(emp => emp.role === 'manager'));
      }
      if (locRes.success && locRes.data) {
        setLocations(locRes.data);
      }
      if (depRes.success && depRes.data) {
        setDepartments(depRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch form data", error);
    }
  };

  const handleResendInvitation = async (email) => {
    try {
      setInviteResult({ type: "info", message: `Resending invitation to ${email}...` });
      await organizationAPI.resendInvitation({ email });
      setInviteResult({ type: "success", message: `Invitation resent to ${email}` });
    } catch (err) {
      setInviteResult({ type: "error", message: err.message || "Failed to resend invitation." });
    }
  };

  const handleRevokeInvitation = async (email) => {
    if (!window.confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
    try {
      setInviteResult({ type: "info", message: `Revoking invitation for ${email}...` });
      await organizationAPI.revokeInvitation({ email });
      setInviteResult({ type: "success", message: `Invitation revoked for ${email}` });
      // Remove from UI
      setInvitations(prev => prev.filter(inv => inv.email !== email));
      setEmployees(prev => prev.filter(emp => emp.email !== email));
    } catch (err) {
      setInviteResult({ type: "error", message: err.message || "Failed to revoke invitation." });
    }
  };

  async function handleInvite(e) {
    e.preventDefault();
    if (!email) return;

    setInviteLoading(true);
    setInviteResult({ type: "", message: "" });

    try {
      const payload = { 
        email, role, name, full_name: name,
        date_of_birth: dateOfBirth,
        aadhaar_number: aadhaarNumber,
        gender,
        reporting_manager: reportingManager,
        status,
        date_of_joining: dateOfJoining,
        referred_by: referredBy,
        allow_employee_to_fill: allowEmployeeToFill,
        probation_period_days: probationPeriodDays,
        emergency_contact_name: emergencyContactName,
        emergency_contact_number: emergencyContactNumber,
        father_name: fatherName,
        spouse_name: spouseName
      };
      if (workLocation) payload.location_id = workLocation;
      if (department) payload.department_id = department;
      if (designation) payload.designation = designation;
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
          workLocation,
          department,
          contact,
          empId,
          status: "Pending",
          sentAt: new Date().toLocaleDateString(),
        },
        ...prev,
      ]);

      setName(""); setEmail(""); setCity(""); setContact(""); setEmpId("");
      setDateOfBirth(""); setAadhaarNumber(""); setGender(""); setReportingManager("");
      setStatus(""); setDateOfJoining(""); setReferredBy(""); setAllowEmployeeToFill(false);
      setProbationPeriodDays(""); setEmergencyContactName(""); setEmergencyContactNumber("");
      setFatherName(""); setSpouseName("");

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
    ...employees.map(emp => ({
      id: emp.user_id || emp.id,
      name: emp.name || emp.full_name || emp.email || "Unknown",
      email: emp.email || "",
      role: emp.role || "employee",
      status: emp.status || "Active",
      city: emp.city || emp.work_location || "",
      contact: emp.contact || emp.phone_number || "",
      empId: emp.employee_code || emp.emp_id || "",
      isOwner: emp.role === 'owner',
    })),
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
      (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.email || "").toLowerCase().includes(searchQuery.toLowerCase());

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

            {/* Grid Layout instead of Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {filteredMembers.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 font-medium">
                  <HiUserGroup className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  No personnel matching "{searchQuery}"
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
                          member.status === "Active" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${member.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {member.status === "Active" ? "Active" : "Pending"}
                        </span>
                        {member.empId ? (
                          <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{member.empId}</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">—</span>
                        )}
                      </div>

                      {/* Profile Section */}
                      <div className="flex flex-col items-center text-center mb-6">
                        <div className="relative mb-4">
                          <div className="w-20 h-20 rounded-full shadow-sm overflow-hidden bg-slate-50 shrink-0 ring-2 ring-purple-100 flex items-center justify-center">
                            {member.avatar ? (
                              <img 
                                src={member.avatar} 
                                alt={member.name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Avatar className="w-full h-full" {...genConfig(member.email || member.name || String(member.id))} />
                            )}
                          </div>
                          {member.status === "Active" && (
                            <div className="absolute bottom-0.5 right-0.5 w-4.5 h-4.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
                          )}
                        </div>
                        <h3 className="text-[17px] font-bold text-slate-900 leading-tight group-hover:text-purple-700 transition-colors px-2 truncate w-full">{member.name}</h3>
                        <p className="text-xs font-semibold text-slate-400 mt-1 capitalize">
                          {member.role || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-4xl w-full p-7 relative my-8">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Invite Team Member</h3>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="flex items-center gap-2 mb-4 bg-purple-50/50 p-3 rounded-xl border border-purple-100">
                <input 
                  type="checkbox" 
                  id="allowEmployeeToFill" 
                  checked={allowEmployeeToFill} 
                  onChange={(e) => setAllowEmployeeToFill(e.target.checked)} 
                  className="w-4 h-4 text-purple-600 rounded cursor-pointer" 
                />
                <label htmlFor="allowEmployeeToFill" className="text-sm font-semibold text-purple-900 cursor-pointer select-none">
                  Allow the employee to fill in their information
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Employee No</label>
                  <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="Auto-generated if empty" className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address <span className="text-red-400">*</span></label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Mobile Number</label>
                  <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
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
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date Of Birth</label>
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Aadhaar Number</label>
                  <input type="text" value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Gender</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="">---Select---</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Reporting Manager</label>
                  <select value={reportingManager} onChange={(e) => setReportingManager(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="">---Select Manager---</option>
                    {managers.map(m => (
                      <option key={m.id || m._id} value={m.id || m._id}>{m.name || m.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="">---Select---</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Contract">Contract</option>
                    <option value="Probation">Probation</option>
                    <option value="Trainee">Trainee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date Of Joining</label>
                  <input type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Referred By <span className="text-slate-400 font-normal lowercase">(optional)</span></label>
                  <input type="text" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Probation Period (Days)</label>
                  <input type="number" value={probationPeriodDays} onChange={(e) => setProbationPeriodDays(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Work Location</label>
                  <select value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="">---Select Location---</option>
                    {locations.map(loc => (
                      <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Department</label>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                    <option value="">---Select Department---</option>
                    {departments.map(dep => (
                      <option key={dep.id || dep._id} value={dep.id || dep._id}>{dep.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Designation</label>
                  <input type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Emergency Contact Name</label>
                  <input type="text" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Emergency Contact Number</label>
                  <input type="text" value={emergencyContactNumber} onChange={(e) => setEmergencyContactNumber(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Father's Name</label>
                  <input type="text" value={fatherName} onChange={(e) => setFatherName(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Spouse Name</label>
                  <input type="text" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
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
