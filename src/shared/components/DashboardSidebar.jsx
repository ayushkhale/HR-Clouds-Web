import React, { useState, useEffect } from "react";

import { DICTIONARY } from "../config/dictionary";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { tokenHelper, attendanceAPI } from "../api";
import OrgSwitcher from "./OrgSwitcher";
import { listFrom } from "../attendance/normalize";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../attendance/events";
import { SELF_SERVICE_BASE } from "../attendance/paths";
import { fetchHrInboxCounts, inboxTotal, peekHrInboxCounts } from "../utils/hrInboxCounts";
import {
  HiTemplate,
  HiChatAlt2,
  HiCalendar,
  HiUserGroup,
  HiClock,
  HiOfficeBuilding,
  HiMail,
  HiClipboardList,
  HiChevronDown,
  HiChevronRight,
  HiViewGrid,
  HiQuestionMarkCircle,
  HiCog,
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
  HiDatabase,
  HiReceiptRefund,
  HiHeart,
  HiScale,
  HiChartBar,
  HiCash,
  HiDocumentText,
  HiUserCircle,
  HiCloudDownload,
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
  const [inboxCount, setInboxCount] = useState(() => {
    if (role === "manager") return inboxCacheToken === tokenHelper.get() ? cachedInboxCount : 0;
    if (role === "hr") return inboxTotal(peekHrInboxCounts());
    return 0;
  });

  useEffect(() => {
    if (role !== "manager") return undefined;
    let alive = true;
    fetchInboxCount().then((count) => alive && setInboxCount(count)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [role]);

  // Counted once per session window, not per navigation: nine queues cost ten
  // requests, and firing them on every page change flooded every HR screen.
  // Decisions refresh the badge through the attendance events below.
  useEffect(() => {
    if (role !== "hr") return undefined;
    let alive = true;
    fetchHrInboxCounts().then((counts) => alive && setInboxCount(inboxTotal(counts))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [role]);

  // Approvals, rejections and resolutions anywhere in the app refresh the badge.
  useAttendanceChanged(INBOX_EVENT_KINDS, () => {
    if (role === "manager") fetchInboxCount(true).then(setInboxCount).catch(() => {});
    else if (role === "hr") fetchHrInboxCounts(true).then((counts) => setInboxCount(inboxTotal(counts))).catch(() => {});
  });

  const [openSubMenus, setOpenSubMenus] = useState({});

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
      // `nested`: also active on child routes (an employee profile, a payroll run).
      const link = (label, path, icon, extra = {}) => ({
        label,
        path,
        icon,
        ...extra,
        active: location.pathname === path || (!!extra.nested && location.pathname.startsWith(`${path}/`)),
      });
      const heading = (text) => ({ heading: text });
      const COMP_OFF = DICTIONARY.TERMS.COMP_OFF;

      // Ordered by how often HR needs each area: daily approvals first,
      // the monthly payroll cycle in order, seasonal tax work, then one-time setup.
      return [
        {
          title: "MAIN",
          flat: true,
          items: [
            link("Dashboard", "/dashboard/hr", HiViewGrid),
            link("HR Inbox", "/dashboard/hr/inbox", HiInboxIn, { badge: inboxCount > 0 ? inboxCount : null }),
          ],
        },
        {
          title: "PEOPLE",
          icon: HiUserGroup,
          items: [
            link(DICTIONARY.NAV.EMPLOYEES, "/dashboard/hr/employees", HiUserGroup, { nested: true }),
            link("Departments", "/dashboard/hr/departments", HiOfficeBuilding),
          ],
        },
        {
          title: "TIME & LEAVE",
          icon: HiClock,
          items: [
            link("Live Attendance", "/dashboard/hr/attendance/directory", HiClock),
            link("Leave Requests", "/dashboard/hr/leaves/requests", HiInboxIn),
            link("Regularizations", "/dashboard/hr/attendance/regularizations", HiClipboardList),
            link(`${COMP_OFF}s`, "/dashboard/hr/attendance/comp-offs", HiGift),
            link("Shift Roster", "/dashboard/hr/attendance/roster", HiCalendar),
          ],
        },
        {
          title: "PAYROLL",
          icon: HiCurrencyRupee,
          items: [
            link("Lock Attendance", "/dashboard/hr/attendance/lock-periods", HiLockClosed),
            link("Adjustments", "/dashboard/hr/payroll/adjustments", HiAdjustments),
            link("Bonus Rules", "/dashboard/hr/payroll/bonus-rules", HiGift),
            link("Claims", "/dashboard/hr/payroll/reimbursements", HiReceiptRefund),
            link("Loans & Advances", "/dashboard/hr/payroll/loans", HiCash),
            link("Encashments", "/dashboard/hr/payroll/encashments", HiCash),
            link("Bank Verification", "/dashboard/hr/payroll/bank-verification", HiShieldCheck),
            link("Payroll Runs", "/dashboard/hr/payroll/runs", HiPlay, { nested: true }),
            link("Payslips & Documents", "/dashboard/hr/payroll/payslips", HiDocumentText),
            link("Employee Salaries", "/dashboard/hr/payroll/employee-structures", HiCurrencyRupee),
          ],
        },
        {
          title: "TAX & COMPLIANCE",
          icon: HiScale,
          items: [
            link("Tax Declarations", "/dashboard/hr/payroll/tax-declarations", HiDocumentText),
            link("Statutory & Tax", "/dashboard/hr/payroll/statutory", HiScale),
            link("Year-End & Form 16", "/dashboard/hr/payroll/year-end", HiDocumentReport),
          ],
        },
        {
          title: "INSIGHTS",
          icon: HiChartBar,
          items: [
            link("Attendance Reports", "/dashboard/hr/reports", HiChartBar),
            link("Payroll Reports", "/dashboard/hr/payroll/reports", HiDocumentReport),
            link("Exports", "/dashboard/hr/payroll/exports", HiCloudDownload),
            link("Audit Log", "/dashboard/hr/payroll/audit-log", HiDatabase),
          ],
        },
        {
          title: "SETUP",
          icon: HiCog,
          defaultCollapsed: true,
          items: [
            heading("Organization"),
            link("Office Locations", "/dashboard/hr/attendance/locations", HiLocationMarker),
            heading("Time"),
            link("Work Shifts", "/dashboard/hr/attendance/shifts", HiClock),
            link("Attendance Policies", "/dashboard/hr/attendance/policies", HiClipboardList),
            link(`${COMP_OFF} Policies`, "/dashboard/hr/attendance/comp-off-policies", HiGift),
            link("Holidays", "/dashboard/hr/attendance/holidays", HiCalendar),
            link("Weekly Offs", "/dashboard/hr/attendance/weekly-offs", HiTemplate),
            heading("Leave"),
            link("Leave Types", "/dashboard/hr/leaves/types", HiClipboardList),
            link("Leave Policies", "/dashboard/hr/leaves/policies", HiTemplate),
            link("Automation", "/dashboard/hr/leaves/automation", HiLightningBolt),
            heading("Pay"),
            link("Salary Components", "/dashboard/hr/payroll/components", HiTemplate),
            link("Structure Templates", "/dashboard/hr/payroll/templates", HiDocumentReport),
            link("Benefit Plans", "/dashboard/hr/payroll/benefits", HiHeart),
            link("Payroll Settings", "/dashboard/hr/payroll/settings", HiCog),
          ],
        },
        {
          title: "ME",
          icon: HiUserCircle,
          defaultCollapsed: true,
          items: [
            link("My Attendance", SELF_SERVICE_BASE.hr, HiClock),
            link("My Regularizations", `${SELF_SERVICE_BASE.hr}/regularizations`, HiClipboardList),
            link("My Flags", `${SELF_SERVICE_BASE.hr}/anomalies`, HiExclamationCircle),
            link("My Overtime", `${SELF_SERVICE_BASE.hr}/overtime`, HiLightningBolt),
            link(`My ${COMP_OFF}s`, `${SELF_SERVICE_BASE.hr}/comp-offs`, HiGift),
            link("My Claims", "/dashboard/hr/my-reimbursements", HiReceiptRefund),
            link("My Salary & Bank", "/dashboard/hr/my-salary", HiCurrencyRupee),
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
          { label: "Claims & Benefits", path: "/dashboard/employee/payroll/reimbursements", icon: HiReceiptRefund, active: location.pathname === "/dashboard/employee/payroll/reimbursements" },
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
          { label: "Team Reports", path: "/dashboard/manager/payroll/reports", icon: HiChartBar, active: location.pathname === "/dashboard/manager/payroll/reports" },
          { label: "Team Variable Pay", path: "/dashboard/manager/payroll/adjustments", icon: HiAdjustments, active: location.pathname === "/dashboard/manager/payroll/adjustments" },
          { label: "Team Claims & Benefits", path: "/dashboard/manager/payroll/reimbursements", icon: HiReceiptRefund, active: location.pathname === "/dashboard/manager/payroll/reimbursements" },
          { label: "Team Encashments", path: "/dashboard/manager/payroll/encashments", icon: HiCash, active: location.pathname === "/dashboard/manager/payroll/encashments" },
          { label: "My Claims & Benefits", path: "/dashboard/manager/my-reimbursements", icon: HiReceiptRefund, active: location.pathname === "/dashboard/manager/my-reimbursements" },
          { label: "My Salary & Bank", path: "/dashboard/manager/my-salary", icon: HiCurrencyRupee, active: location.pathname === "/dashboard/manager/my-salary" },
        ],
      }] : [])
    ];
  };

  const navSections = getNavSections();

  // Sections are open unless the user collapsed them; `defaultCollapsed`
  // sections (HR Setup, Me) start closed until opened or visited.
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    navSections.forEach((section) => {
      const hasActiveItem = section.items.some((item) => item.active);
      if (hasActiveItem) {
        setOpenSections((prev) => ({ ...prev, [section.title]: true }));
      }
    });
  }, [location.pathname]);

  const isSectionOpen = (section) => openSections[section.title] ?? !section.defaultCollapsed;

  const toggleSection = (section) => {
    setOpenSections((prev) => ({
      ...prev,
      [section.title]: !(prev[section.title] ?? !section.defaultCollapsed),
    }));
  };

  const closeOnMobile = () => { if (window.innerWidth < 1024) closeSidebar(); };

  const renderItem = (item) => {
    if (item.heading) {
      return (
        <p key={`heading-${item.heading}`} className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider first:pt-1">
          {item.heading}
        </p>
      );
    }

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
                  onClick={closeOnMobile}
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
        onClick={closeOnMobile}
        aria-current={isActive ? "page" : undefined}
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
              // Headerless group (HR Dashboard + Inbox).
              if (section.flat) {
                return (
                  <div key={section.title} className="space-y-1">
                    {section.items.map(renderItem)}
                  </div>
                );
              }

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
              const isOpen = isSectionOpen(section);

              return (
                <div key={section.title} className="space-y-1">
                  {/* Section Header */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    aria-expanded={isOpen}
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
                      {section.items.map(renderItem)}
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
