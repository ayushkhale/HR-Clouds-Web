import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { organizationAPI } from "../../../shared/api";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import OverviewTab from "./employee-profile/OverviewTab";
import AttendanceTab from "./employee-profile/AttendanceTab";
import ProfileTab from "./employee-profile/ProfileTab";
import ReportsTab from "./employee-profile/ReportsTab";
import {
  HiOutlineUser, HiOutlineClock, HiOutlineDocumentText, HiOutlineChartSquareBar,
  HiOutlineOfficeBuilding, HiOutlinePhone, HiOutlineMail
} from "react-icons/hi";

const TABS = [
  { key: "overview", label: "Overview", icon: HiOutlineChartSquareBar },
  { key: "attendance", label: "Attendance", icon: HiOutlineClock },
  { key: "profile", label: "Profile", icon: HiOutlineUser },
  { key: "reports", label: "Reports", icon: HiOutlineDocumentText },
];

function getRandomAvatar(name) {
  const sum = (name || "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = (sum % 35) + 1;
  return `https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_${index}.png`;
}

export default function EmployeeProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchEmployee = async () => {
      setLoading(true);
      try {
        // Load from org members list (the only available endpoint for now)
        const orgRes = await organizationAPI.getEmployees({ purpose: "shift_assignment" });
        if (orgRes?.success && orgRes?.data) {
          const found = orgRes.data.find(e => String(e.user_id || e.id) === String(userId));
          setEmployee(found || null);
        }
      } catch {
        setEmployee(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [userId]);

  const employeeRole = employee?.role || "employee";
  const displayName = employee?.name || employee?.full_name || "Employee";

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title={displayName} />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Top Breadcrumb */}
          <div className="flex items-center gap-3 text-sm">
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

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-stretch">
            {/* ── LEFT: Employee Card ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
              
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="mb-4">
                  {loading ? (
                    <div className="w-24 h-24 rounded-full bg-slate-200 animate-pulse" />
                  ) : (
                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-purple-50 shrink-0">
                      <img 
                        src={employee?.avatar || getRandomAvatar(displayName)} 
                        alt={displayName} 
                        className="w-full h-full object-cover"
                      />
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
                <div className="px-6 pb-8 space-y-6 flex-1">
                  {/* Employee Details */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Employee Details</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Phone</span>
                        <span className="font-medium text-slate-900">{employee.contact || employee.phone_number || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Email</span>
                        <span className="font-medium text-slate-900 truncate max-w-[150px]">{employee.email || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Date of Birth</span>
                        <span className="font-medium text-slate-900">{employee.date_of_birth || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Title</span>
                        <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded capitalize">{employee.role || employeeRole || "—"}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm px-2">
                        <span className="text-slate-500">Hire date</span>
                        <span className="font-medium text-slate-900">{employee.date_of_joining || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-slate-100" />

                  {/* Address Details */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Address</h3>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-start text-sm px-2 gap-4">
                        <span className="text-slate-500 shrink-0">City State</span>
                        <span className="font-medium text-slate-900 text-right">{employee.city || "—"}</span>
                      </div>
                      <div className="flex justify-between items-start text-sm px-2 gap-4">
                        <span className="text-slate-500 shrink-0">Status</span>
                        <span className="font-medium text-slate-900 text-right">{employee.status || "—"}</span>
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
    </div>
  );
}
