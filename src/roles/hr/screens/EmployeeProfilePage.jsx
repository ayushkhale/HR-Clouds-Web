import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { organizationAPI } from "../../../shared/api";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import OverviewTab from "./employee-profile/OverviewTab";
import AttendanceTab from "./employee-profile/AttendanceTab";
import ProfileTab from "./employee-profile/ProfileTab";
import ReportsTab from "./employee-profile/ReportsTab";
import {
  HiOutlineUser, HiOutlineClock, HiOutlineDocumentText, HiOutlineChartSquareBar,
  HiOutlineOfficeBuilding, HiOutlinePhone, HiOutlineMail,
  HiCog, HiTrash, HiBan, HiCheckCircle, HiX, HiDotsHorizontal
} from "react-icons/hi";

const TABS = [
  { key: "overview", label: "Overview", icon: HiOutlineChartSquareBar },
  { key: "attendance", label: "Attendance", icon: HiOutlineClock },
  { key: "profile", label: "Profile", icon: HiOutlineUser },
  { key: "reports", label: "Reports", icon: HiOutlineDocumentText },
];

import Avatar, { genConfig } from 'react-nice-avatar';

export default function EmployeeProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialTab = queryParams.get("tab") || "overview";
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [employee, setEmployee] = useState(null);
  const [managerName, setManagerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
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
      try {
        // Fetch detailed profile using the Phase 2 endpoint
        console.log("Fetching detailed profile for user_id:", userId);
        const profileRes = await organizationAPI.getEmployee(userId);
        console.log("Response from getEmployee API:", profileRes);
        
        if (profileRes?.data) {
          setEmployee(profileRes.data);
          
          if (profileRes.data.reporting_person) {
            try {
              const mgrRes = await organizationAPI.getEmployee(profileRes.data.reporting_person);
              if (mgrRes?.data) {
                setManagerName(mgrRes.data.name || `${mgrRes.data.first_name || ''} ${mgrRes.data.last_name || ''}`.trim());
              }
            } catch (err) {
              console.error("Failed to fetch reporting manager details:", err);
            }
          }

          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Failed to fetch detailed profile:", err);
        // Fallback to org members list if direct fetch fails (e.g. backend not fully implemented)
        try {
          const orgRes = await organizationAPI.getEmployees({ purpose: "shift_assignment" });
          if (orgRes?.success && orgRes?.data) {
            const found = orgRes.data.find(e => String(e.user_id || e.id) === String(userId));
            setEmployee(found || null);
            if (found && found.reporting_person) {
              const mgr = orgRes.data.find(e => String(e.user_id || e.id) === String(found.reporting_person));
              if (mgr) setManagerName(mgr.name || `${mgr.first_name || ''} ${mgr.last_name || ''}`.trim());
            }
          }
        } catch {
          setEmployee(null);
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
    
    if (!window.confirm(`Are you sure you want to ${actionText} this employee?`)) return;
    
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
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
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
                        <span className="font-medium text-slate-900 text-right truncate max-w-[140px]" title={managerName || employee.reporting_person}>{managerName || employee.reporting_person || "—"}</span>
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
                {activeTab === "overview" && (
                <OverviewTab userId={userId} employeeRole={employeeRole} />
              )}
              {activeTab === "attendance" && (
                <AttendanceTab userId={userId} employeeRole={employeeRole} />
              )}
              {activeTab === "profile" && (
                <ProfileTab employee={employee} />
              )}
              {activeTab === "reports" && (
                <ReportsTab userId={userId} />
              )}
              </div>
            </div>
          </div>
        </main>
      </div>

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

    </div>
  );
}
