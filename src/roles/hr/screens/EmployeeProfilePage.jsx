import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { organizationAPI } from "../../../shared/api";
import { canBeHOD } from "../../../shared/auth/permissions";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import OverviewTab from "./employee-profile/OverviewTab";
import AttendanceTab from "./employee-profile/AttendanceTab";
import ProfileTab from "./employee-profile/ProfileTab";
import ReportsTab from "./employee-profile/ReportsTab";
import LeaveTab from "./employee-profile/LeaveTab";
import {
  HiOutlineUser, HiOutlineClock, HiOutlineDocumentText, HiOutlineChartSquareBar,
  HiOutlineCalendar,
  HiTrash, HiBan, HiCheckCircle, HiX, HiDotsHorizontal, HiSwitchHorizontal
} from "react-icons/hi";

const TABS = [
  { key: "overview", label: "Overview", icon: HiOutlineChartSquareBar },
  { key: "attendance", label: "Attendance", icon: HiOutlineClock },
  { key: "leave", label: "Leave", icon: HiOutlineCalendar },
  { key: "profile", label: "Profile", icon: HiOutlineUser },
  { key: "reports", label: "Reports", icon: HiOutlineDocumentText },
];

import Avatar, { genConfig } from 'react-nice-avatar';

function DepartmentTransferModal({ userId, employeeRole, onClose, onSuccess }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [requiresFallback, setRequiresFallback] = useState(false);

  const [form, setForm] = useState({
    new_department_id: "",
    new_manager_id: "",
    is_current_hod: false,
    is_new_hod: false,
    replacement_hod_id: "",
    old_dept_fallback_manager_id: ""
  });

  useEffect(() => {
    Promise.all([
      organizationAPI.getDepartments(),
      organizationAPI.getEmployees({ purpose: "shift_assignment" })
    ])
      .then(([deptRes, empRes]) => {
        setDepartments(deptRes.data || []);
        const members = empRes.data || [];
        setEmployees(Array.isArray(members) ? members : (members.employees || members.members || []));
      })
      .catch(() => setError("Failed to load departments or employees."))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const isManagerial = employeeRole === "manager" || employeeRole === "hr";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side guards mirroring the backend transfer contract.
    if (!form.new_department_id) {
      setError("Select a new department (or choose “Remove from department”).");
      return;
    }
    if (isManagerial && form.is_current_hod && !form.replacement_hod_id) {
      setError("A Replacement HOD is required when the user is the current Head of Department.");
      return;
    }
    if (!isManagerial && form.new_department_id === "none" && !form.new_manager_id) {
      setError("A New Manager is required when removing an employee from their department.");
      return;
    }
    // For an employee moving into a department, the backend requires a manager
    // unless that department already has an active HOD to inherit them.
    if (!isManagerial && form.new_department_id !== "none" && !form.new_manager_id) {
      const targetDept = departments.find(d => String(d.id || d._id) === String(form.new_department_id));
      if (targetDept && !targetDept.head_of_department_id) {
        setError(`“${targetDept.name}” has no Head of Department — select a New Manager for this employee.`);
        return;
      }
    }

    setSubmitting(true);

    const payload = { role: employeeRole };

    if (form.new_department_id === "none") {
      payload.new_department_id = null;
    } else if (form.new_department_id) {
      payload.new_department_id = form.new_department_id;
    }

    if (form.new_manager_id) payload.new_manager_id = form.new_manager_id;
    // HOD handover only applies to managerial roles.
    if (isManagerial && form.is_current_hod) {
      payload.is_current_hod = true;
      if (form.replacement_hod_id) payload.replacement_hod_id = form.replacement_hod_id;
    }
    if (isManagerial && form.is_new_hod) payload.is_new_hod = true;
    if (isManagerial && form.old_dept_fallback_manager_id) {
      payload.old_dept_fallback_manager_id = form.old_dept_fallback_manager_id;
    }

    try {
      await organizationAPI.transferDepartment(userId, payload);
      onSuccess("Department transferred successfully.");
    } catch (err) {
      if (err.data?.errorCode === "MISSING_FALLBACK_MANAGER") {
        setRequiresFallback(true);
        setError("The old department has no HOD. Please select a fallback manager for their subordinates.");
      } else {
        setError(err.message || "Failed to transfer department.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Transfer Department</h3>
            <p className="text-xs text-slate-500 mt-1">Move this user and reassign reporting lines.</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold flex items-start gap-2">
              <HiBan className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">New Department</label>
                <select 
                  name="new_department_id" 
                  value={form.new_department_id} 
                  onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                >
                  <option value="">Select a department...</option>
                  <option value="none">Remove from department (No Department)</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">New Manager (Optional)</label>
                <select 
                  name="new_manager_id" 
                  value={form.new_manager_id} 
                  onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                >
                  <option value="">Select a manager...</option>
                  {employees.filter(x => canBeHOD(x.role)).map(e => {
                    const id = e.user_id || e.id;
                    const name = e.profile?.display_name || e.profile?.first_name || e.user?.name || e.name || e.identifier;
                    if (String(id) === String(userId)) return null;
                    return <option key={id} value={id}>{name}</option>;
                  })}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Required if the user&apos;s new department has no HOD, or if moving them to &ldquo;No Department&rdquo;. Ignored for HR/Manager roles.</p>
                {employees.filter(x => canBeHOD(x.role)).length === 0 && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-1">
                    No Managers or HR admins exist yet — create one before transferring.
                  </p>
                )}
              </div>

              {isManagerial && (<>
              <div className="border-t border-slate-100 my-2"></div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input type="checkbox" name="is_current_hod" checked={form.is_current_hod} onChange={handleChange} className="peer sr-only" />
                  <div className="w-5 h-5 rounded border-2 border-slate-300 peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-colors"></div>
                  <HiCheckCircle className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition-colors">Is Current HOD?</p>
                  <p className="text-xs text-slate-500">Check if this user is currently the Head of their old department.</p>
                </div>
              </label>

              {form.is_current_hod && (
                <div className="pl-8">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Replacement HOD <span className="text-red-500">*</span></label>
                  <select 
                    name="replacement_hod_id" 
                    value={form.replacement_hod_id} 
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  >
                    <option value="">Who will take over?</option>
                    {employees.filter(x => canBeHOD(x.role)).map(e => {
                      const id = e.user_id || e.id;
                      const name = e.profile?.display_name || e.profile?.first_name || e.user?.name || e.name || e.identifier;
                      if (String(id) === String(userId)) return null;
                      return <option key={id} value={id}>{name}</option>;
                    })}
                  </select>
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input type="checkbox" name="is_new_hod" checked={form.is_new_hod} onChange={handleChange} className="peer sr-only" />
                  <div className="w-5 h-5 rounded border-2 border-slate-300 peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-colors"></div>
                  <HiCheckCircle className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition-colors">Is New HOD?</p>
                  <p className="text-xs text-slate-500">Check if this user will become the Head of their new department.</p>
                </div>
              </label>

              {requiresFallback && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
                  <label className="block text-xs font-bold text-amber-800 mb-1.5">Fallback Manager <span className="text-red-500">*</span></label>
                  <p className="text-xs text-amber-700 mb-2">The old department has no HOD. Select a manager to inherit this user's subordinates.</p>
                  <select 
                    name="old_dept_fallback_manager_id" 
                    value={form.old_dept_fallback_manager_id} 
                    onChange={handleChange}
                    className="w-full bg-white border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-900 outline-none focus:border-amber-500 transition-all"
                  >
                    <option value="">Select fallback manager...</option>
                    {employees.filter(x => canBeHOD(x.role)).map(e => {
                      const id = e.user_id || e.id;
                      const name = e.profile?.display_name || e.profile?.first_name || e.user?.name || e.name || e.identifier;
                      if (String(id) === String(userId)) return null;
                      return <option key={id} value={id}>{name}</option>;
                    })}
                  </select>
                </div>
              )}
              </>)}
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading}
              className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? "Processing..." : "Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  // An unknown ?tab= value would match no panel and leave the content area blank.
  const requestedTab = queryParams.get("tab");
  const initialTab = TABS.some((t) => t.key === requestedTab) ? requestedTab : "overview";
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [employee, setEmployee] = useState(null);
  const [managerName, setManagerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [successToast, setSuccessToast] = useState("");
  const [actionError, setActionError] = useState("");

  // Close settings dropdown on click outside
  useEffect(() => {
    const handleClickOutside = () => setShowSettings(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const fetchEmployee = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const profileRes = await organizationAPI.getEmployee(userId);

        if (profileRes?.data) {
          setEmployee(profileRes.data);
          // The detail endpoint already resolves the reporting person's name —
          // no second round-trip needed.
          const mgr = profileRes.data.reporting_person_details;
          setManagerName(mgr?.name || "");
        } else {
          setEmployee(null);
        }
      } catch (err) {
        // A 403 means out-of-scope/non-existent (BOLA guard) and a 404 means not
        // found — neither should be papered over with a roster fallback.
        if (err.status === 403 || err.status === 404) {
          setLoadError(
            err.status === 403
              ? "You don't have access to this employee's profile."
              : "Employee not found."
          );
          setEmployee(null);
        } else {
          // Transient/backend error — best-effort fallback to the roster list.
          try {
            const orgRes = await organizationAPI.getEmployees({ purpose: "emp_report" });
            if (orgRes?.success && orgRes?.data) {
              const found = orgRes.data.find(e => String(e.user_id || e.id) === String(userId));
              setEmployee(found || null);
              if (!found) setLoadError("Could not load this employee's profile.");
            }
          } catch {
            setEmployee(null);
            setLoadError(err?.message || "Could not load this employee's profile.");
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [userId]);

  const handleToggleStatus = async () => {
    if (!employee) return;
    const newStatus = employee.is_active === false ? true : false;
    const actionText = newStatus ? "activate" : "deactivate";
    
    if (!(await window.confirm(`Are you sure you want to ${actionText} this employee?`))) return;
    
    setIsActionLoading(true);
    setActionError("");
    try {
      await organizationAPI.updateEmployeeStatus(userId, { is_active: newStatus });
      setEmployee(prev => ({ ...prev, is_active: newStatus, status: newStatus ? "active" : "inactive" }));
    } catch (err) {
      setActionError(err.message || `Failed to ${actionText} employee`);
    } finally {
      setIsActionLoading(false);
      setShowSettings(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setIsActionLoading(true);
    setActionError("");
    try {
      await organizationAPI.deleteEmployee(userId);
      navigate("/dashboard/hr/employees");
    } catch (err) {
      setActionError(err.message || "Failed to delete employee");
      setIsActionLoading(false);
    }
  };

  const employeeRole = employee?.role || "employee";
  const displayName = employee?.name || employee?.full_name || "Employee";

  return (
    <>
        <DashboardTopBar title={displayName} />

        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4 sm:space-y-6">
          <div className="flex items-start sm:items-center justify-between gap-4">
            {/* Top Breadcrumb */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <button
                onClick={() => navigate("/dashboard/hr/employees")}
                className="font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer flex items-center gap-2"
              >
                <HiOutlineUser className="w-4 h-4" /> Team
              </button>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900">{displayName}</span>
              {employeeRole && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 capitalize flex items-center gap-1.5 ml-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  {employeeRole}
                </span>
              )}
              {!loading && employee && (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
                  employee.is_active === false
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${employee.is_active === false ? "bg-rose-500" : "bg-emerald-500"}`}></span>
                  {employee.is_active === false ? "Inactive" : "Active"}
                </span>
              )}
            </div>

            {/* Settings Actions */}
            <div className="relative">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                disabled={isActionLoading}
              >
                <HiDotsHorizontal className="w-5 h-5" />
              </button>
              {showSettings && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 py-1.5 z-20" onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={handleToggleStatus}
                    disabled={isActionLoading}
                    className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors disabled:opacity-50"
                  >
                    {employee?.is_active === false ? (
                      <><HiCheckCircle className="w-4 h-4 text-emerald-500" /> Activate Employee</>
                    ) : (
                      <><HiBan className="w-4 h-4 text-amber-500" /> Deactivate Employee</>
                    )}
                  </button>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button 
                    onClick={() => { setShowSettings(false); setShowTransferModal(true); }}
                    disabled={isActionLoading}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-purple-600 hover:bg-purple-50 flex items-center gap-2.5 transition-colors disabled:opacity-50"
                  >
                    <HiSwitchHorizontal className="w-4 h-4" /> Transfer Department
                  </button>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button 
                    onClick={() => { setShowSettings(false); setShowDeleteModal(true); }}
                    disabled={isActionLoading}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors disabled:opacity-50"
                  >
                    <HiTrash className="w-4 h-4" /> Delete Employee
                  </button>
                </div>
              )}
            </div>
          </div>

          {loadError && !loading && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
              <HiBan className="w-5 h-5 shrink-0" />
              {loadError}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
            {/* ── LEFT: Employee Card ── */}
            <div className="xl:sticky xl:top-24 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col xl:max-h-[calc(100vh-8rem)]">
              
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="mb-4">
                  {loading ? (
                    <div className="w-24 h-24 rounded-full bg-slate-200 animate-pulse" />
                  ) : (
                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-purple-50 shrink-0 flex items-center justify-center">
                      {employee?.avatar ? (
                        <img 
                          src={employee.avatar} 
                          alt={displayName} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Avatar className="w-full h-full" {...genConfig(employee?.email || displayName || String(userId))} />
                      )}
                    </div>
                  )}
                </div>
                
                {/* Basic Info */}
                {loading ? (
                  <div className="space-y-2 mb-2 w-full flex flex-col items-center">
                    <div className="h-6 bg-slate-100 rounded animate-pulse w-48" />
                    <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
                  </div>
                ) : (
                  <div className="w-full">
                    <h2 className="text-xl font-bold text-slate-900 truncate w-full max-w-[260px] mx-auto">{displayName}</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      #{employee?.employee_code || employee?.emp_id || "EMP000"}
                    </p>
                  </div>
                )}
              </div>

              {/* Details Sections */}
              {!loading && employee && (
                <div className="px-6 pb-8 space-y-6 flex-1 overflow-y-auto no-scrollbar">
                  {/* Organization & Role */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Organization</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Department</span>
                        <span className="font-medium text-slate-900">{employee.department || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Designation</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[140px]" title={employee.designation}>{employee.designation || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Role</span>
                        <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded capitalize">{employee.role || employeeRole || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Manager</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[140px]" title={managerName || undefined}>
                          {managerName || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Dept. Head</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[140px]" title={employee.department_head_details?.name || undefined}>
                          {employee.department_head_details?.name || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100" />

                  {/* Contact */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Contact</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Phone</span>
                        <span className="font-medium text-slate-900">{employee.contact || employee.phone_number || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Email</span>
                        <span className="font-medium text-slate-900 text-right truncate max-w-[150px]" title={employee.email}>{employee.email || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: Horizontal Tabs & Content ── */}
            <div className="min-w-0 flex flex-col gap-6">
              
              {/* Horizontal Tabs Header */}
              <div className="bg-white rounded-2xl border border-slate-200 p-2 flex gap-1 overflow-x-auto no-scrollbar">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Area */}
              <div>
                {/* Attendance reads are split by role (/employees, /managers, /hrs).
                    Wait for the profile so a manager/HR isn't first queried through
                    /employees/* — that stale response could overwrite the real one. */}
                {(activeTab === "overview" || activeTab === "attendance") && loading && (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
                )}
                {activeTab === "overview" && !loading && employee && (
                <OverviewTab key={userId} userId={userId} employeeRole={employeeRole} />
              )}
              {activeTab === "attendance" && !loading && employee && (
                <AttendanceTab key={userId} userId={userId} employeeRole={employeeRole} />
              )}
              {activeTab === "leave" && (
                <LeaveTab userId={userId} />
              )}
              {activeTab === "profile" && (
                <ProfileTab employee={employee} />
              )}
              {activeTab === "reports" && (
                <ReportsTab userId={userId} employeeName={displayName} />
              )}
              </div>
            </div>
          </div>
        </main>

      {/* ── DELETE MODAL ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Delete Employee</h3>
              <button 
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setActionError(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                disabled={isActionLoading}
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <HiTrash className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-2">
                This action is permanent and cannot be undone.
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Are you sure you want to permanently delete <strong>{displayName}</strong>? All their historical data (attendance, leaves) will remain, but their access will be instantly revoked.
              </p>
              
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-600 mb-2">
                  Type <span className="text-slate-900 bg-slate-100 px-1 rounded">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isActionLoading}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-red-500 focus:bg-white transition-all"
                />
              </div>

              {actionError && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold flex items-center gap-2">
                  <HiBan className="w-5 h-5 shrink-0" />
                  <p>{actionError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setActionError(""); }}
                  disabled={isActionLoading}
                  className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEmployee}
                  disabled={isActionLoading || deleteConfirmText !== "DELETE"}
                  className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isActionLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Employee"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSFER DEPARTMENT MODAL ── */}
      {showTransferModal && (
        <DepartmentTransferModal 
          userId={userId} 
          employeeRole={employeeRole}
          onClose={() => setShowTransferModal(false)}
          onSuccess={(msg) => {
            setShowTransferModal(false);
            setSuccessToast(msg);
            setTimeout(() => setSuccessToast(""), 4000);
            // Re-fetch profile so the new department AND the rewired reporting
            // line are both reflected.
            setLoading(true);
            organizationAPI.getEmployee(userId).then(profileRes => {
              if (profileRes?.data) {
                setEmployee(profileRes.data);
                setManagerName(profileRes.data.reporting_person_details?.name || "");
              }
            }).catch(() => { /* toast already shown; keep prior data */ })
              .finally(() => setLoading(false));
          }}
        />
      )}
      
      {/* ── TOAST ── */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <HiCheckCircle className="w-5 h-5 text-emerald-500" />
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast("")}><HiX className="w-4 h-4 text-emerald-300 hover:text-emerald-500" /></button>
        </div>
      )}

    </>
  );
}
