import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { HiBan, HiCheckCircle, HiOutlineCalendar, HiOutlineChartSquareBar, HiOutlineClock, HiOutlineUser, HiPencil, HiX } from "react-icons/hi";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import { organizationAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import { fmtDate, ymdOnly } from "../../../shared/attendance/dates";
import OverviewTab from "../../hr/screens/employee-profile/OverviewTab";
import AttendanceTab from "../../hr/screens/employee-profile/AttendanceTab";
import TeamMemberLeaveTab from "../components/TeamMemberLeaveTab";
import EditMemberProfileModal from "../components/EditMemberProfileModal";

const TEAM_PATH = "/dashboard/manager/team";
const TABS = [
  { key: "overview", label: "Overview", icon: HiOutlineChartSquareBar },
  { key: "attendance", label: "Attendance", icon: HiOutlineClock },
  { key: "leave", label: "Leave", icon: HiOutlineCalendar },
];

function InfoRow({ label, value, accent = false }) {
  return (
    <div className="flex justify-between items-center gap-3 text-sm px-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`font-medium text-right truncate max-w-[160px] ${accent ? "text-purple-700 bg-purple-50 px-2 py-0.5 rounded capitalize" : "text-slate-900"}`} title={value || undefined}>
        {value || "N/A"}
      </span>
    </div>
  );
}

/**
 * A direct report's profile, as the manager sees it. The same layout as HR's
 * employee profile, reading through manager-scoped endpoints: attendance from
 * /attendance/manager/team/member/*, leave from /leaves/team/member/*. HR-only
 * actions (deactivate, transfer, delete, leave rules) are not offered.
 */
export default function ManagerMemberProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const [activeTab, setActiveTab] = useState(TABS.some((t) => t.key === requestedTab) ? requestedTab : "overview");
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await organizationAPI.getEmployee(userId);
      setEmployee(res?.data || null);
      if (!res?.data) setLoadError("Could not load this person's profile.");
    } catch (err) {
      // The server answers 403 for anyone outside the manager's reporting line.
      setEmployee(null);
      setLoadError(err?.status === 403 ? "This person doesn't report to you." : err?.status === 404 ? "Team member not found." : err?.message || "Could not load this person's profile.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const name = employee?.name || employee?.full_name || "Team member";
  const role = employee?.role || "employee";
  const code = employee?.employee_code || employee?.emp_id;
  const inactive = employee?.is_active === false;
  const joined = employee?.joining_date || employee?.date_of_joining;

  return (
    <>
      <DashboardTopBar title={name} />

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            <button type="button" onClick={() => navigate(TEAM_PATH)} className="font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2">
              <HiOutlineUser className="w-4 h-4" /> {DICTIONARY.NAV.EMPLOYEES}
            </button>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">{name}</span>
            {!loading && employee && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1.5 ${inactive ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${inactive ? "bg-rose-500" : "bg-violet-500"}`} />
                {inactive ? "Inactive" : "Active"}
              </span>
            )}
          </div>
          {!loading && employee && (
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition">
              <HiPencil className="w-4 h-4" /> Edit
            </button>
          )}
        </div>

        {loadError && !loading && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <HiBan className="w-5 h-5 shrink-0" /> {loadError}
          </div>
        )}

        {(loading || employee) && (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
            <div className="xl:sticky xl:top-24 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                {loading ? (
                  <>
                    <div className="w-24 h-24 rounded-full bg-slate-200 animate-pulse mb-4" />
                    <div className="h-6 bg-slate-100 rounded animate-pulse w-48 mb-2" />
                    <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 mb-4 rounded-full border-4 border-white shadow-md overflow-hidden bg-purple-50 flex items-center justify-center">
                      <GenderAvatar person={employee} name={name} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 truncate w-full max-w-[260px]">{name}</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">{code ? `#${code}` : "N/A"}</p>
                  </>
                )}
              </div>

              {!loading && employee && (
                <div className="px-6 pb-8 space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Organization</h3>
                    <div className="space-y-2.5">
                      <InfoRow label="Department" value={typeof employee.department === "string" ? employee.department : employee.department?.name} />
                      <InfoRow label="Designation" value={employee.designation} />
                      <InfoRow label="Role" value={role} accent />
                      <InfoRow label="Work location" value={employee.work_location?.name || employee.work_location} />
                      <InfoRow label="Joined" value={joined ? fmtDate(ymdOnly(joined), { day: "numeric", month: "short", year: "numeric" }) : null} />
                    </div>
                  </div>
                  <div className="border-t border-slate-100" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-3 px-2">Contact</h3>
                    <div className="space-y-2.5">
                      <InfoRow label="Phone" value={employee.contact || employee.phone_number} />
                      <InfoRow label="Email" value={employee.email} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0 flex flex-col gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-2 flex gap-1 overflow-x-auto no-scrollbar" role="tablist">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div>
                {loading ? (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
                ) : (
                  <>
                    {activeTab === "overview" && <OverviewTab key={userId} userId={userId} employeeRole={role} viewer="manager" />}
                    {activeTab === "attendance" && <AttendanceTab key={userId} userId={userId} employeeRole={role} viewer="manager" />}
                    {activeTab === "leave" && <TeamMemberLeaveTab key={userId} userId={userId} />}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {editing && employee && (
        <EditMemberProfileModal
          userId={userId}
          name={name}
          profile={employee}
          onClose={() => setEditing(false)}
          onSaved={(msg) => { setEditing(false); setToast(msg); load(); }}
        />
      )}

      {toast && (
        <div className="fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl bg-violet-50 text-violet-700 border border-violet-200 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <HiCheckCircle className="w-5 h-5 text-violet-500" />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Dismiss"><HiX className="w-4 h-4 text-violet-300 hover:text-violet-500" /></button>
        </div>
      )}
    </>
  );
}
