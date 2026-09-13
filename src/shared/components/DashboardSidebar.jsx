import React, { useState, useEffect, useCallback } from "react";

import { DICTIONARY } from "../config/dictionary";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { tokenHelper, attendanceAPI } from "../api";
import OrgSwitcher from "./OrgSwitcher";
import { listFrom } from "../attendance/normalize";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../attendance/events";
import { SELF_SERVICE_BASE } from "../attendance/paths";
import {
  HiTemplate,
  HiChatAlt2,
  HiCalendar,
  HiUserGroup,
  HiClock,
  HiLogout,
  HiOfficeBuilding,
  HiMail,
  HiClipboardList,
  HiChevronDown,
  HiChevronRight,
  HiDeviceMobile,
  HiViewGrid,
  HiQuestionMarkCircle,
  HiCog,
  HiSun,
  HiMoon,
  HiExclamationCircle,
  HiGift,
  HiLocationMarker,
  HiLockClosed,
  HiDocumentReport,
  HiX,
  HiInboxIn,
  HiLightningBolt,
  HiCurrencyRupee,
  HiAdjustments,
  HiPlay,
  HiShieldCheck,
  HiDatabase
} from "react-icons/hi";

let cachedInboxCount = 0;
let lastInboxFetchTime = 0;
let inboxFetchPromise = null;
let inboxCacheToken = null;
const INBOX_CACHE_DURATION = 60000; // 1 minute

// Pending attendance items across the four manager queues. Shared module-level
// cache so remounts don't refetch; `force` bypasses it after a decision.
// The cache belongs to one session token — a different login starts from zero.
async function fetchInboxCount(force = false) {
  const token = tokenHelper.get();
  if (token !== inboxCacheToken) {
    inboxCacheToken = token;
    cachedInboxCount = 0;
    lastInboxFetchTime = 0;
  }
  if (!force && Date.now() - lastInboxFetchTime < INBOX_CACHE_DURATION) return cachedInboxCount;
  if (inboxFetchPromise) {
    if (!force) return inboxFetchPromise;
    await inboxFetchPromise.catch(() => {});
  }
  if (!tokenHelper.get()) return 0;

  inboxFetchPromise = Promise.allSettled([
    attendanceAPI.getManagerPendingRegularizations(),
    attendanceAPI.getManagerPendingOvertime(),
    attendanceAPI.getManagerCompOffs(),
    attendanceAPI.getManagerAnomalies(),
  ])
    .then((results) => {
      const count = results.reduce(
        (sum, r) => sum + (r.status === "fulfilled" ? listFrom(r.value, ["requests", "anomalies", "comp_offs", "overtime"]).length : 0),
        0
      );
      if (inboxCacheToken === token) {
        cachedInboxCount = count;
        lastInboxFetchTime = Date.now();
      }
      return count;
    })
    .finally(() => {
      inboxFetchPromise = null;
    });
  return inboxFetchPromise;
}

