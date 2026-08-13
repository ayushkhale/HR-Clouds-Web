import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { organizationAPI, attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiOutlineUserGroup, HiOutlineMail, HiOutlinePhone, HiOutlineOfficeBuilding,
  HiDotsHorizontal, HiUserGroup, HiSearch, HiFilter, HiPlus, HiX,
  HiMail, HiPhone, HiPaperAirplane, HiCheckCircle, HiChevronDown
} from "react-icons/hi";

import Avatar, { genConfig } from 'react-nice-avatar';

function EmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);

  // Invite form state
  // Required
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  
  // Optional Profile
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [contact, setContact] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [dob, setDob] = useState("");

  // Optional Organization
  const [joiningDate, setJoiningDate] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [reportingManager, setReportingManager] = useState("");
  const [makeHod, setMakeHod] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workMode, setWorkMode] = useState("");

  // Optional Compliance/Address
  const [panNumber, setPanNumber] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  const [managers, setManagers] = useState([]);
  const [hrList, setHrList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState({ type: "", message: "" });
  const [invitations, setInvitations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [openDropdownId, setOpenDropdownId] = useState(null); // Track which member's options menu is open

  // Collapsible modal sections state (false = expanded/open, true = collapsed/closed)
  const [collapsedSections, setCollapsedSections] = useState({
    section1: false,
    section2: true,
    section3: true,
    section4: true,
  });

  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [employees, setEmployees] = useState([]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Debounced pincode fetch for City and State
  useEffect(() => {
    if (pincode && pincode.length === 6) {
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
          const data = await res.json();
          if (data && data[0] && data[0].Status === "Success") {
            const postOffice = data[0].PostOffice[0];
            setCity(postOffice.District);
            setState(postOffice.State);
          }
        } catch (error) {
          console.error("Failed to fetch pincode details:", error);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pincode]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const [res, locRes, depRes, hrRes] = await Promise.all([
        organizationAPI.getEmployees({ purpose: "shift_assignment" }),
        organizationAPI.getLocations().catch(() => ({ success: false, data: [] })),
        organizationAPI.getDepartments().catch(() => ({ success: false, data: [] })),
        organizationAPI.getEmployees({ purpose: "all_hr_list" }).catch(() => ({ success: false, data: [] }))
      ]);
      
      if (res.success && res.data) {
        setEmployees(res.data);
        setManagers(res.data.filter(emp => emp.role === 'manager' || emp.role === 'hr'));
      }
      if (locRes.success && locRes.data) {
        setLocations(locRes.data);
      }
      if (depRes.success && depRes.data) {
        setDepartments(depRes.data);
      }
      if (hrRes.success && hrRes.data) {
        setHrList(hrRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch form data", error);
    }
  };

  // Fetch cascading departments when work location changes
  useEffect(() => {
    if (!showAddModal) return;
    async function fetchCascadingDepartments() {
      setDepartmentLoading(true);
      try {
        const res = await organizationAPI.getDepartments(
          workLocation ? { location_id: workLocation } : {}
        );
        if (res.success && res.data) {
          setDepartments(res.data);
          if (department && !res.data.some(d => (d.id || d._id) === department)) {
            setDepartment("");
          }
        }
      } catch (err) {
        console.error("Failed to fetch cascading departments:", err);
      } finally {
        setDepartmentLoading(false);
      }
    }
    fetchCascadingDepartments();
  }, [workLocation, showAddModal]);

  // Reset linked organization inputs when role changes
  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setWorkLocation("");
    setDepartment("");
    setReportingManager("");
    setMakeHod(false);
  };

  // Make HOD is only permitted for manager / hr roles when a department is selected
  useEffect(() => {
    if (role === "employee" || !department) {
      setMakeHod(false);
    }
  }, [role, department]);

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
      const payload = { email, role };

      if (makeHod && (role === "manager" || role === "hr") && department) {
        payload.make_hod = true;
      }
      if (name) payload.name = name;
      if (empId) payload.emp_id = empId;
      if (contact) payload.contact = contact;
      if (bloodGroup) payload.blood_group = bloodGroup;
      if (dob) payload.dob = dob;
      if (joiningDate) payload.joining_date = joiningDate;

      if (workLocation) payload.location_id = workLocation;
      if (department) payload.department_id = department;
      if (designation) payload.designation = designation;

      // Only pass reporting_person if not automatically assigned for employees with a department
      if (reportingManager && !(role === "employee" && department)) {
        payload.reporting_person = reportingManager;
      }

      if (jobStatus) payload.job_status = jobStatus;
      if (employmentType) payload.employment_type = employmentType;
      if (workMode) payload.work_mode = workMode;

      if (panNumber) payload.pan_number = panNumber;
      if (uanNumber) payload.uan_number = uanNumber;
      if (maritalStatus) payload.marital_status = maritalStatus;
      if (personalEmail) payload.personal_email = personalEmail;
      if (currentAddress) payload.current_address = currentAddress;
      if (permanentAddress) payload.permanent_address = permanentAddress;
      if (city) payload.city = city;
      if (state) payload.state = state;
      if (pincode) payload.pincode = pincode;

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

      setName(""); setEmail(""); setRole("employee"); setEmpId(""); setContact(""); 
      setBloodGroup(""); setDob(""); setMakeHod(false); setMaritalStatus(""); setPersonalEmail("");
      setWorkLocation(""); setDepartment(""); setDesignation(""); setReportingManager("");
      setJobStatus(""); setEmploymentType(""); setWorkMode(""); setJoiningDate("");
      setPanNumber(""); setUanNumber(""); setCurrentAddress("");
      setPermanentAddress(""); setIsSameAddress(false); setCity(""); setState(""); setPincode("");

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

  const rolePriority = {
    'hr': 1,
    'manager': 2,
    'employee': 3
  };

  const filteredMembers = allTeamMembers
    .filter((m) => {
      const matchesSearch =
        (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.email || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (filterTab === "active") return matchesSearch && m.status === "Active";
      if (filterTab === "pending") return matchesSearch && m.status === "Pending";
      return matchesSearch;
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
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Employees" />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Team Directory</h1>
              <p className="text-sm text-slate-500 mt-1">Manage all organization personnel and pending invitations.</p>
            </div>
            <button
              onClick={() => {
                setInviteResult({ type: "", message: "" });
                setCollapsedSections({ section1: false, section2: true, section3: true, section4: true });
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
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
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
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

            <form onSubmit={handleInvite} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              
              {/* Section 1: Required Fields */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section1")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">1. Required Information</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section1 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section1 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Employee ID <span className="text-red-400">*</span></label>
                        <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} required autoFocus className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Full Name <span className="text-red-400">*</span></label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address <span className="text-red-400">*</span></label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Role <span className="text-red-400">*</span></label>
                        <select value={role} onChange={(e) => handleRoleChange(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                          <option value="hr">HR Admin</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Profile Fields */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section2")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">2. Profile Details</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section2 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section2 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Primary Contact <span className="text-red-400">*</span></label>
                        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Personal Email</label>
                        <input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} placeholder="personal@example.com" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Marital Status</label>
                        <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="divorced">Divorced</option>
                          <option value="widowed">Widowed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Blood Group</label>
                        <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date of Birth</label>
                        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Designation</label>
                        <input type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Organization / Work */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section3")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">3. Organization & Work</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section3 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section3 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Location</label>
                        <select value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select Location---</option>
                          {locations.map(loc => <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                          Department <span className="text-red-400">*</span>
                          {departmentLoading && <span className="ml-2 text-[10px] text-purple-600 font-normal">Loading...</span>}
                        </label>
                        <select value={department} onChange={(e) => setDepartment(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select Department---</option>
                          {departments.map(dep => <option key={dep.id || dep._id} value={dep.id || dep._id}>{dep.name}</option>)}
                        </select>
                      </div>

                      {/* Make Head Of Dept. input (To the right of Department) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Make Head Of Dept.</label>
                        <select
                          value={makeHod ? "true" : "false"}
                          onChange={(e) => setMakeHod(e.target.value === "true")}
                          disabled={!department || (role !== "manager" && role !== "hr")}
                          className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="false">No</option>
                          <option value="true">Yes (Assign as HOD)</option>
                        </select>
                      </div>

                      {/* Reporting Person (Shifted to next grid position) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                          Reporting Person {role !== "employee" || !department ? <span className="text-red-400">*</span> : null}
                        </label>
                        {role === "employee" && department ? (
                          <div className="h-10 bg-purple-50/80 border border-purple-200 rounded-xl px-3.5 text-xs text-purple-800 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0"></span>
                            <span className="truncate">Auto-assigned to Department Head</span>
                          </div>
                        ) : (
                          <>
                            <select 
                              value={reportingManager} 
                              onChange={(e) => setReportingManager(e.target.value)} 
                              required 
                              className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                            >
                              <option value="">---Select Manager---</option>
                              {((role === "manager" || role === "hr") 
                                ? (hrList.length > 0 ? hrList : employees.filter(e => e.role === "hr"))
                                : managers
                              ).map(m => (
                                <option key={m.user_id || m.id || m._id} value={m.user_id || m.id || m._id}>
                                  {m.name || m.full_name || m.email} {(m.role || "").toUpperCase() ? `(${m.role.toUpperCase()})` : ""}
                                </option>
                              ))}
                            </select>
                            {(role === "manager" || role === "hr") && (
                              <p className="text-[11px] text-purple-600 font-medium mt-1">Managers and HR Admins must report to an HR Admin.</p>
                            )}
                          </>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Job Status <span className="text-red-400">*</span></label>
                        <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="probation">Probation</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="notice_period">Notice Period</option>
                          <option value="terminated">Terminated</option>
                          <option value="trainee">Trainee</option>
                          <option value="contract">Contract</option>
                          <option value="temporary">Temporary</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Employment Type <span className="text-red-400">*</span></label>
                        <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="full_time">Full Time</option>
                          <option value="part_time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="intern">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Work Mode <span className="text-red-400">*</span></label>
                        <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all">
                          <option value="">---Select---</option>
                          <option value="on-site">On-Site</option>
                          <option value="remote">Remote</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="field">Field</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Joining Date</label>
                        <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Compliance & Address */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleSection("section4")}
                  className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <h4 className="text-sm font-bold text-slate-800">4. Compliance & Address</h4>
                  <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${!collapsedSections.section4 ? "rotate-180" : ""}`} />
                </button>
                {!collapsedSections.section4 && (
                  <div className="p-5 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">PAN Number</label>
                        <input type="text" value={panNumber} onChange={(e) => setPanNumber(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">UAN Number</label>
                        <input type="text" value={uanNumber} onChange={(e) => setUanNumber(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Pincode</label>
                        <input type="text" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} placeholder="6-digit pincode" className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="hidden lg:block lg:col-span-1"></div>
                      
                      <div className="col-span-full">
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Current Address</label>
                        <input type="text" value={currentAddress} onChange={(e) => {
                          setCurrentAddress(e.target.value);
                          if (isSameAddress) setPermanentAddress(e.target.value);
                        }} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="col-span-full">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Permanent Address <span className="text-red-400">*</span></label>
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={isSameAddress}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              onChange={(e) => {
                                setIsSameAddress(e.target.checked);
                                if (e.target.checked) setPermanentAddress(currentAddress);
                              }}
                            />
                            <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">Same as Current</span>
                          </label>
                        </div>
                        <input type="text" value={permanentAddress} onChange={(e) => {
                          setPermanentAddress(e.target.value);
                          setIsSameAddress(false);
                        }} required className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">City</label>
                        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">State</label>
                        <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
                      </div>
                      <div className="hidden lg:block lg:col-span-2"></div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Close the scrollable body div */}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl">
                {inviteResult.message && (
                  <div className={`mr-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${inviteResult.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {inviteResult.type === "success" && <HiCheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    {inviteResult.message}
                  </div>
                )}
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">Cancel</button>
                <button type="submit" disabled={inviteLoading} className="px-6 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer">
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
