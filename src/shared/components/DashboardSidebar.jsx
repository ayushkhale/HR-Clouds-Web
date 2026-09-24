import React, { useState, useEffect } from "react";

import { DICTIONARY } from "../config/dictionary";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { tokenHelper } from "../api";
import OrgSwitcher from "./OrgSwitcher";
import { INBOX_EVENT_KINDS, useAttendanceChanged } from "../attendance/events";
import { SELF_SERVICE_BASE } from "../attendance/paths";
import { fetchHrInboxCounts, inboxTotal, peekHrInboxCounts } from "../utils/hrInboxCounts";
import { fetchManagerInboxCounts, peekManagerInboxCounts } from "../utils/managerInboxCounts";
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
  HiLogout,
  HiSwitchHorizontal,
  HiDocumentText,
  HiUserCircle,
  HiCloudDownload,
  HiFolderOpen,
  HiBadgeCheck,
  HiClipboardCheck,
} from "react-icons/hi";

function DashboardSidebar({ role = "guest" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, orgId, organizations } = useAuth();
  const { isMobileSidebarOpen, closeSidebar, setNav } = useSidebar();
  const [inboxCount, setInboxCount] = useState(() => {
    if (role === "manager") return inboxTotal(peekManagerInboxCounts());
    if (role === "hr") return inboxTotal(peekHrInboxCounts());
    return 0;
  });

  useEffect(() => {
    if (role !== "manager") return undefined;
    let alive = true;
    // Shared with the dashboard's "Needs your attention" list (one round of requests).
    fetchManagerInboxCounts().then((counts) => alive && setInboxCount(inboxTotal(counts))).catch(() => {});
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
    if (role === "manager") fetchManagerInboxCounts(true).then((counts) => setInboxCount(inboxTotal(counts))).catch(() => {});
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
  const REGULARIZATION = DICTIONARY.TERMS.REGULARIZATION;
  const inboxBadge = { badge: inboxCount > 0 ? inboxCount : null };

  // Self-service pages are shared by every role, so they carry the same label
  // everywhere, and each page's heading uses that label too.
  const myAttendanceLinks = (workspace) => {
    const base = SELF_SERVICE_BASE[workspace];
    return [
      link("My Attendance", base, HiClock),
      link(`My ${REGULARIZATION}s`, `${base}/regularizations`, HiClipboardList),
      link("My Flags", `${base}/anomalies`, HiExclamationCircle),
      link("My Overtime", `${base}/overtime`, HiLightningBolt),
      link(`My ${COMP_OFF}`, `${base}/comp-offs`, HiGift),
    ];
  };

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
      // Ordered by how often HR needs each area: daily approvals first, then
      // Setup (collapsed until opened), People, and the monthly payroll cycle in
      // order, followed by seasonal tax work.
      return [
        {
          title: "MAIN",
          flat: true,
          items: [
            link("Dashboard", "/dashboard/hr", HiViewGrid),
            link("Inbox", "/dashboard/hr/inbox", HiInboxIn, inboxBadge),
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
            link("Leave Automation", "/dashboard/hr/leaves/automation", HiLightningBolt),
            heading("Pay"),
            link("Salary Components", "/dashboard/hr/payroll/components", HiTemplate),
            link("Structure Templates", "/dashboard/hr/payroll/templates", HiDocumentReport),
            link("Benefit Plans", "/dashboard/hr/payroll/benefits", HiHeart),
            link("Payroll Settings", "/dashboard/hr/payroll/settings", HiCog),
            link("Payroll Automation", "/dashboard/hr/payroll/automation", HiLightningBolt),
            heading("Documents"),
            link("Document Types", "/dashboard/hr/documents/types", HiTemplate),
            link("Document Settings", "/dashboard/hr/documents/settings", HiCog),
          ],
        },
        {
          title: "PEOPLE",
          icon: HiUserGroup,
          items: [
            link(DICTIONARY.NAV.EMPLOYEES, "/dashboard/hr/employees", HiUserGroup, { nested: true }),
            link("Invites", "/dashboard/hr/invites", HiMail),
            link("Departments", "/dashboard/hr/departments", HiOfficeBuilding),
          ],
        },
        {
          title: "TIME & LEAVE",
          icon: HiClock,
          items: [
            link("Live Attendance", "/dashboard/hr/attendance/directory", HiClock),
            link("Leave Requests", "/dashboard/hr/leaves/requests", HiInboxIn),
            link(`${REGULARIZATION}s`, "/dashboard/hr/attendance/regularizations", HiClipboardList),
            link(COMP_OFF, "/dashboard/hr/attendance/comp-offs", HiGift),
            link("Shift Roster", "/dashboard/hr/attendance/roster", HiCalendar),
          ],
        },
        {
          title: "PAYROLL",
          icon: HiCurrencyRupee,
          items: [
            link("Lock Attendance", "/dashboard/hr/attendance/lock-periods", HiLockClosed),
            link("Salary Adjustments", "/dashboard/hr/payroll/adjustments", HiAdjustments),
            link("Bonus Rules", "/dashboard/hr/payroll/bonus-rules", HiGift),
            link("Claims", "/dashboard/hr/payroll/reimbursements", HiReceiptRefund),
            link("Loans & Advances", "/dashboard/hr/payroll/loans", HiCash),
            link("Encashments", "/dashboard/hr/payroll/encashments", HiCash),
            link("Exits & Settlements", "/dashboard/hr/payroll/exits", HiLogout),
            link("Pay Differences", "/dashboard/hr/payroll/arrears", HiSwitchHorizontal),
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
          title: "DOCUMENTS",
          icon: HiFolderOpen,
          items: [
            link("Verification Queue", "/dashboard/hr/documents/verification", HiBadgeCheck),
            link("Employee Documents", "/dashboard/hr/documents/employees", HiFolderOpen),
            link("Organisation Documents", "/dashboard/hr/documents/organisation", HiOfficeBuilding),
            link("Document Compliance", "/dashboard/hr/documents/compliance", HiClipboardCheck),
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
          title: "ME",
          icon: HiUserCircle,
          defaultCollapsed: true,
          items: [
            ...myAttendanceLinks("hr"),
            link("My Claims & Benefits", "/dashboard/hr/my-reimbursements", HiReceiptRefund),
            link("My Salary & Bank", "/dashboard/hr/my-salary", HiCurrencyRupee),
            link("My Documents", "/dashboard/hr/my-documents", HiFolderOpen),
            link("Company Documents", "/dashboard/hr/company-documents", HiOfficeBuilding),
          ],
        },
      ];
    }

    if (role === "manager") {
      const M = "/dashboard/manager";
      // Same shape and names as the HR sidebar: the same job carries the same
      // label in both workspaces (Team, Leave Requests, Payroll Reports…).
      return [
        {
          title: "MAIN",
          flat: true,
          items: [
            link("Dashboard", M, HiViewGrid),
            link("Inbox", `${M}/requests/inbox`, HiInboxIn, inboxBadge),
          ],
        },
        {
          title: "PEOPLE",
          icon: HiUserGroup,
          forceDropdown: true,
          items: [
            // Member profiles live under /team/member/, not /team/, because
            // /team/today and /team/history are separate sidebar entries.
            { ...link(DICTIONARY.NAV.EMPLOYEES, `${M}/team`, HiUserGroup), active: location.pathname === `${M}/team` || location.pathname.startsWith(`${M}/team/member/`) },
            link("Team Documents", `${M}/documents`, HiFolderOpen),
            link("Document Proposals", `${M}/documents/proposals`, HiClipboardList),
            link("Document Compliance", `${M}/documents/compliance`, HiClipboardCheck),
          ],
        },
        {
          title: "TIME & LEAVE",
          icon: HiClock,
          items: [
            link("Live Attendance", `${M}/team/today`, HiClock),
            link("Attendance History", `${M}/team/history`, HiCalendar),
            link("Leave Requests", `${M}/requests/leaves`, HiInboxIn),
            link(`${REGULARIZATION}s`, `${M}/requests/regularizations`, HiClipboardList),
            link("Overtime", `${M}/requests/overtime`, HiLightningBolt),
            link("Flags", `${M}/team/anomalies`, HiExclamationCircle),
            link(COMP_OFF, `${M}/requests/comp-offs`, HiGift),
          ],
        },
        {
          title: "PAYROLL",
          icon: HiCurrencyRupee,
          items: [
            link("Variable Pay", `${M}/payroll/adjustments`, HiAdjustments),
            link("Claims & Benefits", `${M}/payroll/reimbursements`, HiReceiptRefund),
            link("Encashments", `${M}/payroll/encashments`, HiCash),
            link("Payslips", `${M}/payroll/team-payslips`, HiDocumentText),
            link("Employee Salaries", `${M}/payroll/team-salary`, HiCurrencyRupee),
          ],
        },
        {
          title: "INSIGHTS",
          icon: HiChartBar,
          forceDropdown: true,
          items: [
            link("Payroll Reports", `${M}/payroll/reports`, HiDocumentReport),
          ],
        },
        {
          title: "ME",
          icon: HiUserCircle,
          defaultCollapsed: true,
          items: [
            ...myAttendanceLinks("manager"),
            link("My Claims & Benefits", `${M}/my-reimbursements`, HiReceiptRefund),
            link("My Salary & Bank", `${M}/my-salary`, HiCurrencyRupee),
            link("My Documents", `${M}/my-documents`, HiFolderOpen),
            link("Company Documents", `${M}/company-documents`, HiOfficeBuilding),
          ],
        },
      ];
    }

    const E = "/dashboard/employee";
    return [
      {
        title: "MAIN",
        flat: true,
        items: [link("Dashboard", E, HiViewGrid)],
      },
      {
        title: "TIME & LEAVE",
        icon: HiClock,
        items: [
          ...myAttendanceLinks("employee"),
          link("My Leaves", `${E}/leaves`, HiCalendar),
        ],
      },
      {
        title: "PAY",
        icon: HiCurrencyRupee,
        items: [
          link("My Salary & Bank", `${E}/payroll/my-salary`, HiCurrencyRupee),
          link("My Payslips", `${E}/payroll/my-payslips`, HiDocumentReport),
          link("My Claims & Benefits", `${E}/payroll/reimbursements`, HiReceiptRefund),
          link("Loans & Variable Pay", `${E}/payroll/loans`, HiAdjustments),
          link("Tax & Investments", `${E}/payroll/tax`, HiScale),
        ],
      },
      {
        title: "DOCUMENTS",
        icon: HiFolderOpen,
        forceDropdown: true,
        items: [
          link("My Documents", `${E}/documents`, HiFolderOpen),
          link("Company Documents", `${E}/company-documents`, HiOfficeBuilding),
        ],
      },
    ];
  };

  const navSections = getNavSections();

  // Flat list of every page in this menu, for the top bar's search, plus the
  // inbox the bell opens. External links (mailto:) are left out.
  const navItems = navSections.flatMap((section) =>
    section.items.flatMap((item) => (item.subItems ? item.subItems : [item]))
      .filter((item) => item.path && !item.external && !item.heading)
      .map((item) => ({ label: item.label, path: item.path, section: section.flat ? "" : section.title })));
  const inboxPath = navItems.find((item) => item.label === "Inbox")?.path;
  const navKey = JSON.stringify(navItems);
  useEffect(() => {
    setNav({ items: JSON.parse(navKey), inbox: inboxPath ? { path: inboxPath, count: inboxCount } : null });
  }, [navKey, inboxPath, inboxCount, setNav]);

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
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
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
          {/* Help lives in the in-app Documents guide; settings (Maya, profile,
              sign-out) live on My Profile. Guests have neither page. */}
          {role !== "guest" && (
            <>
              <Link to="/dashboard/documents" onClick={closeOnMobile} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                <HiQuestionMarkCircle className="w-5 h-5 text-slate-400" />
                <span>Help Center</span>
              </Link>
              <Link to="/dashboard/profile" onClick={closeOnMobile} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                <HiCog className="w-5 h-5 text-slate-400" />
                <span>Settings</span>
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default DashboardSidebar;