function DashboardSidebar({ role = "guest" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, orgId, organizations } = useAuth();
  const { isMobileSidebarOpen, closeSidebar } = useSidebar();
  const [inboxCount, setInboxCount] = useState(role === "manager" && inboxCacheToken === tokenHelper.get() ? cachedInboxCount : 0);

  useEffect(() => {
    if (role !== "manager") return undefined;
    let alive = true;
    fetchInboxCount().then((count) => alive && setInboxCount(count)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [role]);

  // Approvals, rejections and resolutions anywhere in the app refresh the badge.
  useAttendanceChanged(INBOX_EVENT_KINDS, () => {
    if (role === "manager") fetchInboxCount(true).then(setInboxCount).catch(() => {});
  });

  const [openSubMenus, setOpenSubMenus] = useState({
    shifts: location.pathname.includes("/dashboard/hr/attendance/shifts") || location.pathname.includes("/dashboard/hr/attendance/roster"),
    attendanceSettings: location.pathname.includes("/dashboard/hr/attendance/policies") || location.pathname.includes("/dashboard/hr/attendance/lock-periods") || location.pathname.includes("/dashboard/hr/attendance/comp-off-policies"),
    offDays: location.pathname.includes("/dashboard/hr/attendance/weekly-offs") || location.pathname.includes("/dashboard/hr/attendance/comp-offs"),
    leaveConfig: location.pathname.includes("/dashboard/hr/leaves/types") || location.pathname.includes("/dashboard/hr/leaves/policies"),
  });

  const toggleSubMenu = (key) => {
    setOpenSubMenus(prev => ({ ...prev, [key]: !prev[key] }));
  };

  function handleLogout() {
    tokenHelper.clear();
    logout();
    navigate("/");
  }

  // Self-service attendance is authorised for every org role; managers and HR
  // get the same pages mounted inside their own workspace.
  const selfServiceSection = (workspace) => {
    const base = SELF_SERVICE_BASE[workspace];
    const item = (label, suffix, icon) => ({ label, path: `${base}${suffix}`, icon, active: location.pathname === `${base}${suffix}` });
    return {
      title: "MY ATTENDANCE",
      icon: HiClock,
      items: [
        item("My Attendance", "", HiClock),
        item("My Regularizations", "/regularizations", HiClipboardList),
        item("My Flags", "/anomalies", HiExclamationCircle),
        item("My Overtime", "/overtime", HiClock),
        item(`My ${DICTIONARY.TERMS.COMP_OFF}s`, "/comp-offs", HiGift),
      ],
    };
  };

  // Sidebar link items based on role
  const getNavSections = () => {
    if (role === "guest") {
      return [
        {
          title: "MENU",
          icon: HiTemplate,
          items: [
            { label: "Dashboard", path: "/dashboard/guest", icon: HiTemplate, active: location.pathname === "/dashboard/guest" },
            { label: "Register Org", path: "/register-organization", icon: HiOfficeBuilding, active: location.pathname === "/register-organization" },
          ],
        },
        {
          title: "HELP & SUPPORT",
          icon: HiChatAlt2,
          items: [
            { label: "Check Invites", path: "/dashboard/guest", icon: HiMail },
            { label: "Support", path: "mailto:support@hrclouds.in", icon: HiChatAlt2, external: true },
          ],
        },
      ];
    }

    if (role === "hr") {
      return [
        {
          title: "ORGANIZATION OVERVIEW",
          icon: HiTemplate,
          items: [
            { label: "Dashboard", path: "/dashboard/hr", icon: HiViewGrid, active: location.pathname === "/dashboard/hr" },
            { label: DICTIONARY.NAV.EMPLOYEES, path: "/dashboard/hr/employees", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/employees" },
            { label: "Departments", path: "/dashboard/hr/departments", icon: HiOfficeBuilding, active: location.pathname === "/dashboard/hr/departments" },
            { label: "Office Locations", path: "/dashboard/hr/attendance/locations", icon: HiLocationMarker, active: location.pathname === "/dashboard/hr/attendance/locations" },
          ],
        },
        selfServiceSection("hr"),
        {
          title: "ATTENDANCE & TIME",
          icon: HiClock,
          items: [
            { label: "Live Attendance", path: "/dashboard/hr/attendance/directory", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/attendance/directory" },
            {
              label: "Shift Management", icon: HiClock, key: "shifts",
              active: location.pathname.includes("/dashboard/hr/attendance/shifts") || location.pathname.includes("/dashboard/hr/attendance/roster"),
              subItems: [
                { label: "Work Shifts", path: "/dashboard/hr/attendance/shifts", active: location.pathname === "/dashboard/hr/attendance/shifts" },
                { label: "Assign Shifts", path: "/dashboard/hr/attendance/roster", active: location.pathname === "/dashboard/hr/attendance/roster" }
              ]
            },
            {
              label: "Attendance Settings", icon: HiCog, key: "attendanceSettings",
              active: location.pathname.includes("/dashboard/hr/attendance/policies") || location.pathname.includes("/dashboard/hr/attendance/lock-periods") || location.pathname.includes("/dashboard/hr/attendance/comp-off-policies"),
              subItems: [
                { label: "Attendance Policies", path: "/dashboard/hr/attendance/policies", active: location.pathname === "/dashboard/hr/attendance/policies" },
                { label: `${DICTIONARY.TERMS.COMP_OFF} Policies`, path: "/dashboard/hr/attendance/comp-off-policies", active: location.pathname === "/dashboard/hr/attendance/comp-off-policies" },
                { label: "Lock Attendance", path: "/dashboard/hr/attendance/lock-periods", active: location.pathname === "/dashboard/hr/attendance/lock-periods" }
              ]
            },
            // { label: "Biometric Devices", path: "/dashboard/hr/attendance/devices", icon: HiDeviceMobile, active: location.pathname === "/dashboard/hr/attendance/devices" },
            { label: "Regularizations", path: "/dashboard/hr/attendance/regularizations", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/attendance/regularizations" },
            { label: "Reports", path: "/dashboard/hr/reports", icon: HiDocumentReport, active: location.pathname === "/dashboard/hr/reports" },
          ],
        },
        {
          title: "HOLIDAYS",
          icon: HiCalendar,
          items: [
            { label: "Holidays", path: "/dashboard/hr/attendance/holidays", icon: HiCalendar, active: location.pathname === "/dashboard/hr/attendance/holidays" },
            {
              label: "Off Days", icon: HiTemplate, key: "offDays",
              active: location.pathname.includes("/dashboard/hr/attendance/weekly-offs") || location.pathname.includes("/dashboard/hr/attendance/comp-offs"),
              subItems: [
                { label: "Weekly Offs", path: "/dashboard/hr/attendance/weekly-offs", active: location.pathname === "/dashboard/hr/attendance/weekly-offs" },
                { label: `${DICTIONARY.TERMS.COMP_OFF}s`, path: "/dashboard/hr/attendance/comp-offs", active: location.pathname === "/dashboard/hr/attendance/comp-offs" }
              ]
            },
          ],
        },
        {
          title: "LEAVES",
          icon: HiClipboardList,
          items: [
            { label: "Leave Requests", path: "/dashboard/hr/leaves/requests", icon: HiInboxIn, active: location.pathname === "/dashboard/hr/leaves/requests" },
            { label: "Leave Types", path: "/dashboard/hr/leaves/types", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/leaves/types" },
            { label: "Leave Policies", path: "/dashboard/hr/leaves/policies", icon: HiTemplate, active: location.pathname === "/dashboard/hr/leaves/policies" },
            { label: "Automation Engine", path: "/dashboard/hr/leaves/automation", icon: HiLightningBolt, active: location.pathname === "/dashboard/hr/leaves/automation" },
          ],
        },
        {
          title: "PAYROLL & COMP",
          icon: HiCurrencyRupee,
          items: [
            { label: "Salary Components", path: "/dashboard/hr/payroll/components", icon: HiTemplate, active: location.pathname === "/dashboard/hr/payroll/components" },
            { label: "Structure Templates", path: "/dashboard/hr/payroll/templates", icon: HiDocumentReport, active: location.pathname === "/dashboard/hr/payroll/templates" },
            { label: "Employee Structures", path: "/dashboard/hr/payroll/employee-structures", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/payroll/employee-structures" },
            { label: "Salary Approvals", path: "/dashboard/hr/payroll/approvals", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/payroll/approvals" },
            { label: "Payroll Runs", path: "/dashboard/hr/payroll/runs", icon: HiPlay, active: location.pathname === "/dashboard/hr/payroll/runs" },
            { label: "Adjustments", path: "/dashboard/hr/payroll/adjustments", icon: HiAdjustments, active: location.pathname === "/dashboard/hr/payroll/adjustments" },
            { label: "Bonus Rules", path: "/dashboard/hr/payroll/bonus-rules", icon: HiGift, active: location.pathname === "/dashboard/hr/payroll/bonus-rules" },
            { label: "Loans & Advances", path: "/dashboard/hr/payroll/loans", icon: HiCurrencyRupee, active: location.pathname === "/dashboard/hr/payroll/loans" },
            { label: "Bank Verification", path: "/dashboard/hr/payroll/bank-verification", icon: HiShieldCheck, active: location.pathname === "/dashboard/hr/payroll/bank-verification" },
            { label: "Statutory & Tax", path: "/dashboard/hr/payroll/statutory", icon: HiCog, active: location.pathname === "/dashboard/hr/payroll/statutory" },
            { label: "Tax Declarations", path: "/dashboard/hr/payroll/tax-declarations", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/payroll/tax-declarations" },
            { label: "Year-End & Form 16", path: "/dashboard/hr/payroll/year-end", icon: HiDocumentReport, active: location.pathname === "/dashboard/hr/payroll/year-end" },
            { label: "Audit Log", path: "/dashboard/hr/payroll/audit-log", icon: HiDatabase, active: location.pathname === "/dashboard/hr/payroll/audit-log" },
          ],
        },


      ];
    }

    return [
      {
        title: "OVERVIEW",
        icon: HiTemplate,
        items: [
          { label: "Dashboard", path: `/dashboard/${role}`, icon: HiViewGrid, active: location.pathname === `/dashboard/${role}` },
          ...(role === "employee" ? [
            { label: "My Leaves", path: "/dashboard/employee/leaves", icon: HiCalendar, active: location.pathname === "/dashboard/employee/leaves" },
          ] : []),
        ],
      },
      ...(role === "employee" ? [{
        title: "ATTENDANCE",
        icon: HiClock,
        items: [
          { label: "My Attendance", path: `/dashboard/${role}/attendance`, icon: HiClock, active: location.pathname === `/dashboard/${role}/attendance` },
          { label: "Regularizations", path: `/dashboard/${role}/attendance/regularizations`, icon: HiClipboardList, active: location.pathname === `/dashboard/${role}/attendance/regularizations` },
          { label: "Anomalies", path: `/dashboard/${role}/attendance/anomalies`, icon: HiExclamationCircle, active: location.pathname === `/dashboard/${role}/attendance/anomalies` },
          { label: "Overtime", path: `/dashboard/${role}/attendance/overtime`, icon: HiClock, active: location.pathname === `/dashboard/${role}/attendance/overtime` },
          { label: `${DICTIONARY.TERMS.COMP_OFF}s`, path: `/dashboard/${role}/attendance/comp-offs`, icon: HiGift, active: location.pathname === `/dashboard/${role}/attendance/comp-offs` },
        ],
      },
      {
        title: "PAYROLL & COMP",
        icon: HiCurrencyRupee,
        items: [
          { label: "My Salary & Bank", path: "/dashboard/employee/payroll/my-salary", icon: HiCurrencyRupee, active: location.pathname === "/dashboard/employee/payroll/my-salary" },
          { label: "My Payslips", path: "/dashboard/employee/payroll/my-payslips", icon: HiDocumentReport, active: location.pathname === "/dashboard/employee/payroll/my-payslips" },
          { label: "Loans & Variable Pay", path: "/dashboard/employee/payroll/loans", icon: HiAdjustments, active: location.pathname === "/dashboard/employee/payroll/loans" },
          { label: "Tax & Investments", path: "/dashboard/employee/payroll/tax", icon: HiDocumentReport, active: location.pathname === "/dashboard/employee/payroll/tax" },
          { label: "Reimbursements", path: "/dashboard/employee/payroll/reimbursements", icon: HiGift, active: location.pathname === "/dashboard/employee/payroll/reimbursements" },
        ],
      }] : []),
      ...(role === "manager" ? [selfServiceSection("manager"), {
        title: "REQUESTS",
        icon: HiClipboardList,
        items: [
          { 
            label: "Approvals Inbox", 
            path: "/dashboard/manager/requests/inbox", 
            icon: HiInboxIn, 
            active: location.pathname === "/dashboard/manager/requests/inbox",
            badge: inboxCount > 0 ? inboxCount : null
          },
          { label: "Regularization Requests", path: "/dashboard/manager/requests/regularizations", icon: HiClock, active: location.pathname === "/dashboard/manager/requests/regularizations" },
          { label: "OverTime Requests", path: "/dashboard/manager/requests/overtime", icon: HiCalendar, active: location.pathname === "/dashboard/manager/requests/overtime" },
          { label: "Anomalies", path: "/dashboard/manager/team/anomalies", icon: HiChatAlt2, active: location.pathname === "/dashboard/manager/team/anomalies" },
          { label: `${DICTIONARY.TERMS.COMP_OFF} Requests`, path: "/dashboard/manager/requests/comp-offs", icon: HiCalendar, active: location.pathname === "/dashboard/manager/requests/comp-offs" },
          { label: "Leave Requests", path: "/dashboard/manager/requests/leaves", icon: HiClipboardList, active: location.pathname === "/dashboard/manager/requests/leaves" },
        ],
      },
      {
        title: "TEAM",
        icon: HiUserGroup,
        forceDropdown: true,
        items: [
          { label: "Team Roster", path: "/dashboard/manager/team/roster", icon: HiUserGroup, active: location.pathname === "/dashboard/manager/team/roster" },
          { label: "Status", path: "/dashboard/manager/team/today", icon: HiUserGroup, active: location.pathname === "/dashboard/manager/team/today" },
          { label: "History", path: "/dashboard/manager/team/history", icon: HiCalendar, active: location.pathname === "/dashboard/manager/team/history" },
        ],
      },
      {
        title: "PAYROLL & COMP",
        icon: HiCurrencyRupee,
        items: [
          { label: "Team Compensation", path: "/dashboard/manager/payroll/team-salary", icon: HiCurrencyRupee, active: location.pathname === "/dashboard/manager/payroll/team-salary" },
          { label: "Team Payslips", path: "/dashboard/manager/payroll/team-payslips", icon: HiDocumentReport, active: location.pathname === "/dashboard/manager/payroll/team-payslips" },
          { label: "Team Variable Pay", path: "/dashboard/manager/payroll/adjustments", icon: HiAdjustments, active: location.pathname === "/dashboard/manager/payroll/adjustments" },
          { label: "Team Reimbursements", path: "/dashboard/manager/payroll/reimbursements", icon: HiDocumentReport, active: location.pathname === "/dashboard/manager/payroll/reimbursements" },
        ],
      }] : [])
    ];
  };

  const navSections = getNavSections();

  const [openSections, setOpenSections] = useState({
    "ATTENDANCE & TIME": true,
    "ORGANIZATION OVERVIEW": true,
  });

  useEffect(() => {
    navSections.forEach((section) => {
      const hasActiveItem = section.items.some((item) => item.active);
      if (hasActiveItem) {
        setOpenSections((prev) => ({ ...prev, [section.title]: true }));
      }
    });
  }, [location.pathname]);

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed inset-y-0 left-0 z-50 lg:z-10 w-64 bg-white border-r border-slate-100 flex flex-col justify-between h-screen overflow-y-auto transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 font-sans ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        {/* Top Branding Logo */}
        <div>
          <div className="px-6 py-8 flex items-center justify-between lg:justify-center">
            <Link to="/">
              <img src="/logocolored.png" alt="HR Clouds" className="h-12 w-auto object-contain" />
            </Link>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          {/* Multi-Org Switcher dropdown inside sidebar if orgs exist */}
          {organizations && organizations.length > 1 && (
            <div className="px-5 py-3 border-b border-slate-100">
              <OrgSwitcher organizations={organizations} currentOrgId={orgId} />
            </div>
          )}

          {/* Navigation Section */}
          <div className="px-4 py-4 space-y-4">
            {navSections.map((section) => {
              const isSingle = section.items.length === 1 && !section.forceDropdown;

              // Single item section — render directly as a link
              if (isSingle) {
                const item = section.items[0];
                const Icon = item.icon || section.icon;
                const isActive = item.active;

                return (
                  <Link
                    key={section.title}
                    to={item.path}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${isActive
                      ? "bg-[#F3E8FF] text-[#7E22CE] shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-purple-700"
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                    {item.label}
                  </Link>
                );
              }

              // Multi-item section — render with collapsible header
              const isOpen = openSections[section.title] !== false;

              return (
                <div key={section.title} className="space-y-1">
                  {/* Section Header */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-4 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                  >
                    <span>{section.title}</span>
                    {isOpen ? (
                      <HiChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <HiChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {/* Sub-items list */}
                  {isOpen && (
                    <div className="space-y-1 pl-2">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.active;

                        if (item.subItems) {
                          const isSubOpen = openSubMenus[item.key];
                          return (
                            <div key={item.key} className="space-y-1">
                              <button
                                onClick={() => toggleSubMenu(item.key)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${isActive
                                  ? "bg-[#F3E8FF]/60 text-[#7E22CE] font-bold"
                                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                  }`}
                              >
                                <div className="flex items-center gap-3">
                                  <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                                  {item.label}
                                </div>
                                <HiChevronDown className={`w-3.5 h-3.5 transition-transform ${isSubOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {isSubOpen && (
                                <div className="pl-9 space-y-1 mt-1 border-l-2 border-slate-100 ml-4">
                                  {item.subItems.map((sub) => (
                                    <Link
                                      key={sub.path}
                                      to={sub.path}
                                      onClick={() => { if (window.innerWidth < 1024) closeSidebar(); }}
                                      className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${sub.active
                                        ? "text-[#7E22CE] bg-[#F3E8FF]/40"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                        }`}
                                    >
                                      {sub.label}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={item.label}
                            to={item.path}
                            onClick={() => { if (window.innerWidth < 1024) closeSidebar(); }}
                            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${isActive
                              ? "text-[#7E22CE] font-bold bg-[#F3E8FF]/60"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                              {item.label}
                            </div>
                            {item.badge && (
                              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto px-4 pb-4 space-y-2">
          <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-default">
            <div className="flex items-center gap-3">
              <HiQuestionMarkCircle className="w-5 h-5 text-slate-400" />
              <span>Help Center</span>
            </div>
            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">8</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-default">
            <HiCog className="w-5 h-5 text-slate-400" />
            <span>Setting</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default DashboardSidebar;
